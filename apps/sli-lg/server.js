import express from "express";
import pkg from "pg";
import cors from "cors";
import dotenv from "dotenv";
import ExcelJS from "exceljs";
import multer from "multer";

dotenv.config();

const { Pool } = pkg;

const upload = multer({ storage: multer.memoryStorage() });

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS imported TEXT DEFAULT 'no';").catch(err => console.error("Migration error:", err));

const leadSelectWithFirstReceivedAt = `
  SELECT
    leads.*,
    (SELECT COUNT(*) FROM messages WHERE lead_id = leads.id) AS exact_message_count,
    (SELECT COUNT(*) FROM messages WHERE lead_id = leads.id AND role = 'user') AS messages_received,
    (SELECT COUNT(*) FROM messages WHERE lead_id = leads.id AND role != 'user') AS messages_sent,
    COALESCE(first_user_message.created_at, first_message.created_at, leads.created_at) AS first_received_at
  FROM leads
  LEFT JOIN LATERAL (
    SELECT created_at
    FROM messages
    WHERE messages.lead_id = leads.id
      AND messages.role = 'user'
      AND messages.created_at IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  ) first_user_message ON true
  LEFT JOIN LATERAL (
    SELECT created_at
    FROM messages
    WHERE messages.lead_id = leads.id
      AND messages.created_at IS NOT NULL
    ORDER BY created_at ASC
    LIMIT 1
  ) first_message ON true
`;

function stripTimeFromExportValue(value) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  }

  if (typeof value !== "string") {
    return value;
  }

  const trimmedValue = value.trim();
  const timestampMatch = trimmedValue.match(/^(\d{4}-\d{2}-\d{2})(?:[ T].*)$/);

  if (timestampMatch) {
    return timestampMatch[1];
  }

  return value;
}

function normalizeExportRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, stripTimeFromExportValue(value)])
  );
}


// =======================
// HEALTH CHECK
// =======================
app.get("/", (req, res) => {
  res.json({ status: "API running" });
});


// =======================
// CREATE / UPSERT LEAD (WITH SOURCE)
// =======================
app.post("/leads", async (req, res) => {
  try {
    let {
      name,
      phone,
      source,
      campaign,
      adset,
      ad,
      source_raw
    } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone is required" });
    }

    // normalize phone (last 10 digits)
    const cleanPhone = phone.replace(/\D/g, "").slice(-10);

    const result = await pool.query(
      `
      INSERT INTO leads (
        name,
        phone,
        source,
        campaign,
        adset,
        ad,
        source_raw,
        last_message_at,
        message_count
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),1)

      ON CONFLICT (phone)
      DO UPDATE SET
        name = COALESCE(EXCLUDED.name, leads.name),
        last_message_at = NOW(),
        message_count = leads.message_count + 1

      -- DO NOT overwrite source if already set
      WHERE leads.source IS NULL OR leads.source = 'unknown'

      RETURNING *;
      `,
      [
        name || null,
        cleanPhone,
        source || "unknown",
        campaign || null,
        adset || null,
        ad || null,
        source_raw || null
      ]
    );

    res.json(result.rows[0]);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create/update lead" });
  }
});


// =======================
// GET ALL LEADS
// =======================
app.get("/leads", async (req, res) => {
  try {
    const result = await pool.query(`
      ${leadSelectWithFirstReceivedAt}
      ORDER BY leads.last_message_at DESC NULLS LAST
    `);

    // Fetch all insights and merge them into the leads
    const leadIds = result.rows.map(r => r.id);
    if (leadIds.length > 0) {
      const insightsResult = await pool.query(
        `SELECT * FROM lead_insights WHERE lead_id = ANY($1)`,
        [leadIds]
      );
      
      const insightsMap = {};
      insightsResult.rows.forEach(row => {
        // remove overlapping ids from insight row so they don't overwrite lead fields
        delete row.id;
        delete row.created_at;
        delete row.updated_at;
        insightsMap[row.lead_id] = row;
      });
      
      result.rows.forEach(row => {
        if (insightsMap[row.id]) {
          Object.assign(row, insightsMap[row.id]);
        }
      });
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch leads" });
  }
});

// =======================
// GET SINGLE LEAD + MESSAGES
// =======================
app.get("/leads/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await pool.query(
      `${leadSelectWithFirstReceivedAt} WHERE leads.id = $1`,
      [id]
    );

    const messages = await pool.query(
      `SELECT * FROM messages WHERE lead_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    res.json({
      lead: lead.rows[0],
      messages: messages.rows,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch lead data" });
  }
});


// =======================
// GET LEAD INSIGHTS
// =======================
app.get("/insights/:lead_id", async (req, res) => {
  const { lead_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM lead_insights WHERE lead_id = $1`,
      [lead_id]
    );

    res.json(result.rows[0] || {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch insights" });
  }
});


