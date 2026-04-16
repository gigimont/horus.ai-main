'use client'
import { useState } from 'react'
import { api, Target, EnrichmentJob } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Building2,
  Hash,
  Globe,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Network,
} from 'lucide-react'

interface Props {
  target: Target
  onEnriched?: () => void
}

function StatusBadge({ status }: { status: Target['enrichment_status'] }) {
  const map: Record<string, { label: string; className: string }> = {
    enriched: { label: 'Enriched', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    partial:  { label: 'Partial',  className: 'bg-amber-50 text-amber-700 border-amber-200' },
    failed:   { label: 'Failed',   className: 'bg-red-50 text-red-700 border-red-200' },
    pending:  { label: 'Pending',  className: 'bg-blue-50 text-blue-700 border-blue-200' },
    none:     { label: 'Not enriched', className: 'bg-muted text-muted-foreground border-border' },
  }
  const cfg = map[status ?? 'none'] ?? map['none']
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-sm text-xs font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const delta = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(delta / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function DataRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  )
}

export default function EnrichmentPanel({ target, onEnriched }: Props) {
  const [loading, setLoading] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [history, setHistory] = useState<EnrichmentJob[] | null>(null)
  const [historyLoading, setHistoryLoading] = useState(false)

  const hasData = target.enrichment_status === 'enriched' || target.enrichment_status === 'partial'

  async function handleEnrich(force = false) {
    setLoading(true)
    const toastId = toast.loading(force ? 'Re-enriching target…' : 'Enriching target…')
    try {
      await api.enrichment.enrich(target.id, force)
      toast.success('Enrichment complete — reloading', { id: toastId })
      if (onEnriched) {
        onEnriched()
      } else {
        window.location.reload()
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('409') || msg.toLowerCase().includes('recently enriched')) {
        toast.warning('Enriched recently. Use Re-enrich to force.', { id: toastId })
      } else {
        toast.error('Enrichment failed', { id: toastId })
      }
    } finally {
      setLoading(false)
    }
  }

  async function toggleHistory() {
    if (!historyOpen && history === null) {
      setHistoryLoading(true)
      try {
        const res = await api.enrichment.jobs(target.id)
        setHistory(res.data)
      } catch {
        setHistory([])
      } finally {
        setHistoryLoading(false)
      }
    }
    setHistoryOpen(prev => !prev)
  }

  return (
    <Card>
      <CardHeader className="pb-3 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">Data enrichment</CardTitle>
            <StatusBadge status={target.enrichment_status} />
          </div>
          <div className="flex items-center gap-2">
            {target.last_enriched_at && (
              <span className="text-xs text-muted-foreground">
                {relativeTime(target.last_enriched_at)}
              </span>
            )}
            {hasData && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs rounded-sm cursor-pointer"
                disabled={loading}
                onClick={() => handleEnrich(true)}
              >
                <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Re-enrich
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-5 pb-4">
        {!hasData && !loading && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground mb-3">No enrichment data yet</p>
            <Button
              size="sm"
              className="h-7 px-3 text-xs rounded-sm cursor-pointer"
              disabled={loading}
              onClick={() => handleEnrich(false)}
            >
              <RefreshCw className={`h-3 w-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Enrich now
            </Button>
          </div>
        )}

        {loading && (
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">Enriching from GLEIF…</p>
          </div>
        )}

        {hasData && !loading && (
          <div className="space-y-0">
            {target.legal_form && (
              <DataRow icon={Building2} label="Legal form" value={target.legal_form} />
            )}

            {target.registration_number && (
              <DataRow
                icon={Hash}
                label="Registration"
                value={
                  [target.registration_number, target.registration_authority]
                    .filter(Boolean)
                    .join(', ')
                }
              />
            )}

            {target.share_capital && (
              <DataRow icon={Building2} label="Share capital" value={target.share_capital} />
            )}

            {(target.parent_company || target.ultimate_parent) && (
              <DataRow
                icon={Network}
                label="Corporate group"
                value={
                  <div className="space-y-0.5 mt-0.5">
                    {target.parent_company && (
                      <div className="text-sm">
                        {target.parent_company}
                        <span className="text-muted-foreground ml-1.5 text-xs">parent</span>
                      </div>
                    )}
                    {target.ultimate_parent && target.ultimate_parent !== target.parent_company && (
                      <div className="text-sm">
                        {target.ultimate_parent}
                        <span className="text-muted-foreground ml-1.5 text-xs">ultimate parent</span>
                      </div>
                    )}
                  </div>
                }
              />
            )}

            {target.lei_code && (
              <DataRow
                icon={Globe}
                label="LEI"
                value={
                  <code className="text-xs font-mono text-muted-foreground tracking-wide">
                    {target.lei_code}
                  </code>
                }
              />
            )}

            {target.data_sources && target.data_sources.length > 0 && (
              <div className="flex items-center gap-1.5 pt-3">
                <span className="text-xs text-muted-foreground">Sources:</span>
                {target.data_sources.map(src => (
                  <Badge key={src} variant="secondary" className="text-xs font-normal capitalize rounded-sm">
                    {src.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {(hasData || target.enrichment_status === 'failed') && (
          <div className="mt-4 pt-3 border-t border-border">
            <button
              onClick={toggleHistory}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {historyOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Enrichment history
            </button>

            {historyOpen && (
              <div className="mt-2 space-y-1">
                {historyLoading && (
                  <p className="text-xs text-muted-foreground">Loading…</p>
                )}
                {!historyLoading && history !== null && history.length === 0 && (
                  <p className="text-xs text-muted-foreground">No history found</p>
                )}
                {!historyLoading && history && history.slice(0, 5).map(job => (
                  <div key={job.id} className="flex items-center justify-between text-xs py-1.5 border-b border-border last:border-0">
                    <span className="text-muted-foreground">
                      {job.created_at
                        ? new Date(job.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                        : '—'}
                    </span>
                    <StatusBadge status={job.status as Target['enrichment_status']} />
                    <span className="text-muted-foreground text-xs">
                      {job.providers_completed?.join(', ') || 'none'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
