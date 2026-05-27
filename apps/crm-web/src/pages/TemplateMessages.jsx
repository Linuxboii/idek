import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { templatesApi } from '@spacelink/whatsapp-crm'

function bodyText(template) {
  return template?.components?.find(c => c.type === 'BODY')?.text || ''
}

function headerImageHandle(template) {
  const header = template?.components?.find(c => c.type === 'HEADER' && c.format === 'IMAGE')
  if (!header) return null
  const handles = header.example?.header_handle
  return Array.isArray(handles) ? handles[0] : null
}

function paramCount(text) {
  const matches = [...text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)]
  return matches.reduce((max, m) => Math.max(max, Number(m[1]) || 0), 0)
}

function previewText(text, params) {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_, n) => {
    const value = params[Number(n) - 1]
    return value?.trim() || `{{${n}}}`
  })
}

function templateKey(t) {
  return `${t.name}::${t.language}`
}

function guessColumn(headers, candidates) {
  for (const c of candidates) {
    const hit = headers.find(h => h.toLowerCase().includes(c))
    if (hit) return hit
  }
  return headers[0] || ''
}

function cleanPhone(raw) {
  const digits = String(raw ?? '').replace(/\D/g, '')
  return digits.length >= 8 && digits.length <= 15 ? digits : null
}

