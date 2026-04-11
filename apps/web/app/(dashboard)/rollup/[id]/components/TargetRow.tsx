// apps/web/app/(dashboard)/rollup/[id]/components/TargetRow.tsx
'use client'
import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { RollupScenarioTarget } from '@/lib/api/client'
import AssumptionInputs from './AssumptionInputs'
import { GripVertical, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  target: RollupScenarioTarget
  index: number
  onChange: (field: keyof RollupScenarioTarget, value: number) => void
  onRemove: () => void
}

export default function TargetRow({ target, index, onChange, onRemove }: Props) {
  const [expanded, setExpanded] = useState(false)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: target.target_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const t = target.targets
  const score = t?.target_scores?.[0]?.overall_score

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'border rounded-sm bg-card select-none',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex items-center gap-2 px-2 py-2">
        <span className="text-xs font-mono text-muted-foreground w-4 shrink-0">{index + 1}</span>
        <button
          {...listeners}
          {...attributes}
          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{t?.name ?? 'Unknown'}</p>
          <p className="text-xs text-muted-foreground truncate">
            {[t?.city, t?.country].filter(Boolean).join(', ')}
            {t?.industry_label ? ` · ${t.industry_label}` : ''}
          </p>
        </div>
        {score != null && (
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{score.toFixed(1)}</span>
        )}
        <button
          className="text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(v => !v)}
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        <button
          className="text-muted-foreground hover:text-destructive transition-colors"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-2 border-t">
          <AssumptionInputs target={target} onChange={onChange} />
        </div>
      )}
    </div>
  )
}
