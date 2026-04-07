import { cn } from '@/lib/utils'

interface Props {
  score: number | null | undefined
  size?: 'sm' | 'md'
}

export default function ScoreBadge({ score, size = 'md' }: Props) {
  if (score == null) {
    return (
      <span className={cn(
        'inline-flex items-center rounded font-medium bg-slate-100 text-slate-400',
        size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs'
      )}>
        —
      </span>
    )
  }

  const color =
    score >= 7.5 ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' :
    score >= 5.0 ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
                   'bg-red-50 text-red-600 ring-1 ring-red-200'

  return (
    <span className={cn(
      'inline-flex items-center rounded font-semibold tabular-nums',
      size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-0.5 text-xs',
      color
    )}>
      {score.toFixed(1)}
    </span>
  )
}
