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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums font-semibold" style={{ color }}>
          {score != null ? val.toFixed(1) : '—'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  )
}
