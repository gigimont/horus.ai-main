'use client'
import { useState, useEffect } from 'react'
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import { api, PipelineEntry } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

const STAGES = [
  { id: 'watchlist',  label: 'Watchlist',  color: 'bg-slate-100 dark:bg-slate-800' },
  { id: 'contacted',  label: 'Contacted',  color: 'bg-blue-50 dark:bg-blue-950' },
  { id: 'nda',        label: 'NDA signed', color: 'bg-purple-50 dark:bg-purple-950' },
  { id: 'loi',        label: 'LOI sent',   color: 'bg-amber-50 dark:bg-amber-950' },
  { id: 'closed',     label: 'Closed',     color: 'bg-emerald-50 dark:bg-emerald-950' },
]

export default function PipelinePage() {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }
  }))

  useEffect(() => {
    api.pipeline.list().then(r => { setEntries(r.data); setLoading(false) })
  }, [])

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const entryId = active.id as string
    const newStage = over.id as string
    if (!STAGES.find(s => s.id === newStage)) return
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, stage: newStage } : e))
    await api.pipeline.update(entryId, newStage)
  }

  const handleRemove = async (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
    await api.pipeline.remove(id)
  }

  if (loading) return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Pipeline</h1>
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Pipeline</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {entries.length} {entries.length === 1 ? 'company' : 'companies'} tracked · drag cards to move stages
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-5 gap-3 min-h-[500px]">
          {STAGES.map(stage => (
            <DroppableColumn
              key={stage.id}
              stage={stage}
              entries={entries.filter(e => e.stage === stage.id)}
              onRemove={handleRemove}
            />
          ))}
        </div>
      </DndContext>

      {entries.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No companies in your pipeline yet.{' '}
          <Link href="/discovery" className="text-primary hover:underline">
            Add targets from Discovery
          </Link>
        </div>
      )}
    </div>
  )
}

function DroppableColumn({ stage, entries, onRemove }: {
  stage: typeof STAGES[0]
  entries: PipelineEntry[]
  onRemove: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-lg border p-3 transition-colors min-h-[400px]',
        stage.color,
        isOver && 'ring-2 ring-primary ring-offset-1'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {stage.label}
        </span>
        <span className="text-xs text-muted-foreground">{entries.length}</span>
      </div>
      <div className="space-y-2">
        {entries.map(entry => (
          <DraggableCard key={entry.id} entry={entry} onRemove={onRemove} />
        ))}
      </div>
    </div>
  )
}

function DraggableCard({ entry, onRemove }: {
  entry: PipelineEntry
  onRemove: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: entry.id })
  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined

  const target = entry.targets
  const score = target?.target_scores?.[0]?.overall_score

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        'bg-card rounded-md border p-3 cursor-grab active:cursor-grabbing select-none',
        isDragging && 'opacity-50 shadow-lg'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <div className="flex-1 min-w-0">
          <Link
            href={`/discovery/${entry.target_id}`}
            className="text-sm font-medium hover:text-primary hover:underline truncate block"
            onClick={e => e.stopPropagation()}
          >
            {target?.name ?? 'Unknown'}
          </Link>
          {(target?.city || target?.country) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[target?.city, target?.country].filter(Boolean).join(', ')}
            </p>
          )}
          {target?.industry_label && (
            <p className="text-xs text-muted-foreground truncate">{target.industry_label}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ScoreBadge score={score} size="sm" />
          <Button
            variant="ghost" size="icon"
            className="h-5 w-5 text-muted-foreground hover:text-destructive"
            onClick={e => { e.stopPropagation(); onRemove(entry.id) }}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  )
}
