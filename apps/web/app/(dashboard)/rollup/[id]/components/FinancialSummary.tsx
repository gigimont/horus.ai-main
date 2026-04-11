// apps/web/app/(dashboard)/rollup/[id]/components/FinancialSummary.tsx
'use client'
import { RollupFinancials } from '@/lib/api/client'

interface Props { financials: RollupFinancials }

function fmt(n: number, prefix = '€') {
  if (n >= 1_000_000) return `${prefix}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${prefix}${(n / 1_000).toFixed(0)}K`
  return `${prefix}${n}`
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border rounded-sm p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

export default function FinancialSummary({ financials }: Props) {
  const c = financials.combined
  const returnPct = c.equity_return_pct * 100

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Combined financials
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <KPI label="Pro-forma revenue" value={fmt(c.proforma_revenue)} sub={`Pre-synergy ${fmt(c.total_revenue)}`} />
        <KPI label="Pro-forma EBITDA" value={fmt(c.proforma_ebitda)} sub={`Synergies ${fmt(c.total_synergy_value)}`} />
        <KPI label="Total entry cost" value={fmt(c.total_entry_cost)} sub={`Avg ${c.avg_entry_multiple}x EV/EBITDA`} />
        <KPI label="Equity return est." value={`${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(0)}%`}
          sub={`Exit ${fmt(c.exit_value)} · Equity in ${fmt(c.total_equity_in)}`} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="border rounded-sm px-3 py-2">
          <p className="text-muted-foreground">Total debt</p>
          <p className="font-medium tabular-nums mt-0.5">{fmt(c.total_debt)}</p>
        </div>
        <div className="border rounded-sm px-3 py-2">
          <p className="text-muted-foreground">Integration cost</p>
          <p className="font-medium tabular-nums mt-0.5">{fmt(c.total_integration_cost)}</p>
        </div>
        <div className="border rounded-sm px-3 py-2">
          <p className="text-muted-foreground">Revenue uplift</p>
          <p className="font-medium tabular-nums mt-0.5">{fmt(c.total_revenue_uplift)}</p>
        </div>
      </div>
    </div>
  )
}
