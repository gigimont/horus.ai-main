// apps/web/app/(dashboard)/rollup/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { api, RollupScenario } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { Plus, Trash2, Copy, GitCompare, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function RollupPage() {
  const router = useRouter()
  const [scenarios, setScenarios] = useState<RollupScenario[]>([])
  const [loading, setLoading] = useState(true)
  const [compareSet, setCompareSet] = useState<Set<string>>(new Set())

  useEffect(() => {
    api.rollup.list().then(r => { setScenarios(r.data); setLoading(false) })
  }, [])

  const handleCreate = async () => {
    const name = `Roll-up scenario ${new Date().toLocaleDateString('en-GB')}`
    const s = await api.rollup.create(name)
    router.push(`/rollup/${s.id}`)
  }

  const handleDuplicate = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    const s = await api.rollup.duplicate(id)
    toast.success('Scenario duplicated')
    setScenarios(prev => [s, ...prev])
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    if (!confirm('Delete this scenario?')) return
    await api.rollup.delete(id)
    setScenarios(prev => prev.filter(s => s.id !== id))
    toast.success('Scenario deleted')
  }

  const toggleCompare = (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    setCompareSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else {
        if (next.size >= 2) { toast.error('Select exactly 2 scenarios to compare'); return prev }
        next.add(id)
      }
      return next
    })
  }

  const handleCompare = () => {
    const [a, b] = [...compareSet]
    router.push(`/rollup/compare?a=${a}&b=${b}`)
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    active: 'bg-emerald-50 text-emerald-700',
    archived: 'bg-amber-50 text-amber-700',
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Roll-up Modeler</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading ? 'Loading…' : `${scenarios.length} scenario${scenarios.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {compareSet.size === 2 && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCompare}>
              <GitCompare className="h-3.5 w-3.5" />
              Compare
            </Button>
          )}
          <Button size="sm" className="gap-1.5" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
            New scenario
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading scenarios…</p>
      ) : scenarios.length === 0 ? (
        <div className="border rounded-sm p-12 text-center text-sm text-muted-foreground">
          <TrendingUp className="h-8 w-8 mx-auto mb-3 opacity-20" />
          <p className="font-medium mb-1">No roll-up scenarios yet</p>
          <p className="mb-4">Model a portfolio acquisition strategy across multiple targets.</p>
          <Button size="sm" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Create first scenario
          </Button>
        </div>
      ) : (
        <div className="border rounded-sm divide-y">
          {scenarios.map(s => (
            <Link
              key={s.id}
              href={`/rollup/${s.id}`}
              className={cn(
                'flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors group',
                compareSet.has(s.id) && 'bg-blue-50/50'
              )}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded-full', STATUS_COLORS[s.status] ?? STATUS_COLORS.draft)}>
                    {s.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {s.target_count ?? 0} target{(s.target_count ?? 0) !== 1 ? 's' : ''}
                  {' · '}Last edited {new Date(s.updated_at).toLocaleDateString('en-GB')}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  className={cn(
                    'p-1.5 rounded text-xs border transition-colors',
                    compareSet.has(s.id)
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'border-input hover:bg-accent text-muted-foreground'
                  )}
                  onClick={e => toggleCompare(s.id, e)}
                  title="Select for comparison"
                >
                  <GitCompare className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1.5 rounded border border-input hover:bg-accent text-muted-foreground transition-colors"
                  onClick={e => handleDuplicate(s.id, e)}
                  title="Duplicate"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  className="p-1.5 rounded border border-input hover:text-destructive text-muted-foreground transition-colors"
                  onClick={e => handleDelete(s.id, e)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
