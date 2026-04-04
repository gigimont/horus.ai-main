import { cn } from '@/lib/utils'

interface Props {
  score: number | null | undefined
  size?: 'sm' | 'md'
}

export default function ScoreBadge({ score, size = 'md' }: Props) {
  if (score == null) {
    return (
      <span className={cn(
        'inline-flex items-center rounded-full font-medium bg-muted text-muted-foreground',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      )}>
        Unscored
      </span>
    )
  }

  const color =
    score >= 7.5 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' :
    score >= 5.0 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                   'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'

  return (
    <span className={cn(
      'inline-flex items-center rounded-full font-semibold tabular-nums',
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs',
      color
    )}>
      {score.toFixed(1)}
    </span>
  )
}
