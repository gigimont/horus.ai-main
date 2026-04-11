// apps/web/app/(dashboard)/rollup/[id]/components/SynergyMap.tsx
'use client'
import { RollupFinancials } from '@/lib/api/client'

interface Props { financials: RollupFinancials }

function fmt(n: number) {
  if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
  return `€${n}`
}

export default function SynergyMap({ financials }: Props) {
  if (financials.targets.length === 0) return null
  const sorted = [...financials.targets].sort((a, b) => a.sequence_order - b.sequence_order)
  const maxEbitda = Math.max(...sorted.map(t => t.ebitda), 1)

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Synergy contribution
      </h3>
      <div className="space-y-2">
        {sorted.map((t) => (
          <div key={t.target_id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium truncate">{t.name}</span>
              <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-2">
                <span>EBITDA {fmt(t.ebitda)}</span>
                <span className="text-emerald-600">+{fmt(t.synergy_value)} synergy</span>
              </div>
            </div>
            <div className="flex h-3 gap-0.5 rounded overflow-hidden">
              <div
                className="bg-slate-700 transition-all"
                style={{ width: `${(t.ebitda / maxEbitda) * 75}%`, minWidth: t.ebitda > 0 ? 4 : 0 }}
                title={`EBITDA: ${fmt(t.ebitda)}`}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(t.synergy_value / maxEbitda) * 75}%`, minWidth: t.synergy_value > 0 ? 2 : 0 }}
                title={`Synergy: ${fmt(t.synergy_value)}`}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-slate-700 inline-block" /> EBITDA</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-emerald-500 inline-block" /> Synergy</span>
      </div>
    </div>
  )
}
