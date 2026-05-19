import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getHealth, getLeadDetail, getLeads, searchLeads, importLeads } from '../lib/api'
import { clearAdminAuthentication } from '../lib/auth'
import * as XLSX from 'xlsx'
import WhatsAppDrawer from '../whatsapp-crm/WhatsAppDrawer'

const statusStyles = {
  hot: 'bg-red-50 text-red-700 border-red-200',
  warm: 'bg-amber-50 text-amber-700 border-amber-200',
  cold: 'bg-slate-100 text-slate-700 border-slate-200',
}

const EMPTY_DETAIL_STATE = {
  loading: false,
  error: '',
  lead: null,
  messages: [],
}

const LEAD_EXPORT_HEADERS = ['created_at', 'updated_at', 'name', 'number', 'location', 'status', 'summary of the message']

export function AdminPage() {
  const navigate = useNavigate()
  const leadItemRefs = useRef(new Map())
  const conversationSectionRef = useRef(null)
  const [health, setHealth] = useState({ loading: true, error: '', status: '' })
  const [searchQuery, setSearchQuery] = useState('')
  const [leadsState, setLeadsState] = useState({ loading: true, error: '', items: [] })
  const [selectedLeadId, setSelectedLeadId] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [activeSourceFilter, setActiveSourceFilter] = useState('all')
  const [detailState, setDetailState] = useState(EMPTY_DETAIL_STATE)
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')
  const [isMobileDetailOpen, setIsMobileDetailOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [exportMessage, setExportMessage] = useState(null)
  const [exportDateRange, setExportDateRange] = useState(getDefaultExportDateRange)
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    let ignore = false

    async function loadHealth() {
      try {
        const response = await getHealth()

        if (!ignore) {
          setHealth({
            loading: false,
            error: '',
            status: response?.status ?? 'API running',
          })
        }
      } catch (error) {
        if (!ignore) {
          setHealth({
            loading: false,
            error: error.message ?? 'Unable to reach the external API.',
            status: '',
          })
        }
      }
    }

    loadHealth()

    return () => {
      ignore = true
    }
  }, [refreshKey])

  useEffect(() => {
    let ignore = false

    async function loadLeads() {
      setLeadsState((current) => ({ ...current, loading: true, error: '' }))

      try {
        const items = searchQuery.trim() ? await searchLeads(searchQuery) : await getLeads()

        if (!ignore) {
          setLeadsState({ loading: false, error: '', items })
        }
      } catch (error) {
        if (!ignore) {
          setLeadsState({
            loading: false,
            error: error.message ?? 'Unable to load leads.',
            items: [],
          })
        }
      }
    }

    const timeoutId = window.setTimeout(loadLeads, searchQuery.trim() ? 250 : 0)

    return () => {
      ignore = true
      window.clearTimeout(timeoutId)
    }
  }, [refreshKey, searchQuery])

  const stats = useMemo(() => {
    return leadsState.items.reduce(
      (summary, lead) => {
        const status = getLeadTemperature(lead.score)

        summary.total += 1
        summary.escalated += lead.escalated ? 1 : 0
        summary.scoreTotal += Number(lead.score ?? 0)

        if (status === 'hot') {
          summary.hot += 1
        } else if (status === 'warm') {
          summary.warm += 1
        } else {
          summary.cold += 1
        }

        return summary
      },
      { total: 0, hot: 0, warm: 0, cold: 0, escalated: 0, scoreTotal: 0 },
    )
  }, [leadsState.items])

  const sourceFilterOptions = useMemo(() => {
    const sourceCounts = leadsState.items.reduce((counts, lead) => {
      const sourceKey = getLeadSourceKey(lead)
      const current = counts.get(sourceKey) ?? {
        key: sourceKey,
        label: formatLeadSource(lead?.source),
        count: 0,
      }

      current.count += 1
      counts.set(sourceKey, current)

      return counts
    }, new Map())

    return [
      { key: 'all', label: 'All sources', count: leadsState.items.length },
      ...Array.from(sourceCounts.values()).sort((first, second) => first.label.localeCompare(second.label)),
    ]
  }, [leadsState.items])

  const filteredLeads = useMemo(() => {
    return leadsState.items.filter((lead) => {
      const matchesStatus = activeFilter === 'all' || getLeadTemperature(lead.score) === activeFilter
      const matchesSource = activeSourceFilter === 'all' || getLeadSourceKey(lead) === activeSourceFilter

      return matchesStatus && matchesSource
    })
  }, [activeFilter, activeSourceFilter, leadsState.items])

  const activeLeadId = useMemo(() => {
    if (filteredLeads.length === 0) {
      return ''
    }

    return filteredLeads.some((lead) => lead.id === selectedLeadId) ? selectedLeadId : filteredLeads[0].id
  }, [filteredLeads, selectedLeadId])

  useEffect(() => {
    if (!activeLeadId) {
      return
    }

    let ignore = false

    async function loadLeadDetail() {
      setDetailState({ ...EMPTY_DETAIL_STATE, loading: true, error: '' })

      try {
        const detail = await getLeadDetail(activeLeadId)

        if (!ignore) {
          setDetailState({
            loading: false,
            error: '',
            lead: detail?.lead ?? null,
            messages: Array.isArray(detail?.messages) ? detail.messages : [],
          })
        }
      } catch (error) {
        if (!ignore) {
          setDetailState({
            ...EMPTY_DETAIL_STATE,
            error: error.message ?? 'Unable to load this lead.',
          })
        }
      }
    }

    loadLeadDetail()

    return () => {
      ignore = true
    }
  }, [activeLeadId])

  useEffect(() => {
    if (!activeLeadId) {
      return
    }

    const activeLeadNode = leadItemRefs.current.get(activeLeadId)
    activeLeadNode?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeLeadId, leadsState.items.length])

  useEffect(() => {
    if (activeTab !== 'chat' || !activeLeadId) {
      return
    }

    conversationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeLeadId, activeTab, detailState.messages.length])

  const detailViewState = activeLeadId ? detailState : EMPTY_DETAIL_STATE
  const averageScore = stats.total > 0 ? (stats.scoreTotal / stats.total).toFixed(1) : '0.0'
  const selectedLead = detailViewState.lead ?? filteredLeads.find((lead) => lead.id === activeLeadId) ?? null
  const selectedLeadTemperature = selectedLead ? getLeadTemperature(selectedLead.score) : 'cold'
  const showConversation = activeTab === 'chat'
  const exportDateRangeError = getExportDateRangeError(exportDateRange)
  const exportLeads = useMemo(() => {
    if (exportDateRangeError) {
      return []
    }

    return filterLeadsByFirstReceivedAt(filteredLeads, exportDateRange)
  }, [exportDateRange, exportDateRangeError, filteredLeads])

  function handleLogout() {
    clearAdminAuthentication()
    navigate('/login', { replace: true })
  }

  function handleSelectLead(leadId) {
    setSelectedLeadId(leadId)
    setActiveTab('overview')
    setIsMobileDetailOpen(true)
  }

  function handleBackToList() {
    setIsMobileDetailOpen(false)
  }

  function handleSelectFilter(filterKey) {
    setActiveFilter(filterKey)
    setIsMobileDetailOpen(false)
  }

  function handleSelectSourceFilter(sourceKey) {
    setActiveSourceFilter(sourceKey)
    setIsMobileDetailOpen(false)
  }

  async function handleImport(event) {
    const file = event.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const result = await importLeads(file)
      setExportMessage(result.message || 'Imported successfully')
      setTimeout(() => setExportMessage(null), 5000)
      setRefreshKey((value) => value + 1)
    } catch (err) {
      console.error('Import error:', err)
      setExportMessage('Import failed: ' + err.message)
      setTimeout(() => setExportMessage(null), 5000)
    } finally {
      setIsImporting(false)
      event.target.value = ''
    }
  }

  function handleQuickDownload() {
    const leads = exportLeads
    if (!leads.length) return

    try {
      const payload = leads.map((lead) => buildLeadExportRow(lead))

      const worksheet = XLSX.utils.json_to_sheet(payload, { header: LEAD_EXPORT_HEADERS })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads')

      const dateString = new Date().toISOString().split('T')[0]
      XLSX.writeFile(workbook, `leads_quick_${dateString}.xlsx`)

      setExportMessage(`Downloaded ${leads.length} leads`)
      setTimeout(() => setExportMessage(null), 3000)
    } catch (err) {
      console.error('Download failed:', err)
      setExportMessage('Download failed')
      setTimeout(() => setExportMessage(null), 3000)
    }
  }

  async function handleExport() {
    if (exportDateRangeError) {
      setExportMessage(exportDateRangeError)
      setTimeout(() => setExportMessage(null), 3000)
      return
    }

    const leads = exportLeads
    if (!leads.length || isExporting) return

    setIsExporting(true)
    try {
      const payload = []

      for (const lead of leads) {
        let detail = null
        let chats = ''

        if ((lead.exact_message_count ?? lead.message_count ?? 0) > 0) {
          try {
            detail = await getLeadDetail(lead.id)
            if (detail?.messages?.length > 0) {
              chats = detail.messages
                .map(
                  (message) =>
                    `[${formatExportDate(message.created_at)}] ${
                      message.role === 'user' ? 'Lead' : 'Assistant'
                    }: ${message.message_text}`,
                )
                .join('\n')
            }
          } catch {
            chats = 'Error fetching chat'
          }
        }

        payload.push(buildLeadExportRow(detail?.lead ?? lead, { messages: detail?.messages, chats }))
      }

      const worksheet = XLSX.utils.json_to_sheet(payload, { header: LEAD_EXPORT_HEADERS })
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads')

      const dateString = new Date().toISOString().split('T')[0]
      XLSX.writeFile(workbook, `leads_export_${dateString}.xlsx`)

      setExportMessage('Exported successfully')
      setTimeout(() => setExportMessage(null), 3000)
    } catch (err) {
      console.error('Export failed:', err)
      setExportMessage('Export failed')
      setTimeout(() => setExportMessage(null), 3000)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      <MobileAdminDashboard
        activeFilter={activeFilter}
        activeLeadId={activeLeadId}
        activeSourceFilter={activeSourceFilter}
        activeTab={activeTab}
        averageScore={averageScore}
        detailViewState={detailViewState}
        exportDateRange={exportDateRange}
        exportDateRangeError={exportDateRangeError}
        exportLeadsCount={exportLeads.length}
        exportOpen={exportOpen}
        filteredCount={filteredLeads.length}
        health={health}
        isExporting={isExporting}
        isImporting={isImporting}
        isMobileDetailOpen={isMobileDetailOpen}
        leadsState={leadsState}
        onBackToList={handleBackToList}
        onExport={handleExport}
        onExportDateRangeChange={setExportDateRange}
        onImport={handleImport}
        onLogout={handleLogout}
        onQuickDownload={handleQuickDownload}
        onRefresh={() => setRefreshKey((value) => value + 1)}
        onSelectFilter={handleSelectFilter}
        onSelectLead={handleSelectLead}
        onSelectSourceFilter={handleSelectSourceFilter}
        onSelectTab={setActiveTab}
        onToggleExport={() => setExportOpen((v) => !v)}
        searchQuery={searchQuery}
        selectedLead={selectedLead}
        selectedLeadTemperature={selectedLeadTemperature}
        setSearchQuery={setSearchQuery}
        showConversation={showConversation}
        sourceFilterOptions={sourceFilterOptions}
        stats={stats}
        visibleLeads={filteredLeads}
      />

      <div className="crm-admin-desktop-layout">
        <AppTopbar
          health={health}
          exportOpen={exportOpen}
          onToggleExport={() => setExportOpen((v) => !v)}
          onRefresh={() => setRefreshKey((value) => value + 1)}
          onLogout={handleLogout}
        />

        {exportOpen && (
          <div className="crm-export-panel">
            <div className="shell py-4">
              <ExportControls
                activeSourceFilter={activeSourceFilter}
                exportDateRange={exportDateRange}
                exportDateRangeError={exportDateRangeError}
                exportLeadsCount={exportLeads.length}
                isExporting={isExporting}
                isImporting={isImporting}
                onExport={handleExport}
                onImport={handleImport}
                onQuickDownload={handleQuickDownload}
                onExportDateRangeChange={setExportDateRange}
                onSelectSourceFilter={handleSelectSourceFilter}
                sourceFilterOptions={sourceFilterOptions}
              />
            </div>
          </div>
        )}

        <div className="crm-admin-body shell">
          <div className={`crm-dashboard-grid ${isMobileDetailOpen ? 'crm-mobile-detail-open' : ''}`}>
            <LeadSidebar
              activeLeadId={activeLeadId}
              selectedLead={selectedLead}
              activeFilter={activeFilter}
              activeSourceFilter={activeSourceFilter}
              filteredCount={filteredLeads.length}
              leadItemRefs={leadItemRefs}
              leadsState={leadsState}
              onCloseMobileDetail={handleBackToList}
              onSelectLead={handleSelectLead}
              onSelectSourceFilter={handleSelectSourceFilter}
              searchQuery={searchQuery}
              setActiveFilter={handleSelectFilter}
              setSearchQuery={setSearchQuery}
              sourceFilterOptions={sourceFilterOptions}
              stats={stats}
              visibleLeads={filteredLeads}
            />

            <LeadWorkspace
              conversationSectionRef={conversationSectionRef}
              detailViewState={detailViewState}
              onBackToList={handleBackToList}
              onSelectTab={setActiveTab}
              selectedLead={selectedLead}
              selectedLeadTemperature={selectedLeadTemperature}
              showConversation={showConversation}
              activeTab={activeTab}
            />
          </div>
        </div>

        {exportMessage && (
          <div className="fixed bottom-6 right-6 z-50 rounded-2xl bg-brand-ink px-6 py-4 text-sm font-medium text-white shadow-xl">
            {exportMessage}
          </div>
        )}
      </div>
    </>
  )
}

