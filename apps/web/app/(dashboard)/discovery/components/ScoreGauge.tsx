interface Props {
  label: string
  score: number | null | undefined
  description: string
}

export default function ScoreGauge({ label, score, description }: Props) {
  const val = score ?? 0
  const pct = (val / 10) * 100

  const color =
    val >= 7.5 ? '#10b981' :
    val >= 5.0 ? '#f59e0b' :
                 '#ef4444'

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular-nums text-sm font-semibold" style={{ color }}>
          {score != null ? val.toFixed(1) : '—'}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
