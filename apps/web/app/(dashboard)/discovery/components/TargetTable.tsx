'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Target } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Trash2, Network } from 'lucide-react'
import { api } from '@/lib/api/client'

interface Props {
  targets: Target[]
  onDelete: (id: string) => void
}

function fmt(n: number | null | undefined, prefix = '') {
  if (!n) return '—'
  return prefix + n.toLocaleString('en-EU')
}

function SuccessionPill({ risk }: { risk: Target['succession_risk'] }) {
  if (!risk || risk === 'unknown') return null
  const map = {
    high:   { label: 'High', className: 'bg-red-50 text-red-700 border border-red-200' },
    medium: { label: 'Med',  className: 'bg-amber-50 text-amber-700 border border-amber-200' },
    low:    { label: 'Low',  className: 'bg-emerald-50 text-emerald-700 border border-emerald-200' },
  }
  const cfg = map[risk]
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

function EnrichmentStatusBadge({ status }: { status: string | null | undefined }) {
  const map: Record<string, { label: string; className: string }> = {
    enriched: { label: 'Enriched', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    partial:  { label: 'Partial',  className: 'text-amber-700 bg-amber-50 border-amber-200' },
    failed:   { label: 'Failed',   className: 'text-red-700 bg-red-50 border-red-200' },
    none:     { label: 'None',     className: 'text-muted-foreground bg-muted border-border' },
  }
  const cfg = map[status ?? 'none'] ?? map['none']
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export default function TargetTable({ targets, onDelete }: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  if (targets.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No targets found. Import a CSV or adjust your filters.
      </div>
    )
  }

  return (
    <div className="rounded-md border bg-white overflow-hidden shadow-none">
      <table className="w-full text-sm">
        <thead className="border-b bg-slate-50">
          <tr>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Company</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Location</th>
            <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Industry</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Revenue</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Employees</th>
            <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Owner age</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Enrichment</th>
            <th className="text-center px-2 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-8">Net</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Succession</th>
            <th className="text-center px-2 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide w-12">Fam</th>
            <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">Score</th>
            <th className="px-4 py-2.5 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {targets.map(t => {
            const score = t.target_scores?.[0]?.overall_score
            return (
              <tr key={t.id} className="hover:bg-slate-50/80 transition-colors duration-100">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/discovery/${t.id}`}
                    className="font-medium text-foreground hover:text-emerald-700 transition-colors duration-150"
                  >
                    {t.name}
                  </Link>
                  {t.website && (
                    <a href={t.website} target="_blank" rel="noopener noreferrer"
                      className="ml-2 text-muted-foreground hover:text-foreground inline-flex items-center cursor-pointer">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {[t.city, t.country].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">
                  {t.industry_label ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {fmt(t.revenue_eur, '€')}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {fmt(t.employee_count)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                  {t.owner_age_estimate ?? '—'}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <EnrichmentStatusBadge status={t.enrichment_status} />
                </td>
                <td className="px-2 py-2.5 text-center w-8">
                  {t.directors && t.directors.length > 0 && (
                    <span title="Has director data — run network scan to find connections">
                      <Network className="h-3 w-3 text-muted-foreground inline-block" />
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <SuccessionPill risk={t.succession_risk} />
                </td>
                <td className="px-2 py-2.5 text-center w-12">
                  {t.is_family_business === true && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-sm text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200">
                      Fam
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <ScoreBadge score={score} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {confirmDeleteId === t.id ? (
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="destructive" size="sm" className="h-6 text-xs px-2 cursor-pointer"
                        onClick={() => { api.targets.delete(t.id); onDelete(t.id); setConfirmDeleteId(null) }}
                      >
                        Confirm
                      </Button>
                      <Button
                        variant="ghost" size="sm" className="h-6 text-xs px-2 cursor-pointer"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive cursor-pointer"
                      onClick={() => setConfirmDeleteId(t.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
