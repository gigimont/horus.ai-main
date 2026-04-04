'use client'
import Link from 'next/link'
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
  if (targets.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground text-sm">
        No targets found. Import a CSV or adjust your filters.
      </div>
    )
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}?`)) return
    await api.targets.delete(id)
    onDelete(id)
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-3 font-medium">Company</th>
            <th className="text-left px-4 py-3 font-medium">Location</th>
            <th className="text-left px-4 py-3 font-medium">Industry</th>
            <th className="text-right px-4 py-3 font-medium">Revenue</th>
            <th className="text-right px-4 py-3 font-medium">Employees</th>
            <th className="text-right px-4 py-3 font-medium">Owner age</th>
            <th className="text-center px-4 py-3 font-medium">Score</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {targets.map(t => {
            const score = t.target_scores?.[0]?.overall_score
            return (
              <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/discovery/${t.id}`}
                    className="font-medium hover:text-primary hover:underline"
                  >
                    {t.name}
                  </Link>
                  {t.website && (
                    <a href={t.website} target="_blank" rel="noopener noreferrer"
                      className="ml-2 text-muted-foreground hover:text-foreground inline-flex items-center">
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {[t.city, t.country].filter(Boolean).join(', ') || '—'}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {t.industry_label ?? '—'}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {fmt(t.revenue_eur, '€')}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {fmt(t.employee_count)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                  {t.owner_age_estimate ?? '—'}
                </td>
                <td className="px-4 py-3 text-center">
                  <ScoreBadge score={score} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(t.id, t.name)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
