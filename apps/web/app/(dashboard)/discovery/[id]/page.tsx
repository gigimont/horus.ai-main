import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, MapPin, Users, TrendingUp, Calendar, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import ScoreBadge from '@/components/shared/ScoreBadge'
import ScoreGauge from '../components/ScoreGauge'
import CopilotChat from '../components/CopilotChat'
import AddToPipelineButton from '../components/AddToPipelineButton'
import ScenarioPanel from './components/ScenarioPanel'
import EnrichmentPanel from './components/EnrichmentPanel'
import OfficerNetworkPanel from './components/OfficerNetworkPanel'
import { createClient } from '@/lib/supabase/server'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function authHeader(): Promise<Record<string, string>> {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      return { Authorization: `Bearer ${session.access_token}` }
    }
  } catch {}
  return {}
}

async function getTarget(id: string, headers: Record<string, string>) {
  const res = await fetch(`${API}/targets/${id}`, { cache: 'no-store', headers })
  if (!res.ok) return null
  return res.json()
}

async function getSimilar(id: string, headers: Record<string, string>) {
  const res = await fetch(`${API}/targets/${id}/similar`, { cache: 'no-store', headers })
  if (!res.ok) return []
  const data = await res.json()
  return data.data ?? []
}

function fmt(n: number | null | undefined, prefix = '') {
  if (!n) return '—'
  return prefix + n.toLocaleString('en-EU')
}

export default async function TargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const headers = await authHeader()
  const [target, similar] = await Promise.all([getTarget(id, headers), getSimilar(id, headers)])

  if (!target) notFound()

  const score = target.target_scores?.[0]
  const chatContext = {
    name: target.name,
    country: target.country,
    industry: target.industry_label,
    employees: target.employee_count,
    revenue_eur: target.revenue_eur,
    founded_year: target.founded_year,
    owner_age_estimate: target.owner_age_estimate,
    overall_score: score?.overall_score,
    transition_score: score?.transition_score,
    value_score: score?.value_score,
    market_score: score?.market_score,
    financial_score: score?.financial_score,
    rationale: score?.rationale,
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <Link href="/discovery" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 cursor-pointer">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to discovery
      </Link>

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight">{target.name}</h1>
            <ScoreBadge score={score?.overall_score} size="md" />
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-xs text-muted-foreground">
            {(target.city || target.country) && (
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[target.city, target.region, target.country].filter(Boolean).join(', ')}
              </span>
            )}
            {target.industry_label && (
              <Badge variant="secondary" className="font-normal text-xs">{target.industry_label}</Badge>
            )}
            {target.website && (
              <a href={target.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                <ExternalLink className="h-3 w-3" /> Website
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`${API}/exports/report/${id}`}
            download
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-input bg-white text-xs font-medium hover:bg-muted transition-colors duration-150 cursor-pointer"
          >
            <FileText className="h-3.5 w-3.5" />
            Export PDF
          </a>
          <AddToPipelineButton targetId={id} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-sm">Company overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { icon: TrendingUp, label: 'Revenue',    value: fmt(target.revenue_eur, '€') },
                  { icon: Users,      label: 'Employees',  value: fmt(target.employee_count) },
                  { icon: Calendar,   label: 'Founded',    value: target.founded_year ?? '—' },
                  { icon: Users,      label: 'Owner age',  value: target.owner_age_estimate ? `~${target.owner_age_estimate}` : '—' },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Icon className="h-3.5 w-3.5" />{label}
                    </div>
                    <div className="text-lg font-semibold tabular-nums">{value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <EnrichmentPanel target={target} />
          <OfficerNetworkPanel targetId={id} />

          <Card>
            <CardHeader><CardTitle className="text-sm">Score breakdown</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              {score ? (
                <>
                  <ScoreGauge label="Transition readiness" score={score.transition_score} description="Owner succession risk — higher means more urgent opportunity" />
                  <ScoreGauge label="Value potential" score={score.value_score} description="Acquisition upside — cashflows, defensibility, improvement levers" />
                  <ScoreGauge label="Market attractiveness" score={score.market_score} description="Industry fragmentation and consolidation opportunity" />
                  <ScoreGauge label="Financial attractiveness" score={score.financial_score} description="Revenue size, efficiency, and business maturity" />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">This target has not been scored yet.</p>
              )}
            </CardContent>
          </Card>

          {score?.rationale && (
            <Card>
              <CardHeader><CardTitle className="text-sm">AI analysis</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm leading-relaxed">{score.rationale}</p>
                {score.key_signals?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {score.key_signals.map((s: string) => (
                      <Badge key={s} variant="outline" className="text-xs font-normal">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {similar.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Similar targets</CardTitle></CardHeader>
              <CardContent>
                <div className="divide-y">
                  {similar.map((t: { id: string; name: string; city: string | null; country: string | null; industry_label: string | null; target_scores: { overall_score: number }[] }) => (
                    <Link key={t.id} href={`/discovery/${t.id}`}
                      className="flex items-center justify-between py-2.5 hover:text-primary transition-colors">
                      <div>
                        <div className="text-sm font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[t.city, t.country].filter(Boolean).join(', ')}
                          {t.industry_label ? ` · ${t.industry_label}` : ''}
                        </div>
                      </div>
                      <ScoreBadge score={t.target_scores?.[0]?.overall_score} size="sm" />
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-sm">Scenario analysis</CardTitle></CardHeader>
            <CardContent>
              <ScenarioPanel
                targetId={id}
                currentScores={{
                  overall_score:    score?.overall_score    ?? null,
                  transition_score: score?.transition_score ?? null,
                  value_score:      score?.value_score      ?? null,
                  market_score:     score?.market_score     ?? null,
                  financial_score:  score?.financial_score  ?? null,
                  scored_at:        score?.scored_at        ?? null,
                }}
              />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card className="sticky top-6">
            <CardContent className="pt-4">
              <CopilotChat context={chatContext} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
