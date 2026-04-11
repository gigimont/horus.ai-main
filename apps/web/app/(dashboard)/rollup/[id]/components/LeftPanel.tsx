// apps/web/app/(dashboard)/rollup/[id]/components/LeftPanel.tsx
'use client'
import { useState, useEffect } from 'react'
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { api, RollupScenarioTarget } from '@/lib/api/client'
import TargetRow from './TargetRow'
import { Search, Wand2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  targets: RollupScenarioTarget[]
  scenarioId: string
  onAddTarget: (targetId: string) => Promise<void>
  onRemoveTarget: (targetId: string) => Promise<void>
  onUpdateAssumption: (targetId: string, field: keyof RollupScenarioTarget, value: number) => void
  onReorder: (activeId: string, overId: string) => Promise<void>
  onApplySequence: () => Promise<unknown>
}

export default function LeftPanel({
  targets, scenarioId, onAddTarget, onRemoveTarget, onUpdateAssumption, onReorder, onApplySequence
}: Props) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<{id: string; name: string; city?: string | null; country?: string | null}[]>([])
  const [searching, setSearching] = useState(false)
  const [adding, setAdding] = useState<string | null>(null)
  const [sequencing, setSequencing] = useState(false)

  const inScenario = new Set(targets.map(t => t.target_id))

  const totalRevenue = targets.reduce((s, t) => s + (t.targets?.revenue_eur ?? 0), 0)

  useEffect(() => {
    if (!search.trim()) { setResults([]); return }
    const timer = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await api.targets.list({ search })
        setResults((res.data ?? []).filter((t) => !inScenario.has(t.id)))
      } catch {
        setResults([])
      } finally { setSearching(false) }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  const handleAdd = async (targetId: string) => {
    setAdding(targetId)
    try {
      await onAddTarget(targetId)
      setSearch('')
      setResults([])
      toast.success('Target added — EBITDA margin estimated')
    } catch {
      toast.error('Failed to add target')
    } finally {
      setAdding(null)
    }
  }

  const handleSequence = async () => {
    if (targets.length < 2) { toast.error('Need at least 2 targets to sequence'); return }
    setSequencing(true)
    try {
      await onApplySequence()
      toast.success('Sequence applied')
    } catch {
      toast.error('Sequencing failed')
    } finally {
      setSequencing(false)
    }
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      onReorder(active.id as string, over.id as string)
    }
  }

  function fmtRevenue(n: number) {
    if (n >= 1_000_000) return `€${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `€${(n / 1_000).toFixed(0)}K`
    return `€${n}`
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="p-3 border-b space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <input
            className="h-8 w-full pl-8 pr-3 rounded-sm border border-input bg-background text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search targets to add…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {searching && <p className="text-xs text-muted-foreground">Searching…</p>}

        {results.length > 0 && (
          <div className="border rounded-sm divide-y max-h-48 overflow-y-auto">
            {results.map(t => (
              <div key={t.id} className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/30">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{t.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[t.city, t.country].filter(Boolean).join(', ')}
                  </p>
                </div>
                <button
                  className={cn(
                    'shrink-0 text-xs px-2 py-1 rounded-sm border border-input hover:bg-accent transition-colors ml-2',
                    adding === t.id && 'opacity-50 pointer-events-none'
                  )}
                  onClick={() => handleAdd(t.id)}
                >
                  {adding === t.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Add'}
                </button>
              </div>
            ))}
          </div>
        )}

        {search && !searching && results.length === 0 && (
          <p className="text-xs text-muted-foreground">No targets found</p>
        )}
      </div>

      {/* Target list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {targets.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">
            Search above to add targets to this scenario
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={targets.map(t => t.target_id)} strategy={verticalListSortingStrategy}>
              {targets.map((t, i) => (
                <TargetRow
                  key={t.target_id}
                  target={t}
                  index={i}
                  onChange={(field, value) => onUpdateAssumption(t.target_id, field, value)}
                  onRemove={() => onRemoveTarget(t.target_id)}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t space-y-2">
        {targets.length >= 2 && (
          <button
            className="w-full flex items-center justify-center gap-1.5 h-7 text-xs border border-input rounded-sm hover:bg-accent transition-colors"
            onClick={handleSequence}
            disabled={sequencing}
          >
            {sequencing
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Sequencing…</>
              : <><Wand2 className="h-3 w-3" /> AI suggest sequence</>}
          </button>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{targets.length} target{targets.length !== 1 ? 's' : ''}</span>
          <span className="font-medium text-foreground">{fmtRevenue(totalRevenue)} combined rev.</span>
        </div>
      </div>
    </div>
  )
}
