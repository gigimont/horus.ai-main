'use client'
import { useState, useEffect, useCallback } from 'react'
import { api, Target, Filters } from '@/lib/api/client'
import TargetTable from './components/TargetTable'
import FilterPanel from './components/FilterPanel'
import ImportButton from './components/ImportButton'
import ScoreAllButton from './components/ScoreAllButton'
import MapView from './components/MapView'
import { Skeleton } from '@/components/ui/skeleton'
import { List, Map, Download, MapPin, Sparkles, Database, Search, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

const EMPTY_FILTERS: Filters = { search: '', country: '', industry_code: '', score_min: '', score_max: '' }

export default function DiscoveryPage() {
  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [view, setView] = useState<'table' | 'map'>('table')
  const [enrichAllLoading, setEnrichAllLoading] = useState(false)
  const [findWebsitesLoading, setFindWebsitesLoading] = useState(false)
  const [networkScanLoading, setNetworkScanLoading] = useState(false)

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

  const handleEmbed = async () => {
    const toastId = toast.loading('Starting embedding…')
    try {
      await api.targets.embedBatch()
      toast.success('Embedding started — similar targets will improve shortly', { id: toastId })
    } catch {
      toast.error('Embedding failed', { id: toastId })
    }
  }

  const handleGeocode = async () => {
    const toastId = toast.loading('Geocoding targets…')
    try {
      const res = await api.targets.geocodeBatch()
      if (res.total === 0) {
        toast.success('All targets already have coordinates', { id: toastId })
      } else {
        toast.success(`Geocoded ${res.success} of ${res.total} targets`, { id: toastId })
        load()
      }
    } catch {
      toast.error('Geocoding failed', { id: toastId })
    }
  }

  const handleFindWebsites = async () => {
    setFindWebsitesLoading(true)
    const toastId = toast.loading('Searching for company websites…')
    try {
      const res = await api.enrichment.discoverWebsites(false)
      if (res.found === 0) {
        toast.success('No new websites found', { id: toastId })
      } else {
        toast.success(
          `Found ${res.found} of ${res.total_searched} websites`,
          {
            id: toastId,
            description: res.found > 0 ? 'Re-enrich those targets to extract web intelligence.' : undefined,
            duration: 6000,
          }
        )
      }
      if (res.found > 0) load()
    } catch {
      toast.error('Website discovery failed', { id: toastId })
    } finally {
      setFindWebsitesLoading(false)
    }
  }

  const handleNetworkScan = async () => {
    setNetworkScanLoading(true)
    const toastId = toast.loading('Scanning officer network…')
    try {
      const res = await api.officerNetwork.scan()
      const { shared_officers_found, family_clusters_found } = res.stats
      toast.success(
        `Found ${shared_officers_found} shared officers, ${family_clusters_found} family clusters`,
        { id: toastId }
      )
    } catch {
      toast.error('Network scan failed', { id: toastId })
    } finally {
      setNetworkScanLoading(false)
    }
  }

  const handleEnrichAll = async () => {
    setEnrichAllLoading(true)
    const toastId = toast.loading('Enriching all targets…')
    try {
      const res = await api.enrichment.enrichAll()
      toast.success(
        `Enriched ${res.succeeded ?? res.total_queued} of ${res.total_queued} targets`,
        { id: toastId }
      )
      load()
    } catch {
      toast.error('Enrich all failed', { id: toastId })
    } finally {
      setEnrichAllLoading(false)
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
          <button
            onClick={handleEmbed}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs hover:bg-accent transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Embed
          </button>
          <ScoreAllButton onComplete={load} />
          <button
            onClick={handleFindWebsites}
            disabled={findWebsitesLoading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Search className="h-3.5 w-3.5" />
            {findWebsitesLoading ? 'Searching…' : 'Find websites'}
          </button>
          <button
            onClick={handleEnrichAll}
            disabled={enrichAllLoading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Database className="h-3.5 w-3.5" />
            {enrichAllLoading ? 'Enriching…' : 'Enrich all'}
          </button>
          <button
            onClick={handleNetworkScan}
            disabled={networkScanLoading}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs hover:bg-accent transition-colors disabled:opacity-50 cursor-pointer"
          >
            <Network className="h-3.5 w-3.5" />
            {networkScanLoading ? 'Scanning…' : 'Scan network'}
          </button>
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