function AppTopbar({ health, exportOpen, onToggleExport, onRefresh, onLogout }) {
  return (
    <header className="crm-topbar">
      <div className="crm-topbar-inner shell">
        <div className="crm-topbar-brand">
          <span className="crm-topbar-logo">SL</span>
          <span className="crm-topbar-name">
            SpaceLink <strong>CRM</strong>
          </span>
        </div>

        <nav className="crm-topbar-actions">
          <HealthBadge health={health} />
          <button className="crm-topbar-btn" onClick={onRefresh} type="button">
            Refresh
          </button>
          <button
            className={`crm-topbar-btn ${exportOpen ? 'crm-topbar-btn-active' : ''}`}
            onClick={onToggleExport}
            type="button"
          >
            {exportOpen ? 'Hide Export' : 'Export ↓'}
          </button>
          <Link className="crm-topbar-btn" to="/">
            Home
          </Link>
          <button className="crm-topbar-btn crm-topbar-btn-muted" onClick={onLogout} type="button">
            Sign out
          </button>
        </nav>
      </div>
    </header>
  )
}

function MobileAdminDashboard({
  activeFilter,
  activeLeadId,
  activeSourceFilter,
  activeTab,
  averageScore,
  detailViewState,
  exportDateRange,
  exportDateRangeError,
  exportLeadsCount,
  exportOpen,
  filteredCount,
  health,
  isExporting,
  isImporting,
  isMobileDetailOpen,
  leadsState,
  onBackToList,
  onExport,
  onExportDateRangeChange,
  onImport,
  onLogout,
  onQuickDownload,
  onRefresh,
  onSelectFilter,
  onSelectLead,
  onSelectSourceFilter,
  onSelectTab,
  onToggleExport,
  searchQuery,
  selectedLead,
  selectedLeadTemperature,
  setSearchQuery,
  showConversation,
  sourceFilterOptions,
  stats,
  visibleLeads,
}) {
  const filters = [
    { key: 'all', label: 'All', count: leadsState.items.length },
    { key: 'hot', label: 'Priority', count: stats.hot },
    { key: 'warm', label: 'Active', count: stats.warm },
    { key: 'cold', label: 'Others', count: stats.cold },
  ]
  const leadPhone = normalizePhoneNumber(selectedLead?.phone)
  const whatsappLink = leadPhone ? `https://wa.me/${leadPhone}` : ''

  return (
    <div className="crm-mobile-admin">
      {!isMobileDetailOpen ? (
        <>
          <header className="crm-mobile-admin-top">
            <div>
              <p>SpaceLink CRM</p>
              <h1>Leads</h1>
            </div>
            <div className="crm-mobile-admin-actions">
              <HealthBadge health={health} />
              <button type="button" onClick={onRefresh}>Refresh</button>
              <button type="button" onClick={onToggleExport}>{exportOpen ? 'Hide Export' : 'Export'}</button>
              <button type="button" onClick={onLogout}>Sign out</button>
            </div>
          </header>

          {exportOpen && (
            <section className="crm-mobile-export">
              <div className="crm-mobile-export-dates">
                <label>
                  From
                  <ExportDateField
                    label="From"
                    value={exportDateRange.from}
                    onChange={(value) => onExportDateRangeChange((current) => ({ ...current, from: value }))}
                  />
                </label>
                <label>
                  To
                  <ExportDateField
                    label="To"
                    value={exportDateRange.to}
                    onChange={(value) => onExportDateRangeChange((current) => ({ ...current, to: value }))}
                  />
                </label>
                <label className="crm-mobile-source-field">
                  Source
                  <select value={activeSourceFilter} onChange={(event) => onSelectSourceFilter(event.target.value)}>
                    {sourceFilterOptions.map((sourceOption) => (
                      <option key={sourceOption.key} value={sourceOption.key}>
                        {sourceOption.label} ({sourceOption.count})
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="crm-mobile-export-actions">
                <button type="button" onClick={onQuickDownload} disabled={Boolean(exportDateRangeError) || exportLeadsCount === 0}>
                  Download XLSX
                </button>
                <button type="button" onClick={onExport} disabled={isExporting || Boolean(exportDateRangeError) || exportLeadsCount === 0}>
                  {isExporting ? 'Exporting...' : `Export + Chats (${exportLeadsCount})`}
                </button>
                <input id="mobile-import-upload" type="file" accept=".xlsx" className="hidden" onChange={onImport} disabled={isImporting} />
                <label htmlFor="mobile-import-upload">{isImporting ? 'Importing...' : 'Import XLSX'}</label>
              </div>
              <p>{exportDateRangeError || `${exportLeadsCount} matching first received date`}</p>
            </section>
          )}

          <section className="crm-mobile-stats">
            <button type="button" className={activeFilter === 'all' ? 'active' : ''} onClick={() => onSelectFilter('all')}><span>All</span><strong>{stats.total}</strong></button>
            <button type="button" className={activeFilter === 'hot' ? 'active' : ''} onClick={() => onSelectFilter('hot')}><span>Priority</span><strong>{stats.hot}</strong></button>
            <button type="button" className={activeFilter === 'warm' ? 'active' : ''} onClick={() => onSelectFilter('warm')}><span>Active</span><strong>{stats.warm}</strong></button>
            <button type="button" className={activeFilter === 'cold' ? 'active' : ''} onClick={() => onSelectFilter('cold')}><span>Others</span><strong>{stats.cold}</strong></button>
            <div><span>Escalated</span><strong>{stats.escalated}</strong></div>
            <div><span>Avg</span><strong>{averageScore}</strong></div>
          </section>

          <section className="crm-mobile-list-shell">
            <div className="crm-mobile-list-tools">
              <div className="crm-mobile-list-title">
                <div>
                  <span>People</span>
                  <h2>Lead list</h2>
                </div>
                <strong>{filteredCount}</strong>
              </div>
              <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name or number" />
              <div className="crm-mobile-filter-row">
                {filters.map((filterOption) => (
                  <button key={filterOption.key} type="button" className={activeFilter === filterOption.key ? 'active' : ''} onClick={() => onSelectFilter(filterOption.key)}>
                    {filterOption.label} <span>{filterOption.count}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="crm-mobile-lead-list">
              {leadsState.loading ? <EmptyState message="Loading..." /> : null}
              {!leadsState.loading && leadsState.error ? <ErrorState message={leadsState.error} /> : null}
              {!leadsState.loading && !leadsState.error && visibleLeads.length === 0 ? <EmptyState message={searchQuery.trim() ? 'No matches' : 'No leads'} /> : null}
              {!leadsState.loading && !leadsState.error
                ? visibleLeads.map((lead) => {
                    const displayLead = lead.id === activeLeadId && selectedLead ? selectedLead : lead
                    const leadTemperature = getLeadTemperature(displayLead.score)
                    return (
                      <button key={lead.id} type="button" className="crm-mobile-lead-row" onClick={() => onSelectLead(lead.id)}>
                        <div className="crm-avatar">{getInitials(displayLead.name)}</div>
                        <div>
                          <div className="crm-mobile-lead-main">
                            <strong>{safeText(displayLead.name, 'Unknown lead')}</strong>
                            <span className={statusStyles[leadTemperature] ?? statusStyles.cold}>{formatTemperatureLabel(leadTemperature)}</span>
                          </div>
                          <p>{safeText(displayLead.phone, 'Phone unavailable')}</p>
                          <div className="crm-mobile-lead-metrics">
                            <span>Score {displayLead.score ?? 0}</span>
                            <span>In {displayLead.messages_received ?? 0}</span>
                            <span>Out {displayLead.messages_sent ?? 0}</span>
                            <span>{formatShortDate(displayLead.last_message_at)}</span>
                          </div>
                          <div className="crm-mobile-lead-meta">
                            <span>{formatBudgetRange(displayLead)}</span>
                            <span>{formatLeadSource(displayLead.source)}</span>
                          </div>
                        </div>
                      </button>
                    )
                  })
                : null}
            </div>
          </section>
        </>
      ) : selectedLead ? (
        <>
          <header className="crm-mobile-detail-top">
            <button type="button" onClick={onBackToList}>← Back</button>
            <div className="crm-avatar crm-avatar-lg">{getInitials(selectedLead.name)}</div>
            <div>
              <h1>{safeText(selectedLead.name, 'Unknown lead')}</h1>
              <p>{safeText(selectedLead.phone, 'Unavailable')}</p>
            </div>
            <span className={statusStyles[selectedLeadTemperature] ?? statusStyles.cold}>{formatTemperatureLabel(selectedLeadTemperature)}</span>
          </header>

          <div className="crm-mobile-detail-actions">
            {leadPhone ? <a href={`tel:${leadPhone}`}>Call</a> : null}
            {whatsappLink ? <a href={whatsappLink} rel="noreferrer" target="_blank">WhatsApp</a> : null}
          </div>

          <div className="crm-mobile-detail-summary">
            <SummaryChip label="Source" value={formatLeadSource(selectedLead.source)} />
            <SummaryChip label="Escalated" value={selectedLead.escalated ? 'Yes' : 'No'} />
            <SummaryChip label="Received" value={selectedLead.messages_received ?? 0} />
            <SummaryChip label="Sent" value={selectedLead.messages_sent ?? 0} />
            <SummaryChip label="Budget" value={formatBudgetRange(selectedLead)} />
            <SummaryChip label="Last seen" value={formatShortDate(selectedLead.last_message_at)} />
          </div>

          <div className="crm-mobile-tabs">
            <button type="button" className={activeTab === 'overview' ? 'active' : ''} onClick={() => onSelectTab('overview')}>Overview</button>
            <button type="button" className={activeTab === 'chat' ? 'active' : ''} onClick={() => onSelectTab('chat')}>Chat {detailViewState.messages.length}</button>
          </div>

          <main className="crm-mobile-detail-scroll">
            {detailViewState.loading ? <EmptyState message="Loading..." /> : null}
            {detailViewState.error ? <ErrorState message={detailViewState.error} /> : null}
            {!showConversation ? (
              <div className="crm-mobile-detail-grid">
                <DetailCard label="Name" value={safeText(selectedLead.name, 'Unknown lead')} />
                <DetailCard label="Phone" value={safeText(selectedLead.phone, 'Unavailable')} />
                <DetailCard label="Source" value={formatLeadSource(selectedLead.source)} />
                <DetailCard label="Status" value={formatTemperatureLabel(selectedLeadTemperature)} />
                <DetailCard label="Score" value={selectedLead.score ?? 0} />
                <DetailCard label="Budget" value={formatBudgetRange(selectedLead)} />
                <DetailCard label="Preferred Locations" value={formatPreferredLocations(selectedLead.preferred_locations)} />
                <DetailCard label="Size Preference" value={safeText(selectedLead.size_preference, 'Not captured')} />
                <DetailCard label="Facing" value={safeText(selectedLead.facing, 'Not captured')} />
                <DetailCard label="Updated" value={formatDateTime(selectedLead.updated_at ?? selectedLead.created_at)} />
              </div>
            ) : (
              <div className="crm-mobile-chat-list">
                {detailViewState.messages.length === 0 ? <p>No chat yet.</p> : null}
                {detailViewState.messages.map((message) => (
                  <article key={message.id} className="crm-mobile-chat-message">
                    <div><strong>{message.role === 'user' ? 'Lead' : 'Assistant'}</strong><span>{formatDateTime(message.created_at)}</span></div>
                    <p>{safeText(message.message_text, '[Empty message]')}</p>
                  </article>
                ))}
              </div>
            )}
          </main>
        </>
      ) : (
        <EmptyState message="No lead selected" />
      )}
    </div>
  )
}

function LeadSidebar({
  activeFilter,
  activeLeadId,
  selectedLead,
  activeSourceFilter,
  filteredCount,
  leadItemRefs,
  leadsState,
  onCloseMobileDetail,
  onSelectLead,
  onSelectSourceFilter,
  searchQuery,
  setActiveFilter,
  setSearchQuery,
  sourceFilterOptions,
  stats,
  visibleLeads,
}) {
  const filterOptions = [
    { key: 'all', label: 'All', count: leadsState.items.length },
    { key: 'hot', label: 'Priority', count: stats.hot },
    { key: 'warm', label: 'Active', count: stats.warm },
    { key: 'cold', label: 'Others', count: stats.cold },
  ]

  return (
    <aside className="crm-admin-panel crm-lead-sidebar crm-fade-up crm-fade-up-delay-1">
      <div className="crm-sidebar-head">
        <div className="crm-sidebar-title-row">
          <h2 className="crm-sidebar-title">Leads</h2>
          <span className="crm-count-pill">{filteredCount}</span>
        </div>

        <input
          className="crm-lead-search mt-3 w-full rounded-xl border border-brand-ink/10 bg-white/80 px-4 py-2.5 text-sm outline-none transition focus:border-brand-accent"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search name or number…"
        />

        <div className="crm-stat-pills mt-3">
          {filterOptions.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`crm-stat-pill ${activeFilter === f.key ? 'crm-stat-pill-active' : ''}`}
              onClick={() => {
                onCloseMobileDetail()
                setActiveFilter(f.key)
              }}
            >
              {f.label}
              <span className="crm-pill-count">{f.count}</span>
            </button>
          ))}
        </div>

        <select
          className="crm-lead-search mt-3 w-full rounded-xl border border-brand-ink/10 bg-white/80 px-4 py-2.5 text-sm outline-none transition focus:border-brand-accent"
          value={activeSourceFilter}
          onChange={(event) => {
            onCloseMobileDetail()
            onSelectSourceFilter(event.target.value)
          }}
        >
          {sourceFilterOptions.map((sourceOption) => (
            <option key={sourceOption.key} value={sourceOption.key}>
              {sourceOption.label} ({sourceOption.count})
            </option>
          ))}
        </select>
      </div>

      <div className="crm-lead-scroll mt-3 space-y-2 pr-1">
        {leadsState.loading ? <EmptyState message="Loading…" /> : null}
        {!leadsState.loading && leadsState.error ? <ErrorState message={leadsState.error} /> : null}
        {!leadsState.loading && !leadsState.error && visibleLeads.length === 0 ? (
          <EmptyState message={searchQuery.trim() ? 'No matches' : 'No leads'} />
        ) : null}

        {!leadsState.loading && !leadsState.error
          ? visibleLeads.map((lead, index) => {
              const isActive = lead.id === activeLeadId
              const displayLead = isActive && selectedLead ? selectedLead : lead
              const leadTemperature = getLeadTemperature(displayLead.score)
              const badgeClass = statusStyles[leadTemperature] ?? statusStyles.cold

              return (
                <button
                  key={lead.id}
                  ref={(node) => {
                    if (node) {
                      leadItemRefs.current.set(lead.id, node)
                    } else {
                      leadItemRefs.current.delete(lead.id)
                    }
                  }}
                  type="button"
                  onClick={() => onSelectLead(lead.id)}
                  className={`crm-lead-card crm-fade-up-subtle w-full rounded-2xl border p-3.5 text-left transition-all ${
                    isActive
                      ? 'crm-lead-card-active border-brand-accent/40 bg-brand-soft/80'
                      : 'border-brand-ink/8 bg-white/88'
                  }`}
                  style={{ '--crm-enter-delay': `${Math.min(index * 35, 280)}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="crm-avatar shrink-0">{getInitials(displayLead.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="truncate text-sm font-semibold text-brand-ink leading-tight">
                          {safeText(displayLead.name, 'Unknown lead')}
                        </p>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badgeClass}`}>
                          {formatTemperatureLabel(leadTemperature)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-brand-muted">
                        {safeText(displayLead.phone, 'Phone unavailable')}
                      </p>
                      <div className="mt-2 flex items-center gap-3 text-xs text-brand-muted">
                        <span>
                          Score <strong className="text-brand-ink">{displayLead.score ?? 0}</strong>
                        </span>
                        <span>{formatShortDate(displayLead.last_message_at)}</span>
                        <span className="ml-auto crm-source-pill shrink-0">
                          {formatLeadSource(displayLead.source)}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          : null}
      </div>
    </aside>
  )
}

function ExportControls({
  activeSourceFilter,
  exportDateRange,
  exportDateRangeError,
  exportLeadsCount,
  isExporting,
  onExport,
  isImporting,
  onImport,
  onQuickDownload,
  onExportDateRangeChange,
  onSelectSourceFilter,
  sourceFilterOptions,
}) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 w-full xl:max-w-lg">
        <label className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">
          From
          <ExportDateField
            label="From"
            value={exportDateRange.from}
            onChange={(value) => onExportDateRangeChange((current) => ({ ...current, from: value }))}
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">
          To
          <ExportDateField
            label="To"
            value={exportDateRange.to}
            onChange={(value) => onExportDateRangeChange((current) => ({ ...current, to: value }))}
          />
        </label>
        <label className="block text-xs font-bold uppercase tracking-[0.16em] text-brand-muted col-span-2 sm:col-span-1">
          Source
          <select
            className="crm-lead-search mt-2 block w-full rounded-xl border border-brand-ink/10 bg-white px-4 py-2.5 text-sm font-medium normal-case tracking-normal text-brand-ink outline-none transition focus:border-brand-accent"
            value={activeSourceFilter}
            onChange={(event) => onSelectSourceFilter(event.target.value)}
          >
            {sourceFilterOptions.map((sourceOption) => (
              <option key={sourceOption.key} value={sourceOption.key}>
                {sourceOption.label} ({sourceOption.count})
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2 w-full xl:w-auto shrink-0 items-center">
        <button
          className="button-primary w-full justify-center sm:w-auto"
          onClick={onQuickDownload}
          disabled={Boolean(exportDateRangeError) || exportLeadsCount === 0}
          type="button"
          title="Instant download — no API calls, no chat history"
        >
          ↓ Download XLSX
        </button>
        <button
          className="button-secondary w-full justify-center sm:w-auto"
          onClick={onExport}
          disabled={isExporting || Boolean(exportDateRangeError) || exportLeadsCount === 0}
          type="button"
          title="Full export with chat history — slower"
        >
          {isExporting ? 'Exporting...' : `Export + Chats (${exportLeadsCount})`}
        </button>
        <div className="relative w-full sm:w-auto">
          <input
            type="file"
            accept=".xlsx"
            id="import-upload"
            className="hidden"
            onChange={onImport}
            disabled={isImporting}
          />
          <label
            htmlFor="import-upload"
            className={`button-secondary w-full justify-center sm:w-auto cursor-pointer flex items-center ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {isImporting ? 'Importing...' : 'Import XLSX'}
          </label>
        </div>
        <span className="text-xs font-medium text-brand-muted">
          {exportDateRangeError || `${exportLeadsCount} leads`}
        </span>
        {(exportDateRange.from || exportDateRange.to) && (
          <button
            className="text-xs font-bold text-brand-accent transition hover:text-brand-ink"
            onClick={() => onExportDateRangeChange(getDefaultExportDateRange())}
            type="button"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

function ExportDateField({ label, onChange, value }) {
  const inputRef = useRef(null)

  function openPicker() {
    const input = inputRef.current
    if (!input) {
      return
    }

    try {
      if (typeof input.showPicker === 'function') {
        input.showPicker()
      } else {
        input.focus()
        input.click()
      }
    } catch {
      input.focus()
    }
  }

  return (
    <span className="relative mt-2 block">
      <button
        className="crm-lead-search block w-full rounded-xl border border-brand-ink/10 bg-white px-4 py-2.5 text-left text-sm font-medium normal-case tracking-normal text-brand-ink outline-none transition focus:border-brand-accent"
        onClick={openPicker}
        type="button"
      >
        {formatDatePickerDisplay(value) || 'Select date'}
      </button>
      <input
        aria-label={label}
        className="absolute left-4 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
        ref={inputRef}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </span>
  )
}

function LeadWorkspace({
  activeTab,
  conversationSectionRef,
  detailViewState,
  onBackToList,
  onSelectTab,
  selectedLead,
  selectedLeadTemperature,
  showConversation,
}) {
  const [chatOpen, setChatOpen] = useState(false)

  if (detailViewState.error && !selectedLead) {
    return <ErrorState message={detailViewState.error} />
  }

  if (!selectedLead) {
    return (
      <div className="crm-admin-panel crm-workspace-panel crm-workspace-empty crm-fade-up crm-fade-up-delay-2">
        <p className="text-sm text-brand-muted">Select a lead to view details</p>
      </div>
    )
  }

  const leadPhone = normalizePhoneNumber(selectedLead.phone)
  const whatsappLink = leadPhone ? `https://wa.me/${leadPhone}` : ''
  const crmPhone = leadPhone
    ? leadPhone.length === 10 ? `+91${leadPhone}` : `+${leadPhone}`
    : null

  return (
    <article className="crm-admin-panel crm-workspace-panel crm-fade-up crm-fade-up-delay-2 overflow-hidden">
      <div className="crm-workspace-head px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              className="crm-back-btn mr-1 xl:hidden"
              onClick={onBackToList}
              type="button"
            >
              ←
            </button>
            <div className="crm-avatar crm-avatar-lg shrink-0">{getInitials(selectedLead.name)}</div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-2xl font-bold text-brand-ink leading-tight">
                  {safeText(selectedLead.name, 'Unknown lead')}
                </h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    statusStyles[selectedLeadTemperature] ?? statusStyles.cold
                  }`}
                >
                  {formatTemperatureLabel(selectedLeadTemperature)}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-brand-muted">
                {safeText(selectedLead.phone, 'Unavailable')}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 shrink-0">
            {leadPhone ? (
              <a className="button-primary" href={`tel:${leadPhone}`}>
                Call
              </a>
            ) : null}
            {whatsappLink ? (
              <a className="button-secondary" href={whatsappLink} rel="noreferrer" target="_blank">
                WhatsApp
              </a>
            ) : null}
            {crmPhone ? (
              <button
                className="button-secondary"
                type="button"
                onClick={() => setChatOpen(true)}
              >
                Chat
              </button>
            ) : null}
          </div>
        </div>

        <div className="crm-workspace-chips mt-4">
          <SummaryChip label="Score" value={selectedLead.score ?? 0} />
          <SummaryChip label="Source" value={formatLeadSource(selectedLead.source)} />
          <SummaryChip label="Escalated" value={selectedLead.escalated ? 'Yes' : 'No'} />
          <SummaryChip label="Msgs In" value={selectedLead.messages_received ?? 0} />
          <SummaryChip label="Msgs Out" value={selectedLead.messages_sent ?? 0} />
          <SummaryChip label="Budget" value={formatBudgetRange(selectedLead)} />
          <SummaryChip label="Last seen" value={formatShortDate(selectedLead.last_message_at)} />
        </div>
      </div>

      <div className="crm-workspace-scroll space-y-5 px-5 py-5 sm:px-6">
        {detailViewState.loading ? (
          <div className="rounded-xl border border-dashed border-brand-ink/15 bg-brand-soft/30 px-4 py-3 text-sm text-brand-muted">
            Loading…
          </div>
        ) : null}
        {detailViewState.error ? <ErrorState message={detailViewState.error} /> : null}

        <div className="crm-tabs">
          <button
            className={`crm-tab ${activeTab === 'overview' ? 'crm-tab-active' : ''}`}
            onClick={() => onSelectTab('overview')}
            type="button"
          >
            Overview
          </button>
          <button
            className={`crm-tab ${activeTab === 'chat' ? 'crm-tab-active' : ''}`}
            onClick={() => onSelectTab('chat')}
            type="button"
          >
            Chat
            <span className="crm-filter-chip-count">{detailViewState.messages.length}</span>
          </button>
        </div>

        {!showConversation ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <DetailCard label="Name" value={safeText(selectedLead.name, 'Unknown lead')} />
            <DetailCard label="Phone" value={safeText(selectedLead.phone, 'Unavailable')} />
            <DetailCard label="Source" value={formatLeadSource(selectedLead.source)} />
            <DetailCard label="Status" value={formatTemperatureLabel(selectedLeadTemperature)} />
            <DetailCard label="Score" value={selectedLead.score ?? 0} />
            <DetailCard label="Budget" value={formatBudgetRange(selectedLead)} />
            <DetailCard label="Preferred Locations" value={formatPreferredLocations(selectedLead.preferred_locations)} />
            <DetailCard label="Size Preference" value={safeText(selectedLead.size_preference, 'Not captured')} />
            <DetailCard label="Facing" value={safeText(selectedLead.facing, 'Not captured')} />
            <DetailCard label="Updated" value={formatDateTime(selectedLead.updated_at ?? selectedLead.created_at)} />
          </div>
        ) : (
          <div ref={conversationSectionRef} className="crm-section-card crm-conversation-panel p-4">
            {detailViewState.messages.length === 0 ? (
              <p className="text-sm text-brand-muted">No chat yet.</p>
            ) : (
              <div className="crm-conversation-scroll space-y-3">
                {detailViewState.messages.map((message, index) => {
                  const isUser = message.role === 'user'

                  return (
                    <article
                      key={message.id}
                      className={`crm-chat-message rounded-2xl border px-4 py-4 ${
                        isUser
                          ? 'crm-chat-message-user bg-white border-brand-ink/10'
                          : 'crm-chat-message-assistant border-brand-accent/15 bg-brand-soft/75'
                      }`}
                      style={{ '--crm-enter-delay': `${Math.min(index * 45, 240)}ms` }}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                          {isUser ? 'Lead' : 'Assistant'}
                        </p>
                        <p className="text-xs text-brand-muted">{formatDateTime(message.created_at)}</p>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-brand-ink">
                        {safeText(message.message_text, '[Empty message]')}
                      </p>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <WhatsAppDrawer
        phone={crmPhone}
        customerName={selectedLead.name || ''}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </article>
  )
}

function HealthBadge({ health }) {
  if (health.loading) {
    return <div className="rounded-full border border-brand-ink/10 bg-white px-3 py-1.5 text-xs font-semibold text-brand-muted">Checking</div>
  }

  if (health.error) {
    return <div className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">Offline</div>
  }

  return <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">● Online</div>
}

function DetailCard({ label, value }) {
  return (
    <div className="crm-detail-card rounded-2xl border border-brand-ink/8 bg-slate-50/80 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-muted">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-brand-ink">{value}</p>
    </div>
  )
}

function SummaryChip({ label, value }) {
  return (
    <div className="crm-summary-chip rounded-xl border border-brand-ink/8 bg-white/88 px-3 py-2.5 shadow-[0_6px_16px_rgba(15,23,42,0.04)]">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-brand-ink">{value}</p>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="rounded-2xl border border-dashed border-brand-ink/12 bg-slate-50/60 px-4 py-6 text-sm text-brand-muted text-center">
      {message}
    </div>
  )
}

function ErrorState({ message }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm font-semibold text-red-700">
      {message}
    </div>
  )
}

function formatBudgetRange(lead) {
  const min = lead?.budget_min
  const max = lead?.budget_max
  const estimate = lead?.budget_estimate

  if (min || max) {
    return [min ? formatCurrency(min) : 'Any', max ? formatCurrency(max) : 'Any'].join(' - ')
  }

  if (estimate) {
    return formatCurrency(estimate)
  }

  return 'Not captured'
}

function formatCurrency(value) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return safeText(value, 'Not captured')
  }

  return `${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 1,
    maximumFractionDigits: 2,
  }).format(numeric)} Cr`
}

function formatPreferredLocations(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value.join(', ') : 'Manikonda'
  }

  return safeText(value, 'Manikonda')
}

function buildLeadExportRow(lead, options = {}) {
  const messages = Array.isArray(options.messages) ? options.messages : []

  return {
    created_at: formatExportDate(lead?.created_at),
    updated_at: formatExportDate(lead?.updated_at ?? getLastMessageAt(messages, lead)),
    name: safeText(lead?.name, ''),
    number: safeText(lead?.phone ?? lead?.number, ''),
    location: formatPreferredLocations(lead?.preferred_locations ?? lead?.location),
    status: getLeadTemperature(lead?.score),
    'summary of the message': getMessageSummary(lead, messages, options.chats),
  }
}

function getMessageSummary(lead, messages, chats) {
  const directSummary = [
    lead?.message_summary,
    lead?.summary_of_the_message,
    lead?.conversation_summary,
    lead?.chat_summary,
    lead?.summary,
    lead?.last_message_summary,
  ].find((value) => safeText(value, ''))

  if (directSummary) {
    return safeText(directSummary, '')
  }

  const messageText = messages
    .map((message) => safeText(message?.message_text ?? message?.text ?? message?.body, ''))
    .filter(Boolean)
    .join(' ')

  return safeText(messageText || chats, '')
}

function safeText(value, fallback) {
  if (value === null || value === undefined) {
    return fallback
  }

  const text = String(value).trim()
  if (!text || text.toLowerCase() === 'undefined' || text.toLowerCase() === 'null') {
    return fallback
  }

  return text
}

function getLeadSourceKey(lead) {
  return safeText(lead?.source, 'unknown').toLowerCase()
}

function formatLeadSource(value) {
  const source = safeText(value, 'Unknown')

  return source
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const lowerPart = part.toLowerCase()

      if (['utm', 'seo', 'ppc'].includes(lowerPart)) {
        return lowerPart.toUpperCase()
      }

      if (lowerPart === 'fb') {
        return 'Facebook'
      }

      return `${lowerPart.charAt(0).toUpperCase()}${lowerPart.slice(1)}`
    })
    .join(' ')
}

function getFirstReceivedAt(messages, lead) {
  if (Array.isArray(messages) && messages.length > 0) {
    const firstUserMessage = messages.find((message) => message?.role === 'user' && message?.created_at)
    if (firstUserMessage?.created_at) {
      return firstUserMessage.created_at
    }

    const firstMessage = messages.find((message) => message?.created_at)
    if (firstMessage?.created_at) {
      return firstMessage.created_at
    }
  }

  return lead?.first_received_at ?? lead?.created_at ?? ''
}

function getLastMessageAt(messages, lead) {
  if (Array.isArray(messages) && messages.length > 0) {
    const lastMessage = [...messages].reverse().find((message) => message?.created_at)
    if (lastMessage?.created_at) {
      return lastMessage.created_at
    }
  }

  return lead?.last_message_at ?? lead?.updated_at ?? lead?.created_at ?? ''
}

function filterLeadsByFirstReceivedAt(leads, range) {
  const hasRange = Boolean(range.from || range.to)
  if (!hasRange) {
    return leads
  }

  const fromTime = parseDateInputTime(range.from)
  const toTime = parseDateInputTime(range.to, { endOfDay: true })

  return leads.filter((lead) => {
    const firstReceivedAt = new Date(getFirstReceivedAt(null, lead)).getTime()
    if (!Number.isFinite(firstReceivedAt)) {
      return false
    }

    if (fromTime !== null && firstReceivedAt < fromTime) {
      return false
    }

    if (toTime !== null && firstReceivedAt > toTime) {
      return false
    }

    return true
  })
}

function getExportDateRangeError(range) {
  const fromTime = parseDateInputTime(range.from)
  const toTime = parseDateInputTime(range.to, { endOfDay: true })

  if (range.from && fromTime === null) {
    return 'Enter a valid from date'
  }

  if (range.to && toTime === null) {
    return 'Enter a valid to date'
  }

  if (fromTime !== null && toTime !== null && fromTime > toTime) {
    return 'From date must be before to date'
  }

  return ''
}

function parseDateInputTime(value, options = {}) {
  if (!value) {
    return null
  }

  const endOfDay = Boolean(options.endOfDay)
  const trimmedValue = String(value).trim()
  const dateInputMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateInputMatch) {
    const [, yearValue, monthValue, dayValue] = dateInputMatch
    const year = Number(yearValue)
    const monthIndex = Number(monthValue) - 1
    const day = Number(dayValue)
    const parsed = new Date(year, monthIndex, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)

    if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) {
      return null
    }

    return parsed.getTime()
  }

  const customMatch = trimmedValue.match(
    /^(\d{1,2})-([a-z]+)-(\d{4})(?:\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm))?$/i,
  )

  if (customMatch) {
    const [, dayValue, monthValue, yearValue, hourValue, minuteValue = '0', meridiemValue] = customMatch
    const monthIndex = getExportMonthIndex(monthValue)

    if (monthIndex === -1) {
      return null
    }

    const hasExplicitTime = hourValue !== undefined
    let hours = Number(hourValue ?? (endOfDay ? 23 : 0))
    const minutes = Number(hasExplicitTime ? minuteValue : endOfDay ? 59 : minuteValue)
    const seconds = hasExplicitTime ? 0 : endOfDay ? 59 : 0
    const milliseconds = hasExplicitTime ? 0 : endOfDay ? 999 : 0

    if (meridiemValue) {
      if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
        return null
      }

      const meridiem = meridiemValue.toLowerCase()
      if (meridiem === 'pm' && hours < 12) {
        hours += 12
      }

      if (meridiem === 'am' && hours === 12) {
        hours = 0
      }
    } else if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return null
    }

    const parsed = new Date(Number(yearValue), monthIndex, Number(dayValue), hours, minutes, seconds, milliseconds)
    if (
      parsed.getFullYear() !== Number(yearValue) ||
      parsed.getMonth() !== monthIndex ||
      parsed.getDate() !== Number(dayValue)
    ) {
      return null
    }

    return parsed.getTime()
  }

  const fallbackTime = new Date(trimmedValue).getTime()
  return Number.isNaN(fallbackTime) ? null : fallbackTime
}

function getDefaultExportDateRange() {
  return { from: '', to: getCurrentDateInputValue() }
}

function getCurrentDateInputValue() {
  const now = new Date()
  const timezoneOffset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - timezoneOffset).toISOString().slice(0, 10)
}

function getExportMonthIndex(value) {
  return getExportMonthNames().indexOf(String(value ?? '').trim().toLowerCase())
}

function getExportMonthNames() {
  return [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ]
}

function formatExportDate(value) {
  if (!value) {
    return ''
  }

  const parsed = parseExportDateValue(value)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }

  return formatExportDatePart(parsed)
}

function formatDatePickerDisplay(value) {
  return formatExportDate(value)
}

function parseExportDateValue(value) {
  const trimmedValue = String(value ?? '').trim()
  const dateInputMatch = trimmedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/)

  if (dateInputMatch) {
    const [, yearValue, monthValue, dayValue] = dateInputMatch
    const year = Number(yearValue)
    const monthIndex = Number(monthValue) - 1
    const day = Number(dayValue)
    const parsed = new Date(year, monthIndex, day, 0, 0, 0, 0)

    if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex || parsed.getDate() !== day) {
      return new Date(Number.NaN)
    }

    return parsed
  }

  return new Date(value)
}

function formatExportDatePart(date) {
  const months = getExportMonthNames()

  return `${date.getDate()}-${months[date.getMonth()]}-${date.getFullYear()}`
}

function formatDateTime(value) {
  if (!value) {
    return 'N/A'
  }

  const parsed = parseExportDateValue(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A'
  }

  return formatExportDatePart(parsed)
}

function formatShortDate(value) {
  if (!value) {
    return 'N/A'
  }

  const parsed = parseExportDateValue(value)
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A'
  }

  return formatExportDatePart(parsed)
}

function getInitials(value) {
  const text = safeText(value, 'Unknown Lead')
  const initials = text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')

  return initials || 'UL'
}

function getLeadTemperature(score) {
  const numericScore = Number(score ?? 0)

  if (numericScore >= 75) {
    return 'hot'
  }

  if (numericScore >= 40) {
    return 'warm'
  }

  return 'cold'
}

function formatTemperatureLabel(value) {
  const text = String(value ?? 'cold').trim().toLowerCase()
  if (text === 'hot') {
    return 'Priority'
  }

  if (text === 'warm') {
    return 'Active'
  }

  return 'Others'
}

function normalizePhoneNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length >= 10 ? digits : ''
}
