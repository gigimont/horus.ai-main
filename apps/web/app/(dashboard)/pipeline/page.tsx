'use client'
import { useState, useEffect } from 'react'
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core'
import { api, PipelineEntry, Target } from '@/lib/api/client'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Plus } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const STAGES = [
  { id: 'watchlist',  label: 'Watchlist',  color: 'bg-slate-50 border-slate-200' },
  { id: 'contacted',  label: 'Contacted',  color: 'bg-slate-50 border-slate-200' },
  { id: 'nda',        label: 'NDA signed', color: 'bg-slate-50 border-slate-200' },
  { id: 'loi',        label: 'LOI sent',   color: 'bg-amber-50 border-amber-200' },
  { id: 'closed',     label: 'Closed',     color: 'bg-emerald-50 border-emerald-200' },
]

export default function PipelinePage() {
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState<Target[]>([])
  const [searching, setSearching] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 8 }
  }))

  const loadEntries = () =>
    api.pipeline.list().then(r => { setEntries(r.data); setLoading(false) })

  useEffect(() => { loadEntries() }, [])

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

  const searchTargets = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearching(true)
    try {
      const res = await api.targets.list({ search: q })
      const inPipeline = new Set(entries.map(e => e.target_id))
      setSearchResults(res.data.filter(t => !inPipeline.has(t.id)))
    } finally {
      setSearching(false)
    }
  }

  const addTarget = async (targetId: string) => {
    try {
      await api.targets.addToPipeline(targetId)
      await loadEntries()
      setShowAdd(false)
      setSearch('')
      setSearchResults([])
      toast.success('Added to watchlist')
    } catch {
      toast.error('Failed to add to pipeline')
    }
  }

  const closeModal = () => { setShowAdd(false); setSearch(''); setSearchResults([]) }

  if (loading) return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
      <p className="text-muted-foreground text-sm">Loading...</p>
    </div>
  )

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {entries.length} {entries.length === 1 ? 'company' : 'companies'} tracked · drag cards to move stages
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setShowAdd(v => !v)}>
          <Plus className="h-3.5 w-3.5" />
          Add company
        </Button>
      </div>

      {showAdd && (
        <div className="border rounded-md bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Add to pipeline</p>
            <button onClick={closeModal} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
          </div>
          <Input
            className="h-8 text-sm"
            placeholder="Search companies..."
            value={search}
            onChange={e => { setSearch(e.target.value); searchTargets(e.target.value) }}
            autoFocus
          />
          {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
          {searchResults.length > 0 && (
            <div className="divide-y border rounded-md">
              {searchResults.map(t => (
                <div key={t.id} className="flex items-center justify-between px-3 py-2 hover:bg-muted/30">
                  <div>
                    <p className="text-xs font-medium">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {[t.city, t.country].filter(Boolean).join(', ')}
                      {t.industry_label ? ` · ${t.industry_label}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreBadge score={t.target_scores?.[0]?.overall_score} size="sm" />
                    <Button size="sm" className="h-6 text-xs px-2" onClick={() => addTarget(t.id)}>
                      Add
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {search && !searching && searchResults.length === 0 && (
            <p className="text-xs text-muted-foreground">No companies found</p>
          )}
        </div>
      )}

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

      {entries.length === 0 && !showAdd && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No companies in your pipeline yet.{' '}
          <button onClick={() => setShowAdd(true)} className="text-primary hover:underline">
            Add your first company
          </button>
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
        'rounded-md border p-3 transition-colors min-h-[400px]',
        stage.color,
        isOver && 'ring-2 ring-emerald-400 ring-offset-1'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          {stage.label}
        </span>
        <span className="text-xs font-medium text-muted-foreground bg-white rounded px-1.5 py-0.5 border">{entries.length}</span>
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
        'bg-white rounded-md border border-border p-3 cursor-grab active:cursor-grabbing select-none shadow-none hover:shadow-sm transition-shadow duration-150',
        isDragging && 'opacity-50 shadow-md'
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
