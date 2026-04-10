// apps/web/app/(dashboard)/rollup/[id]/lib/computeFinancials.ts
import { RollupScenarioTarget, RollupFinancials } from '@/lib/api/client'

export function computeFinancials(targets: RollupScenarioTarget[]): RollupFinancials {
  const perTarget = targets.map(t => {
    const revenue = t.targets?.revenue_eur ?? 0
    const margin = (t.ebitda_margin_pct ?? 0) / 100
    const ebitda = revenue * margin
    const entry_cost = ebitda * t.entry_multiple
    const debt = entry_cost * t.debt_pct / 100
    const equity_in = entry_cost - debt
    const synergy_value = ebitda * t.synergy_pct / 100
    const revenue_uplift = revenue * t.revenue_uplift_pct / 100
    return {
      target_id: t.target_id,
      name: t.targets?.name ?? '',
      sequence_order: t.sequence_order,
      revenue_eur: revenue,
      ebitda: Math.round(ebitda),
      entry_cost: Math.round(entry_cost),
      debt: Math.round(debt),
      equity_in: Math.round(equity_in),
      synergy_value: Math.round(synergy_value),
      revenue_uplift: Math.round(revenue_uplift),
    }
  })

  const total_revenue = perTarget.reduce((s, t) => s + t.revenue_eur, 0)
  const total_ebitda_pre_synergy = perTarget.reduce((s, t) => s + t.ebitda, 0)
  const total_synergy_value = perTarget.reduce((s, t) => s + t.synergy_value, 0)
  const total_revenue_uplift = perTarget.reduce((s, t) => s + t.revenue_uplift, 0)
  const proforma_ebitda = total_ebitda_pre_synergy + total_synergy_value
  const proforma_revenue = total_revenue + total_revenue_uplift
  const total_entry_cost = perTarget.reduce((s, t) => s + t.entry_cost, 0)
  const total_integration_cost = targets.reduce((s, t) => s + (t.integration_cost_eur ?? 0), 0)
  const total_equity_in = perTarget.reduce((s, t) => s + t.equity_in, 0)
  const total_debt = perTarget.reduce((s, t) => s + t.debt, 0)
  const avg_entry_multiple = targets.length > 0
    ? targets.reduce((s, t) => s + t.entry_multiple, 0) / targets.length
    : 0
  const exit_value = proforma_ebitda * avg_entry_multiple
  const equity_return_pct = total_equity_in > 0
    ? (exit_value - total_debt - total_integration_cost) / total_equity_in - 1
    : 0

  return {
    targets: perTarget,
    combined: {
      total_revenue,
      total_ebitda_pre_synergy,
      total_synergy_value,
      total_revenue_uplift,
      proforma_ebitda: Math.round(proforma_ebitda),
      proforma_revenue: Math.round(proforma_revenue),
      total_entry_cost: Math.round(total_entry_cost),
      total_integration_cost,
      total_equity_in: Math.round(total_equity_in),
      total_debt: Math.round(total_debt),
      avg_entry_multiple: Math.round(avg_entry_multiple * 100) / 100,
      exit_value: Math.round(exit_value),
      equity_return_pct: Math.round(equity_return_pct * 10000) / 10000,
    }
  }
}