export default function TemplateMessages() {
  const [templates, setTemplates] = useState([])
  const [selectedKey, setSelectedKey] = useState('')
  const [headerImageUrl, setHeaderImageUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  // Excel contacts
  const [contacts, setContacts] = useState([])       // [{name, phone}]
  const [headers, setHeaders] = useState([])
  const [nameCol, setNameCol] = useState('')
  const [phoneCol, setPhoneCol] = useState('')
  const [extraCols, setExtraCols] = useState([])     // additional param columns
  const [limit, setLimit] = useState(1000)
  const [fileName, setFileName] = useState('')
  const fileRef = useRef(null)

  const selectedTemplate = useMemo(
    () => templates.find(t => templateKey(t) === selectedKey) || null,
    [templates, selectedKey],
  )
  const templateBody = bodyText(selectedTemplate)
  const headerHandle = headerImageHandle(selectedTemplate)
  const nParams = paramCount(templateBody)
  const templateName = selectedTemplate?.name || ''

  const load = async () => {
    setError('')
    setLoading(true)
    try {
      const { data } = await templatesApi.list()
      const approved = data.templates || []
      setTemplates(approved)
      if (!selectedKey && approved[0]) {
        setSelectedKey(templateKey(approved[0]))
      }
    } catch (err) {
      setError(err.message || 'Unable to load templates')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!selectedTemplate) return
    setHeaderImageUrl(headerImageHandle(selectedTemplate) ? 'https://sli.avlokai.com/template-image' : '')
  }, [selectedTemplate])

  const parseExcel = (file) => {
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (!rows.length) { setError('Excel file is empty'); return }
        const cols = Object.keys(rows[0])
        setHeaders(cols)
        const pCol = guessColumn(cols, ['phone', 'mobile', 'number', 'whatsapp', 'contact'])
        const nCol = guessColumn(cols.filter(c => c !== pCol), ['name', 'client', 'customer', 'person', 'lead'])
        setPhoneCol(pCol)
        setNameCol(nCol)
        setExtraCols([])
        setContacts(rows.map(r => {
          const raw = {}
          cols.forEach(c => { raw[c] = String(r[c] ?? '') })
          return raw
        }))
        setError('')
      } catch {
        setError('Failed to parse Excel file')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleFile = (e) => {
    const file = e.target.files?.[0]
    if (file) parseExcel(file)
    e.target.value = ''
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) parseExcel(file)
  }

  // Build contacts list capped by limit with per-row params
  const readyContacts = useMemo(() => {
    return contacts
      .map(row => ({
        phone: cleanPhone(row[phoneCol]),
        name: row[nameCol] || '',
        params: [
          row[nameCol] || '',
          ...extraCols.map(c => row[c] || ''),
        ].slice(0, nParams),
        raw: row,
      }))
      .filter(c => c.phone)
      .slice(0, limit)
  }, [contacts, phoneCol, nameCol, extraCols, nParams, limit])

  const previewParams = readyContacts[0]?.params || Array(nParams).fill('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setResult(null)
    if (!templateName) { setError('Choose a template'); return }
    if (headerHandle && !headerImageUrl.trim()) { setError('Image URL required for this template'); return }
    if (!readyContacts.length) { setError('Upload an Excel file with valid numbers'); return }
    setSending(true)
    try {
      const { data } = await templatesApi.send({
        contacts: readyContacts.map(c => ({ phone: c.phone, params: c.params })),
        template_name: templateName,
        language_code: selectedTemplate?.language || 'en_US',
        ...(headerHandle && headerImageUrl.trim() ? { header_image: headerImageUrl.trim() } : {}),
      })
      setResult(data)
    } catch (err) {
      setError(err.message || 'Send failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="bg-green-600 text-white px-6 py-4 flex items-center justify-between shadow">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-sm opacity-80 hover:opacity-100">&larr; Back</Link>
          <h1 className="font-bold text-lg">Template Messages</h1>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="text-sm bg-green-700 hover:bg-green-800 px-3 py-1.5 rounded-md disabled:opacity-50"
        >
          Refresh
        </button>
      </header>

      <main className="max-w-6xl mx-auto p-6 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        {/* Send form */}
        <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
          <form onSubmit={submit} className="space-y-5">
            {/* Template */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Template</span>
              <select
                value={selectedKey}
                onChange={e => setSelectedKey(e.target.value)}
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                disabled={loading}
              >
                <option value="">— select a template —</option>
                {templates.map(t => (
                  <option key={templateKey(t)} value={templateKey(t)}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </label>

            {/* Header image */}
            {headerHandle && (
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Image URL <span className="text-red-500">*</span></span>
                <input
                  value={headerImageUrl}
                  onChange={e => setHeaderImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="mt-1 text-xs text-slate-500">Publicly accessible URL — used as the template header image</p>
              </label>
            )}

            {/* Excel upload */}
            <div>
              <span className="text-sm font-medium text-slate-700">Recipients (Excel)</span>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="mt-1 border-2 border-dashed border-slate-300 rounded-lg p-6 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors"
              >
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
                {fileName
                  ? <p className="text-sm font-medium text-green-700">{fileName} — {contacts.length} rows</p>
                  : <>
                      <p className="text-sm text-slate-500">Drop .xlsx / .xls / .csv here or click to browse</p>
                      <p className="text-xs text-slate-400 mt-1">Needs columns: phone number + name</p>
                    </>
                }
              </div>
            </div>

            {/* Column mapping */}
            {headers.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Column mapping</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-xs text-slate-600">Phone column</span>
                    <select
                      value={phoneCol}
                      onChange={e => setPhoneCol(e.target.value)}
                      className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Name column → param 1</span>
                    <select
                      value={nameCol}
                      onChange={e => setNameCol(e.target.value)}
                      className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                    >
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                </div>

                {/* Extra params if template has more than 1 */}
                {nParams > 1 && Array.from({ length: nParams - 1 }, (_, i) => i + 2).map(n => (
                  <label key={n} className="block">
                    <span className="text-xs text-slate-600">Param {n} column</span>
                    <select
                      value={extraCols[n - 2] || ''}
                      onChange={e => setExtraCols(prev => {
                        const next = [...prev]
                        next[n - 2] = e.target.value
                        return next
                      })}
                      className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                    >
                      <option value="">— none —</option>
                      {headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}

            {/* Limit */}
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Message limit</span>
              <input
                type="number"
                min={1}
                max={10000}
                value={limit}
                onChange={e => setLimit(Number(e.target.value) || 1)}
                className="mt-1 w-32 border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <span className="ml-2 text-xs text-slate-500">of {contacts.filter(c => cleanPhone(c[phoneCol])).length} valid numbers</span>
            </label>

            {error && <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>}

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-500">{readyContacts.length} will be sent</span>
              <button
                type="submit"
                disabled={sending || loading || !readyContacts.length}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-2 rounded-md disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send template'}
              </button>
            </div>
          </form>
        </section>

        {/* Right column */}
        <aside className="space-y-6">
          {/* Preview */}
          <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold text-slate-800">Preview</h2>
              {selectedTemplate?.category && (
                <span className="text-xs uppercase tracking-wide text-slate-500">{selectedTemplate.category}</span>
              )}
            </div>
            {headerHandle && (
              headerImageUrl.trim()
                ? <img src={headerImageUrl} alt="header" className="mt-4 w-full rounded-lg object-cover max-h-40" onError={e => { e.target.style.display = 'none' }} />
                : <div className="mt-4 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center h-24 text-slate-400 text-xs gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Enter image URL to preview
                  </div>
            )}
            <div className="mt-2 rounded-lg bg-green-50 border border-green-100 p-4 text-sm whitespace-pre-wrap min-h-28">
              {templateBody
                ? previewText(templateBody, previewParams)
                : templateName || 'Select a template'}
            </div>
            {readyContacts.length > 0 && (
              <p className="mt-2 text-xs text-slate-400">Preview uses first contact: {readyContacts[0].name || readyContacts[0].phone}</p>
            )}
          </section>

          {/* Results */}
          {result && (
            <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
              <h2 className="font-semibold text-slate-800">Send Results</h2>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-md bg-slate-50 p-3">
                  <div className="text-xl font-bold">{result.total}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
                <div className="rounded-md bg-green-50 p-3">
                  <div className="text-xl font-bold text-green-700">{result.succeeded}</div>
                  <div className="text-xs text-slate-500">Accepted</div>
                </div>
                <div className="rounded-md bg-red-50 p-3">
                  <div className="text-xl font-bold text-red-700">{result.failed}</div>
                  <div className="text-xs text-slate-500">Failed</div>
                </div>
              </div>
              {result.results?.filter(r => !r.ok).length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-slate-600 mb-2">Failed recipients</p>
                  <ul className="space-y-1 max-h-48 overflow-y-auto">
                    {result.results.filter(r => !r.ok).map(r => (
                      <li key={r.to} className="rounded bg-red-50 border border-red-100 px-3 py-2 text-xs">
                        <span className="font-mono font-medium text-slate-700">{r.to}</span>
                        {r.error && <span className="text-red-600 ml-2">— {r.error}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {/* Contact preview */}
          {readyContacts.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
              <h2 className="font-semibold text-slate-800 mb-3">Contacts preview</h2>
              <div className="overflow-x-auto max-h-64 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-slate-500 border-b border-slate-200 sticky top-0 bg-white">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">#</th>
                      <th className="py-1.5 pr-3 font-medium">Phone</th>
                      <th className="py-1.5 font-medium">Params</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {readyContacts.slice(0, 100).map((c, i) => (
                      <tr key={i}>
                        <td className="py-1.5 pr-3 text-slate-400">{i + 1}</td>
                        <td className="py-1.5 pr-3 font-mono">{c.phone}</td>
                        <td className="py-1.5 text-slate-600">{c.params.join(', ')}</td>
                      </tr>
                    ))}
                    {readyContacts.length > 100 && (
                      <tr>
                        <td className="py-2 text-slate-400 text-center" colSpan={3}>+{readyContacts.length - 100} more</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </aside>
      </main>
    </div>
  )
}
