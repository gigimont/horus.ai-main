'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, Target, Filters } from '@/lib/api/client'
import TargetTable from './components/TargetTable'
import FilterPanel from './components/FilterPanel'
import ImportButton from './components/ImportButton'
import ScoreAllButton from './components/ScoreAllButton'
import { Skeleton } from '@/components/ui/skeleton'

const EMPTY_FILTERS: Filters = { search: '', country: '', industry_code: '', score_min: '', score_max: '' }

export default function DiscoveryPage() {
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filters.search)        params.search        = filters.search
      if (filters.country)       params.country       = filters.country
      if (filters.industry_code) params.industry_code = filters.industry_code
      if (filters.score_min)     params.score_min     = filters.score_min
      if (filters.score_max)     params.score_max     = filters.score_max
      const res = await api.targets.list(params)
      setTargets(res.data)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => { load() }, [load])

  const handleDelete = (id: string) => setTargets(prev => prev.filter(t => t.id !== id))

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Discovery</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {loading ? 'Loading…' : `${targets.length} targets`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportButton onImported={load} />
          <ScoreAllButton onComplete={load} />
        </div>
      </div>

      <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : (
        <TargetTable targets={targets} onDelete={handleDelete} />
      )}
    </div>
  )
}
