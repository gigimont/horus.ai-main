'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState, useCallback } from 'react'
import { api, type NetworkGraph, type NetworkStats, type NetworkSummary, type RollupScenario } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import Link from 'next/link'

const NetworkGraphComponent = dynamic(
  () => import('./components/NetworkGraph'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        Loading graph&hellip;
      </div>
    ),
  }
)

const EDGE_TYPE_LABELS: Record<string, string> = {
  supply_chain:     'Supply Chain',
  geographic:       'Geographic',
  industry:         'Industry',
  customer_overlap: 'Customer Overlap',
  vendor_overlap:   'Vendor Overlap',
}

const EDGE_TYPE_COLORS: Record<string, string> = {
  supply_chain:     'bg-blue-500',
  geographic:       'bg-green-500',
  industry:         'bg-purple-500',
  customer_overlap: 'bg-orange-500',
  vendor_overlap:   'bg-teal-500',
}

type PageState = 'idle' | 'analysing' | 'loaded' | 'error'

export default function NetworkPage() {
  const [scenarios, setScenarios] = useState<RollupScenario[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [network, setNetwork] = useState<NetworkGraph | null>(null)
  const [stats, setStats] = useState<NetworkStats | null>(null)
  const [state, setState] = useState<PageState>('idle')
  const [summary, setSummary] = useState<NetworkSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [activeEdgeTypes, setActiveEdgeTypes] = useState<Set<string>>(
    new Set(Object.keys(EDGE_TYPE_LABELS))
  )
  const [minStrength, setMinStrength] = useState(0)

  useEffect(() => {
    api.rollup.list().then(r => setScenarios(r.data)).catch(() => {})
  }, [])

  const loadSummary = useCallback(async (scenarioId: string) => {
    setSummaryLoading(true)
    try {
      const s = await api.network.summary(scenarioId)
      setSummary(s)
    } catch {
      // summary is optional — don't fail the page
    } finally {
      setSummaryLoading(false)
    }
  }, [])

  const loadNetwork = useCallback(async (scenarioId: string) => {
    try {
      const [graph, s] = await Promise.all([
        api.network.get(scenarioId),
        api.network.stats(scenarioId),
      ])
      setNetwork(graph)
      setStats(s)
      const hasEdges = graph.edges.length > 0
      setState(hasEdges ? 'loaded' : 'idle')
      if (hasEdges) loadSummary(scenarioId)
    } catch {
      setState('error')
    }
  }, [loadSummary])

  const handleScenarioChange = (id: string) => {
    setSelectedId(id)
    setNetwork(null)
    setStats(null)
    setSummary(null)
    setState('idle')
    if (id) loadNetwork(id)
  }

  const handleAnalyse = async () => {
    if (!selectedId) return
    setState('analysing')
    try {
      const result = await api.network.analyse(selectedId)
      toast.success(`Found ${result.edges_created} connections across ${result.target_count} targets`)
      await loadNetwork(selectedId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Analysis failed'
      toast.error(msg)
      setState('error')
    }
  }

  const handleReanalyse = async () => {
    if (!selectedId) return
    toast('Re-analysing will clear existing connections\u2026', { duration: 2000 })
    setState('analysing')
    try {
      await api.network.clear(selectedId)
      const result = await api.network.analyse(selectedId)
      toast.success(`Updated: ${result.edges_created} connections found`)
      await loadNetwork(selectedId)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Re-analysis failed'
      toast.error(msg)
      setState('idle')
    }
  }

  const toggleEdgeType = (type: string) => {
    setActiveEdgeTypes(prev => {
      const next = new Set(prev)
      next.has(type) ? next.delete(type) : next.add(type)
      return next
    })
  }

  const hasEdges = network && network.edges.length > 0
  const noScenarios = scenarios.length === 0

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] p-6 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Network Builder</h1>
          <p className="text-sm text-muted-foreground">Visualise relationship edges across roll-up targets</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            className="h-9 rounded-sm border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedId}
            onChange={e => handleScenarioChange(e.target.value)}
          >
            <option value="">Select scenario&hellip;</option>
            {scenarios.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {selectedId && !hasEdges && state !== 'analysing' && (
            <Button size="sm" onClick={handleAnalyse}>
              Analyse network
            </Button>
          )}
          {selectedId && hasEdges && (
            <Button size="sm" variant="outline" onClick={handleReanalyse} disabled={state === 'analysing'}>
              Re-analyse
            </Button>
          )}
          {state === 'analysing' && (
            <span className="text-sm text-muted-foreground animate-pulse">Analysing&hellip;</span>
          )}
        </div>
      </div>

      {/* Edge type filters */}
      {hasEdges && (
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-xs text-muted-foreground">Edge types:</span>
          {Object.entries(EDGE_TYPE_LABELS).map(([type, label]) => (
            <button
              key={type}
              onClick={() => toggleEdgeType(type)}
              className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-sm border transition-opacity ${
                activeEdgeTypes.has(type) ? 'opacity-100' : 'opacity-40'
              } border-input hover:border-foreground/40`}
            >
              <span className={`w-2 h-2 rounded-full ${EDGE_TYPE_COLORS[type]}`} />
              {label}
            </button>
          ))}

          <div className="flex items-center gap-2 ml-4">
            <span className="text-xs text-muted-foreground">Min strength:</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={minStrength}
              onChange={e => setMinStrength(parseFloat(e.target.value))}
              className="w-28 h-1 accent-foreground"
            />
            <span className="text-xs text-muted-foreground w-8">{minStrength.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Graph canvas */}
        <div className="flex-1 border border-border rounded-sm bg-[#0a0f1a] relative overflow-hidden">
          {noScenarios && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">No roll-up scenarios yet.</p>
              <Link href="/rollup">
                <Button size="sm" variant="outline">Create a roll-up scenario</Button>
              </Link>
            </div>
          )}
          {!noScenarios && !selectedId && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">Select a scenario to begin.</p>
            </div>
          )}
          {selectedId && !hasEdges && state === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">No connections analysed yet.</p>
              <p className="text-xs text-muted-foreground">Click &ldquo;Analyse network&rdquo; to discover relationships.</p>
            </div>
          )}
          {selectedId && !hasEdges && state === 'error' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-sm text-destructive">Analysis failed. Check backend logs.</p>
            </div>
          )}
          {hasEdges && network && (
            <NetworkGraphComponent
              nodes={network.nodes}
              edges={network.edges}
              activeEdgeTypes={activeEdgeTypes}
              minStrength={minStrength}
            />
          )}
        </div>

        {/* Stats sidebar */}
        {stats && (
          <div className="w-64 shrink-0 border border-border rounded-sm p-4 flex flex-col gap-4 overflow-y-auto">
            {/* Network Intelligence */}
            {(summaryLoading || summary) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Network Intelligence</p>
                  {summary && !summaryLoading && (
                    <button
                      onClick={() => loadSummary(selectedId)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      title="Regenerate summary"
                    >
                      ↺
                    </button>
                  )}
                </div>
                {summaryLoading ? (
                  <div className="space-y-1.5">
                    <div className="h-3 bg-muted rounded-sm animate-pulse w-full" />
                    <div className="h-3 bg-muted rounded-sm animate-pulse w-5/6" />
                    <div className="h-3 bg-muted rounded-sm animate-pulse w-4/6" />
                  </div>
                ) : summary ? (
                  <div className="space-y-3">
                    <p className="text-xs text-foreground leading-relaxed">{summary.summary}</p>
                    {summary.key_insights.length > 0 && (
                      <div className="space-y-1">
                        {summary.key_insights.map((insight, i) => (
                          <p key={i} className="text-xs text-muted-foreground">&middot; {insight}</p>
                        ))}
                      </div>
                    )}
                    {summary.recommended_actions.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Actions</p>
                        <div className="space-y-1">
                          {summary.recommended_actions.map((action, i) => (
                            <p key={i} className="text-xs text-muted-foreground">&rarr; {action}</p>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* Network stats */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Network stats</p>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Connections</span>
                  <span className="font-medium">{stats.total_edges}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg strength</span>
                  <span className="font-medium">{stats.avg_strength.toFixed(2)}</span>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">By type</p>
              <div className="space-y-1.5">
                {Object.entries(stats.edge_type_distribution).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${EDGE_TYPE_COLORS[type] ?? 'bg-slate-400'}`} />
                      <span className="text-xs text-muted-foreground">{EDGE_TYPE_LABELS[type] ?? type}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs h-4 px-1.5">{count}</Badge>
                  </div>
                ))}
              </div>
            </div>

            {stats.most_connected && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Most connected</p>
                <Link
                  href={`/discovery/${stats.most_connected.target_id}`}
                  className="text-sm font-medium text-foreground hover:underline"
                >
                  {stats.most_connected.name}
                </Link>
                <p className="text-xs text-muted-foreground">{stats.most_connected.edge_count} edges</p>
              </div>
            )}

            {stats.isolated_targets.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Isolated targets</p>
                <p className="text-xs text-amber-500">{stats.isolated_targets.length} target(s) with no connections</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
