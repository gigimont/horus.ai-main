'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { api, Cluster } from '@/lib/api/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import ScoreBadge from '@/components/shared/ScoreBadge'
import { RefreshCw, Loader2, MapPin, Building2, ChevronDown, ChevronUp, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

const TRANSITION_COLORS: Record<string, string> = {
  high:   'bg-red-50 text-red-700 ring-1 ring-red-200',
  medium: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  low:    'bg-slate-100 text-slate-600',
}

const SHOW_LIMIT = 5

function ClusterCard({ cluster }: { cluster: Cluster }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [creatingStrategy, setCreatingStrategy] = useState(false)
  const [strategyId, setStrategyId] = useState<string | null>(null)

  const bracket = cluster.metadata?.transition_bracket
  const allMembers = cluster.cluster_members ?? []
  const visible = expanded ? allMembers : allMembers.slice(0, SHOW_LIMIT)
  const overflow = allMembers.length - SHOW_LIMIT

  async function handleCreateStrategy() {
    setCreatingStrategy(true)
    try {
      const scenario = await api.rollup.fromCluster(cluster.id)
      setStrategyId(scenario.id)
      toast.success(`Strategy created with ${cluster.member_count} targets`, {
        description: cluster.label,
        action: { label: 'Open', onClick: () => router.push(`/rollup/${scenario.id}`) },
        duration: 8000,
      })
    } catch {
      toast.error('Could not create strategy from cluster')
    } finally {
      setCreatingStrategy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-semibold leading-snug">{cluster.label}</CardTitle>
          {bracket && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${TRANSITION_COLORS[bracket] ?? ''}`}>
              {bracket} transition
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{cluster.description}</p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {cluster.metadata?.country && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />{cluster.metadata.country}
            </span>
          )}
          {cluster.metadata?.industry_label && (
            <span className="flex items-center gap-1">
              <Building2 className="h-3 w-3" />{cluster.metadata.industry_label}
            </span>
          )}
          <Badge variant="secondary" className="text-xs font-normal">
            {cluster.member_count} companies
          </Badge>
        </div>

        <div className="divide-y">
          {visible.map(m => {
            const t = m.targets
            if (!t) return null
            const score = t.target_scores?.[0]?.overall_score
            return (
              <Link
                key={m.target_id}
                href={`/discovery/${t.id}`}
                className="flex items-center justify-between py-1.5 hover:text-primary transition-colors"
              >
                <div>
                  <span className="text-xs font-medium">{t.name}</span>
                  {(t.city || t.country) && (
                    <span className="text-xs text-muted-foreground ml-1.5">
                      {[t.city, t.country].filter(Boolean).join(', ')}
                    </span>
                  )}
                </div>
                <ScoreBadge score={score} size="sm" />
              </Link>
            )
          })}
        </div>

        {overflow > 0 && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {expanded
              ? <><ChevronUp className="h-3.5 w-3.5" /> Show less</>
              : <><ChevronDown className="h-3.5 w-3.5" /> +{overflow} more companies</>
            }
          </button>
        )}

        <div className="flex items-center gap-2 pt-1 border-t border-border">
          {strategyId ? (
            <Link
              href={`/rollup/${strategyId}`}
              className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
            >
              <TrendingUp className="h-3 w-3" /> View strategy →
            </Link>
          ) : (
            <button
              onClick={handleCreateStrategy}
              disabled={creatingStrategy}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 cursor-pointer"
            >
              {creatingStrategy
                ? <><Loader2 className="h-3 w-3 animate-spin" /> Creating…</>
                : <><TrendingUp className="h-3 w-3" /> Create roll-up strategy</>
              }
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<Cluster[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const load = async () => {
    const res = await api.clusters.list()
    setClusters(res.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleRefresh = async () => {
    setRefreshing(true)
    await api.clusters.refresh()
    pollRef.current = setInterval(async () => {
      const status = await api.clusters.status()
      if (!status.running) {
        clearInterval(pollRef.current)
        await load()
        setRefreshing(false)
      }
    }, 1500)
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Clusters</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading ? 'Loading…' : clusters.length === 0
              ? 'No clusters yet — click Refresh to generate'
              : `${clusters.length} clusters · ${clusters.reduce((s, c) => s + c.member_count, 0)} targets grouped`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/rollup"
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-sm border border-input bg-background text-xs font-medium hover:bg-accent transition-colors"
          >
            Build roll-up →
          </Link>
          <Button size="sm" variant="outline" className="gap-2" onClick={handleRefresh} disabled={refreshing}>
            {refreshing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Clustering…</>
              : <><RefreshCw className="h-4 w-4" /> Refresh clusters</>}
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading clusters…</p>
      ) : clusters.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Click <strong>Refresh clusters</strong> to group your targets by geography, industry, and transition readiness.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clusters.map(cluster => (
            <ClusterCard key={cluster.id} cluster={cluster} />
          ))}
        </div>
      )}
    </div>
  )
}