// =======================
// GET SIGNAL LOG
// =======================
app.get("/signals/:lead_id", async (req, res) => {
  const { lead_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT * FROM lead_signal_log WHERE lead_id = $1 ORDER BY created_at DESC`,
      [lead_id]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch signals" });
  }
});


// =======================
// SEARCH LEADS (optional)
// =======================
app.get("/search", async (req, res) => {
  const { q } = req.query;

  try {
    const result = await pool.query(
      `${leadSelectWithFirstReceivedAt}
       WHERE leads.phone ILIKE $1 OR leads.name ILIKE $1
       ORDER BY leads.last_message_at DESC`,
      [`%${q}%`]
    );

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});


// =======================
// IMPORT LEADS FROM EXCEL
// =======================
app.post("/import-leads", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      return res.status(400).json({ error: "Empty workbook" });
    }

    const expectedFields = [
      "name", "phone", "campaign", "adset", "ad", "source", "source_raw", 
      "budget_min", "budget_max", "budget_estimate", "preferred_locations", 
      "size_preference", "facing"
    ];

    const headers = [];
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = String(cell.value || "").trim().toLowerCase();
    });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      
      let insertedCount = 0;
      let skippedCount = 0;
      
      for (let i = 2; i <= worksheet.rowCount; i++) {
        const row = worksheet.getRow(i);
        const data = {};
        
        expectedFields.forEach(field => {
          let colIndex = headers.indexOf(field);
          if (colIndex === -1) {
             if (field === 'phone') colIndex = headers.findIndex(h => h && (h.includes('phone') || h.includes('mobile') || h.includes('contact')));
             else if (field === 'name') colIndex = headers.findIndex(h => h && h.includes('name'));
             else if (field === 'campaign') colIndex = headers.findIndex(h => h && h.includes('campaign'));
             else if (field === 'source') colIndex = headers.findIndex(h => h && (h === 'source' || h.includes('medium')));
          }
          let val = colIndex > 0 ? row.getCell(colIndex).value : undefined;
          // Handle rich text or formula cells
          if (val && typeof val === "object") {
            if (val.richText) val = val.richText.map(rt => rt.text).join("");
            else if (val.result !== undefined) val = val.result;
            else val = String(val);
          }
          if (val === null || val === undefined || val === '') {
            val = "not enriched";
          }
          data[field] = String(val).trim();
        });

        if (data.phone === "not enriched") { skippedCount++; continue; } 
        
        const cleanPhone = data.phone.replace(/\D/g, "").slice(-10);
        if (!cleanPhone || cleanPhone.length < 10) { skippedCount++; continue; }

        await client.query(
          `
          INSERT INTO leads (
            name, phone, source, campaign, adset, ad, source_raw, 
            last_message_at, message_count, imported
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),1,'yes')
          ON CONFLICT (phone)
          DO UPDATE SET
            name = COALESCE(EXCLUDED.name, leads.name),
            source = COALESCE(EXCLUDED.source, leads.source),
            campaign = COALESCE(EXCLUDED.campaign, leads.campaign),
            adset = COALESCE(EXCLUDED.adset, leads.adset),
            ad = COALESCE(EXCLUDED.ad, leads.ad),
            source_raw = COALESCE(EXCLUDED.source_raw, leads.source_raw),
            imported = 'yes',
            last_message_at = NOW()
          `,
          [
            data.name, cleanPhone, data.source, data.campaign, data.adset, data.ad, data.source_raw
          ]
        );
        insertedCount++;
      }
      
      await client.query("COMMIT");
      res.json({ success: true, message: `Imported ${insertedCount} leads (Skipped ${skippedCount})` });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ error: "Failed to import leads: " + (err.message || String(err)) });
  }
});


// =======================
// EXPORT LEADS TO EXCEL
// =======================
app.post("/export-leads", async (req, res) => {
  try {
    const rows = Array.isArray(req.body) ? req.body : [];

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Leads");

    const headers = Object.keys(rows[0] || {});
    const statusHeader = headers.find((header) => header.toLowerCase() === "status");
    sheet.columns = headers.map((header) => ({ header, key: header, width: 20 }));

    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1F2937" },
      };
    });

    rows.forEach((row, index) => {
      const excelRow = sheet.addRow(normalizeExportRow(row));
      const bg = index % 2 === 0 ? "FFF9FAFB" : "FFFFFFFF";

      excelRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
      });

      if (statusHeader) {
        const statusCell = excelRow.getCell(statusHeader);
        const status = String(statusCell.value || "").toLowerCase();

        if (status === "hot") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFC7CE" } };
        } else if (status === "warm") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB9C" } };
        } else if (status === "cold") {
          statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        }
      }
    });

    if (headers.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: headers.length },
      };
    }

    sheet.views = [{ state: "frozen", ySplit: 1 }];

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=leads.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to export leads" });
  }
});


// =======================
// START SERVER
// =======================
app.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
