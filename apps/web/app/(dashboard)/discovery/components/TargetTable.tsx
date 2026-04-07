'use client'
import Link from 'next/link'
import { useState } from 'react'
import { Target } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { Button } from '@/components/ui/button'
import { ExternalLink, Trash2 } from 'lucide-react'
import { api } from '@/lib/api/client'

interface Props {
  targets: Target[]
  onDelete: (id: string) => void
}

function fmt(n: number | null | undefined, prefix = '') {
  if (!n) return '—'
  return prefix + n.toLocaleString('en-EU')
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
