'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, Target, Filters } from '@/lib/api/client'
import TargetTable from './components/TargetTable'
import FilterPanel from './components/FilterPanel'
import ImportButton from './components/ImportButton'
import ScoreAllButton from './components/ScoreAllButton'
import MapView from './components/MapView'
import { Skeleton } from '@/components/ui/skeleton'
import { List, Map, Download, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const EMPTY_FILTERS: Filters = { search: '', country: '', industry_code: '', score_min: '', score_max: '' }

export default function DiscoveryPage() {
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [view, setView] = useState<'table' | 'map'>('table')

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

  const handleGeocode = async () => {
    const toastId = toast.loading('Geocoding targets…')
    try {
      const res = await api.targets.geocodeBatch()
      toast.success(`Geocoded ${res.success} of ${res.total} targets`, { id: toastId })
      load()
    } catch {
      toast.error('Geocoding failed', { id: toastId })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Discovery</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading ? 'Loading…' : `${targets.length} targets`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 border rounded-md p-0.5 bg-white">
            <button
              onClick={() => setView('table')}
              className={cn('p-1.5 rounded cursor-pointer transition-colors duration-150', view === 'table' ? 'bg-muted' : 'hover:bg-muted/50')}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setView('map')}
              className={cn('p-1.5 rounded cursor-pointer transition-colors duration-150', view === 'map' ? 'bg-muted' : 'hover:bg-muted/50')}
            >
              <Map className="h-3.5 w-3.5" />
            </button>
          </div>
          <a
            href={api.exports.csv(
              Object.fromEntries(
                Object.entries({
                  country: filters.country,
                  industry_code: filters.industry_code,
                  score_min: filters.score_min,
                }).filter(([, v]) => v)
              )
            )}
            download
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-white text-xs font-medium hover:bg-muted transition-colors duration-150 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <ImportButton onImported={load} />
          <button
            onClick={handleGeocode}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-white text-xs font-medium hover:bg-muted transition-colors duration-150 cursor-pointer"
          >
            <MapPin className="h-3.5 w-3.5" />
            Geocode
          </button>
          <ScoreAllButton onComplete={load} />
        </div>
      </div>

      <FilterPanel filters={filters} onChange={setFilters} onReset={() => setFilters(EMPTY_FILTERS)} />

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-11 w-full rounded-md" />
          ))}
        </div>
      ) : view === 'map' ? (
        <MapView targets={targets} />
      ) : (
        <TargetTable targets={targets} onDelete={handleDelete} />
      )}
    </div>
  )
}
