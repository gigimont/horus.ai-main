import { describe, it, expect } from 'vitest'
import { computeFinancials } from '../../apps/web/app/(dashboard)/rollup/[id]/lib/computeFinancials'
import type { RollupScenarioTarget } from '../../apps/web/lib/api/client'

function makeTarget(overrides: Partial<RollupScenarioTarget> = {}): RollupScenarioTarget {
  return {
    id: 'row-1',
    scenario_id: 'scenario-1',
    target_id: 'target-1',
    sequence_order: 0,
    entry_multiple: 6,
    ebitda_margin_pct: 20,
    ebitda_margin_source: 'ai',
    synergy_pct: 0,
    revenue_uplift_pct: 0,
    debt_pct: 50,
    integration_cost_eur: 0,
    hold_period_years: 5,
    notes: null,
    targets: {
      id: 'target-1',
      name: 'Test Co',
      country: 'DE',
      city: 'Berlin',
      industry_label: 'HVAC',
      industry_code: '4322',
      revenue_eur: 1_000_000,
      employee_count: 30,
      founded_year: 2005,
      owner_age_estimate: 58,
      target_scores: [],
    },
    ...overrides,
  }
}

describe('computeFinancials', () => {
  describe('empty targets list', () => {
    it('returns zero combined financials', () => {
      const result = computeFinancials([])
      expect(result.targets).toHaveLength(0)
      expect(result.combined.total_revenue).toBe(0)
      expect(result.combined.total_ebitda_pre_synergy).toBe(0)
      expect(result.combined.proforma_ebitda).toBe(0)
      expect(result.combined.total_entry_cost).toBe(0)
      expect(result.combined.equity_return_pct).toBe(0)
    })
  })

  describe('single target — per-target fields', () => {
    it('computes EBITDA as revenue × margin/100', () => {
      // revenue = 1_000_000, margin = 20% → ebitda = 200_000
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: 20 })])
      expect(result.targets[0].ebitda).toBe(200_000)
    })

    it('computes entry cost as EBITDA × entry multiple', () => {
      // ebitda = 200_000, multiple = 6 → entry_cost = 1_200_000
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: 20, entry_multiple: 6 })])
      expect(result.targets[0].entry_cost).toBe(1_200_000)
    })

    it('splits entry cost into debt and equity by debt_pct', () => {
      // entry_cost = 1_200_000, debt_pct = 50 → debt = 600_000, equity_in = 600_000
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: 20, entry_multiple: 6, debt_pct: 50 })])
      expect(result.targets[0].debt).toBe(600_000)
      expect(result.targets[0].equity_in).toBe(600_000)
    })

    it('computes synergy value as EBITDA × synergy_pct/100', () => {
      // ebitda = 200_000, synergy_pct = 15 → synergy_value = 30_000
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: 20, synergy_pct: 15 })])
      expect(result.targets[0].synergy_value).toBe(30_000)
    })

    it('computes revenue uplift as revenue × revenue_uplift_pct/100', () => {
      // revenue = 1_000_000, uplift_pct = 10 → revenue_uplift = 100_000
      const result = computeFinancials([makeTarget({ revenue_uplift_pct: 10 })])
      expect(result.targets[0].revenue_uplift).toBe(100_000)
    })

    it('treats null ebitda_margin_pct as zero', () => {
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: null })])
      expect(result.targets[0].ebitda).toBe(0)
      expect(result.targets[0].entry_cost).toBe(0)
    })

    it('treats null target revenue as zero', () => {
      const base = makeTarget()
      const result = computeFinancials([{
        ...base,
        targets: { ...base.targets!, revenue_eur: null },
      }])
      expect(result.targets[0].ebitda).toBe(0)
      expect(result.targets[0].revenue_eur).toBe(0)
    })
  })

  describe('combined financials', () => {
    it('sums revenue across all targets', () => {
      const t1 = makeTarget({ target_id: 'a', targets: { ...makeTarget().targets!, id: 'a', revenue_eur: 1_000_000 } })
      const t2 = makeTarget({ target_id: 'b', targets: { ...makeTarget().targets!, id: 'b', revenue_eur: 2_000_000 } })
      const result = computeFinancials([t1, t2])
      expect(result.combined.total_revenue).toBe(3_000_000)
    })

    it('proforma EBITDA = EBITDA pre-synergy + synergy values', () => {
      // ebitda = 200_000, synergy = 30_000 → proforma = 230_000
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: 20, synergy_pct: 15 })])
      expect(result.combined.proforma_ebitda).toBe(230_000)
    })

    it('averages entry multiples across targets', () => {
      const t1 = makeTarget({ target_id: 'a', entry_multiple: 4 })
      const t2 = makeTarget({ target_id: 'b', entry_multiple: 8 })
      const result = computeFinancials([t1, t2])
      expect(result.combined.avg_entry_multiple).toBe(6)
    })

    it('equity return = (exit_value - debt - integration) / equity_in - 1', () => {
      // ebitda = 200_000, multiple = 5, debt_pct = 50, integration = 0
      // entry_cost = 1_000_000, debt = 500_000, equity_in = 500_000
      // exit_value = proforma_ebitda(200_000) * avg_multiple(5) = 1_000_000
      // return = (1_000_000 - 500_000 - 0) / 500_000 - 1 = 0
      const result = computeFinancials([makeTarget({
        ebitda_margin_pct: 20,
        entry_multiple: 5,
        debt_pct: 50,
        synergy_pct: 0,
        integration_cost_eur: 0,
      })])
      expect(result.combined.equity_return_pct).toBe(0)
    })

    it('returns equity_return_pct = 0 when total equity is zero (100% debt)', () => {
      const result = computeFinancials([makeTarget({ ebitda_margin_pct: 20, debt_pct: 100 })])
      expect(result.combined.equity_return_pct).toBe(0)
    })

    it('includes integration cost in combined totals', () => {
      const result = computeFinancials([makeTarget({ integration_cost_eur: 50_000 })])
      expect(result.combined.total_integration_cost).toBe(50_000)
    })
  })
})
