// apps/web/app/(dashboard)/rollup/[id]/components/AcquisitionTimeline.tsx
'use client'
import { RollupScenarioTarget } from '@/lib/api/client'

interface Props { targets: RollupScenarioTarget[] }

export default function AcquisitionTimeline({ targets }: Props) {
  if (targets.length === 0) return null
  const sorted = [...targets].sort((a, b) => a.sequence_order - b.sequence_order)

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Acquisition sequence
      </h3>
      <div className="relative">
        {/* Connecting line */}
        <div className="absolute top-4 left-4 right-4 h-px bg-border" />
        <div className="flex gap-0 overflow-x-auto pb-1">
          {sorted.map((t, i) => {
            const name = t.targets?.name ?? 'Unknown'
            const score = t.targets?.target_scores?.[0]?.overall_score
            return (
              <div key={t.target_id} className="flex flex-col items-center min-w-0 flex-1 relative">
                <div className="w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center text-xs font-bold z-10 shrink-0">
                  {i + 1}
                </div>
                <p className="text-xs font-medium text-center mt-1.5 px-1 truncate w-full">{name}</p>
                {score != null && (
                  <p className="text-xs text-muted-foreground">{score.toFixed(1)}</p>
                )}
                <p className="text-xs text-muted-foreground">{t.hold_period_years}yr hold</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
