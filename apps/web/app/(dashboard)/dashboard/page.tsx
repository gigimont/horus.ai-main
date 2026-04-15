import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, TrendingUp, Clock, Target, Database } from 'lucide-react'

async function getStats() {
  const supabase = await createClient()
  const DEMO_TENANT = '00000000-0000-0000-0000-000000000001'

  const [targets, scores, enriched] = await Promise.all([
    supabase.from('targets').select('id, created_at', { count: 'exact' })
      .eq('tenant_id', DEMO_TENANT).is('deleted_at', null),
    supabase.from('target_scores').select('overall_score, transition_score')
      .eq('tenant_id', DEMO_TENANT),
    supabase.from('targets').select('id', { count: 'exact' })
      .eq('tenant_id', DEMO_TENANT).is('deleted_at', null).eq('enrichment_status', 'enriched'),
  ])

  const total = targets.count ?? 0
  const scoreList = scores.data ?? []
  const avgScore = scoreList.length
    ? (scoreList.reduce((s, r) => s + (r.overall_score ?? 0), 0) / scoreList.length).toFixed(1)
    : '—'
  const highTransition = scoreList.filter(r => (r.transition_score ?? 0) >= 7).length

  const totalEnriched = enriched.count ?? 0
  return { total, avgScore, highTransition, scored: scoreList.length, totalEnriched }
}

export default async function DashboardPage() {
  const stats = await getStats()

  const cards = [
    { title: 'Total targets',        value: stats.total,          icon: Building2,   desc: 'In your universe' },
    { title: 'Scored targets',       value: stats.scored,         icon: Target,      desc: 'AI analysis complete' },
    { title: 'Avg overall score',    value: stats.avgScore,       icon: TrendingUp,  desc: 'Out of 10.0' },
    { title: 'High transition risk', value: stats.highTransition, icon: Clock,       desc: 'Score ≥ 7 — act soon' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Your acquisition universe at a glance</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ title, value, icon: Icon, desc }) => (
          <Card key={title} className="border-border shadow-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</CardTitle>
              <Icon className="h-3.5 w-3.5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="text-2xl font-semibold tabular-nums">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-border shadow-none">
        <CardHeader className="flex flex-row items-center justify-between pb-2 pt-4 px-5">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data enrichment</CardTitle>
          <Database className="h-3.5 w-3.5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="px-5 pb-4">
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tabular-nums">{stats.totalEnriched}</span>
            <span className="text-sm text-muted-foreground">/ {stats.total} targets enriched</span>
          </div>
          {stats.total > 0 && (
            <div className="mt-2">
              <div className="h-1.5 bg-muted rounded-sm overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-sm transition-all"
                  style={{ width: `${Math.round((stats.totalEnriched / stats.total) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {Math.round((stats.totalEnriched / stats.total) * 100)}% enriched
              </p>
            </div>
          )}
          {stats.totalEnriched < stats.total && (
            <a
              href="/discovery"
              className="inline-flex items-center gap-1 mt-2 text-xs text-emerald-700 hover:text-emerald-800 transition-colors cursor-pointer"
            >
              Enrich remaining →
            </a>
          )}
        </CardContent>
      </Card>
      <Card className="border-border shadow-none">
        <CardHeader className="pb-2 pt-4 px-5">
          <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2 px-5 pb-4">
          <p>→ Go to <strong className="text-foreground font-medium">Discovery</strong> to browse and score your SME targets</p>
          <p>→ Import a CSV to add targets in bulk</p>
          <p>→ Add targets to your <strong className="text-foreground font-medium">Pipeline</strong> to track outreach</p>
        </CardContent>
      </Card>
    </div>
  )
}
