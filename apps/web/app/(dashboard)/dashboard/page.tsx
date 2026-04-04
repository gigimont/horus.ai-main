import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, TrendingUp, Clock, Target } from 'lucide-react'

async function getStats() {
  const supabase = await createClient()
  const DEMO_TENANT = '00000000-0000-0000-0000-000000000001'

  const [targets, scores] = await Promise.all([
    supabase.from('targets').select('id, created_at', { count: 'exact' })
      .eq('tenant_id', DEMO_TENANT).is('deleted_at', null),
    supabase.from('target_scores').select('overall_score, transition_score')
      .eq('tenant_id', DEMO_TENANT),
  ])

  const total = targets.count ?? 0
  const scoreList = scores.data ?? []
  const avgScore = scoreList.length
    ? (scoreList.reduce((s, r) => s + (r.overall_score ?? 0), 0) / scoreList.length).toFixed(1)
    : '—'
  const highTransition = scoreList.filter(r => (r.transition_score ?? 0) >= 7).length

  return { total, avgScore, highTransition, scored: scoreList.length }
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
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">Your acquisition universe at a glance</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ title, value, icon: Icon, desc }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
              <p className="text-xs text-muted-foreground mt-1">{desc}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>→ Go to <strong>Discovery</strong> to browse and score your SME targets</p>
          <p>→ Import a CSV to add targets in bulk</p>
          <p>→ Add targets to your <strong>Pipeline</strong> to track outreach</p>
        </CardContent>
      </Card>
    </div>
  )
}
