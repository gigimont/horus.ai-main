// apps/web/app/(dashboard)/rollup/[id]/components/AssumptionInputs.tsx
'use client'
import { RollupScenarioTarget } from '@/lib/api/client'

interface Props {
  target: RollupScenarioTarget
  onChange: (field: keyof RollupScenarioTarget, value: number) => void
}

function NumInput({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number | null; onChange: (v: number) => void
  min?: number; max?: number; step?: number; suffix?: string
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-0.5">{label}</label>
      <div className="relative">
        <input
          type="number"
          className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
          value={value ?? ''}
          min={min}
          max={max}
          step={step ?? 0.1}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
        />
        {suffix && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  )
}

export default function AssumptionInputs({ target, onChange }: Props) {
  const isAiMargin = target.ebitda_margin_source === 'ai'

  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-2 pb-1">
      <div>
        <label className="text-xs block mb-0.5">
          <span className="text-muted-foreground">EBITDA margin </span>
          <span className={`text-xs px-1 py-0.5 rounded ${isAiMargin ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
            {isAiMargin ? 'AI est.' : 'manual'}
          </span>
        </label>
        <div className="relative">
          <input
            type="number"
            className="h-7 w-full rounded-sm border border-input bg-background px-2 text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
            value={target.ebitda_margin_pct ?? ''}
            min={0} max={50} step={0.5}
            onChange={e => onChange('ebitda_margin_pct', parseFloat(e.target.value) || 0)}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
        </div>
      </div>
      <NumInput label="Entry multiple" value={target.entry_multiple} onChange={v => onChange('entry_multiple', v)} min={2} max={20} step={0.5} suffix="x" />
      <NumInput label="Cost synergy" value={target.synergy_pct} onChange={v => onChange('synergy_pct', v)} min={0} max={50} step={1} suffix="%" />
      <NumInput label="Revenue uplift" value={target.revenue_uplift_pct} onChange={v => onChange('revenue_uplift_pct', v)} min={0} max={50} step={1} suffix="%" />
      <NumInput label="Debt financing" value={target.debt_pct} onChange={v => onChange('debt_pct', v)} min={0} max={90} step={5} suffix="%" />
      <NumInput label="Integration cost" value={target.integration_cost_eur / 1000} onChange={v => onChange('integration_cost_eur', Math.round(v * 1000))} min={0} step={10} suffix="K€" />
    </div>
  )
}
