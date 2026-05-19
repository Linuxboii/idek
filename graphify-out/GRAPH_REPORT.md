# Graph Report - .  (2026-05-14)

## Corpus Check
- Corpus is ~6,343 words - fits in a single context window. You may not need a graph.

## Summary
- 128 nodes · 173 edges · 11 communities (10 shown, 1 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.88)
- Token cost: 60,000 input · 10,591 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Agent + Calendar Orchestration|Agent + Calendar Orchestration]]
- [[_COMMUNITY_Template Job Database Layer|Template Job Database Layer]]
- [[_COMMUNITY_Delivery Tracking + Docs|Delivery Tracking + Docs]]
- [[_COMMUNITY_Calendar Client Internals|Calendar Client Internals]]
- [[_COMMUNITY_Templates REST API|Templates REST API]]
- [[_COMMUNITY_Lead Extraction Pipeline|Lead Extraction Pipeline]]
- [[_COMMUNITY_WhatsApp Cloud API Client|WhatsApp Cloud API Client]]
- [[_COMMUNITY_FastAPI App + Deploy|FastAPI App + Deploy]]
- [[_COMMUNITY_Agent Chat Internals|Agent Chat Internals]]

## God Nodes (most connected - your core abstractions)
1. `pipeline.handle_message` - 18 edges
2. `pool()` - 11 edges
3. `FastAPI app (main)` - 9 edges
4. `template_sends table` - 6 edges
5. `update_lead_extraction()` - 5 edges
6. `handle_message()` - 5 edges
7. `_auth()` - 5 edges
8. `Settings (pydantic)` - 5 edges
9. `Meta WhatsApp Cloud Graph API` - 5 edges
10. `send_template_bulk()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `docker-compose services` --references--> `FastAPI app (main)`  [INFERRED]
  docker-compose.yml → app/main.py
- `CLAUDE.md project memory` --references--> `FastAPI app (main)`  [EXTRACTED]
  CLAUDE.md → app/main.py
- `README` --references--> `pipeline.handle_message`  [EXTRACTED]
  README.md → app/pipeline.py
- `README` --references--> `FastAPI app (main)`  [EXTRACTED]
  README.md → app/main.py
- `docker-compose services` --references--> `leads table`  [EXTRACTED]
  docker-compose.yml → schema.sql

## Hyperedges (group relationships)
- **Inbound WhatsApp message processing flow** — main_webhook_receive, pipeline_handle_message, extractor_extract, agent_chat, whatsapp_send_text [EXTRACTED 1.00]
- **Template broadcast + delivery tracking** — templates_api_send_bulk, whatsapp_send_template, db_insert_template_send, db_update_status_by_wamid, schema_templates_sends [EXTRACTED 1.00]
- **Scheduling JSON to Google Meet creation** — pipeline_extract_schedule_json, calendar_build_iso_range, calendar_create_event, calendar_hangout_link, whatsapp_send_text [EXTRACTED 1.00]

## Communities (11 total, 1 thin omitted)

### Community 0 - "Agent + Calendar Orchestration"
Cohesion: 0.09
Nodes (29): agent.build_system, agent.chat, agent.format_history, agent.transcribe, calendar_client.build_iso_range, calendar_client.create_event, calendar_client.hangout_link, Ananya / Level Up persona (+21 more)

### Community 1 - "Template Job Database Layer"
Cohesion: 0.17
Nodes (18): _coerce_budget_int(), _coerce_facing(), _coerce_size_int(), create_template_job(), get_job(), get_lead_state(), get_recent_messages(), insert_message() (+10 more)

### Community 2 - "Delivery Tracking + Docs"
Cohesion: 0.14
Nodes (18): CLAUDE.md project memory, Delivery status lifecycle, db.create_template_job, db.get_job, db.insert_template_send, db.list_jobs, db.update_status_by_wamid, _safe_handle (+10 more)

### Community 3 - "Calendar Client Internals"
Cohesion: 0.13
Nodes (4): create_event(), _service(), Settings, BaseSettings

### Community 4 - "Templates REST API"
Cohesion: 0.3
Nodes (11): _auth(), _clean_phone(), get_job(), list_jobs(), list_templates(), _send_one(), send_template_bulk(), SendResult (+3 more)

### Community 5 - "Lead Extraction Pipeline"
Cohesion: 0.36
Nodes (5): extract(), _clean_outgoing(), _extract_schedule_json(), handle_message(), Entry point for a WhatsApp `messages` webhook payload (value object).

### Community 6 - "WhatsApp Cloud API Client"
Cohesion: 0.32
Nodes (5): get_templates(), _headers(), Fetch approved message templates from Meta Graph API., send_template(), send_text()

### Community 7 - "FastAPI App + Deploy"
Cohesion: 0.29
Nodes (8): db.close_pool, db.init_pool, PM2 wa-agent app, FastAPI app (main), README, Admin UI (index.html), templates_api router, Vite dev server config

## Knowledge Gaps
- **21 isolated node(s):** `leads.facing CHECK only allows east/west/north/south. Drop composite facings.`, `leads.size_preference is INTEGER. If string range like '1800-2200', use midpoint`, `leads.budget_min/max are INTEGER. Extractor emits crore floats — store as lakhs`, `Entry point for a WhatsApp `messages` webhook payload (value object).`, `Fetch approved message templates from Meta Graph API.` (+16 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `pipeline.handle_message` connect `Agent + Calendar Orchestration` to `Delivery Tracking + Docs`, `FastAPI App + Deploy`?**
  _High betweenness centrality (0.101) - this node is a cross-community bridge._
- **Why does `FastAPI app (main)` connect `FastAPI App + Deploy` to `Agent + Calendar Orchestration`, `Delivery Tracking + Docs`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **What connects `leads.facing CHECK only allows east/west/north/south. Drop composite facings.`, `leads.size_preference is INTEGER. If string range like '1800-2200', use midpoint`, `leads.budget_min/max are INTEGER. Extractor emits crore floats — store as lakhs` to the rest of the system?**
  _21 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Agent + Calendar Orchestration` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Delivery Tracking + Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Calendar Client Internals` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._