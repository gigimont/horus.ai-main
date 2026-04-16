import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const supabase = createClient()
  // getUser() validates the token against Supabase and triggers a silent
  // refresh if the access token is expired — must happen before getSession()
  await supabase.auth.getUser()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(err || `API error ${res.status}`)
  }
  return res.json()
}

export const api = {
  targets: {
    list: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return apiFetch<{ data: Target[]; count: number }>(`/targets/${qs}`)
    },
    get: (id: string) => apiFetch<Target>(`/targets/${id}`),
    create: (body: Partial<Target>) =>
      apiFetch<Target>('/targets/', { method: 'POST', body: JSON.stringify(body) }),
    delete: (id: string) =>
      apiFetch<void>(`/targets/${id}`, { method: 'DELETE' }),
    score: (id: string) =>
      apiFetch<{ message: string }>(`/targets/${id}/score`, { method: 'POST' }),
    similar: (id: string) =>
      apiFetch<{ data: Target[] }>(`/targets/${id}/similar`),
    geocode: (id: string) =>
      apiFetch<{ message: string; target_id: string }>(`/targets/${id}/geocode`, { method: 'POST' }),
    geocodeBatch: () =>
      apiFetch<{ total: number; success: number; failed: number }>('/targets/geocode/batch', { method: 'POST' }),
    embedBatch: () =>
      apiFetch<{ message: string }>('/targets/embed/batch', { method: 'POST' }),
    addToPipeline: (targetId: string) =>
      apiFetch<{ message: string }>('/pipeline/', {
        method: 'POST',
        body: JSON.stringify({ target_id: targetId, stage: 'watchlist' }),
      }),
    update: (id: string, data: Partial<Target>) =>
      apiFetch<Target>(`/targets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    bulkImport: (file: File) => {
      const form = new FormData()
      form.append('file', file)
      return apiFetch<{ inserted: number }>('/targets/bulk', {
        method: 'POST',
        body: form,
        headers: {},
      })
    },
  },
  scoring: {
    batch: () => apiFetch<{ message: string; total: number }>('/scoring/batch', { method: 'POST' }),
    status: () => apiFetch<{ running: boolean; total: number; done: number; errors: number }>('/scoring/status'),
  },
  pipeline: {
    list: () => apiFetch<{ data: PipelineEntry[] }>('/pipeline/'),
    update: (id: string, stage: string) =>
      apiFetch<PipelineEntry>(`/pipeline/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ stage }),
      }),
    remove: (id: string) =>
      apiFetch<void>(`/pipeline/${id}`, { method: 'DELETE' }),
  },
  exports: {
    csv: (params?: Record<string, string>) => {
      const qs = params ? '?' + new URLSearchParams(params).toString() : ''
      return `${API_URL}/exports/targets.csv${qs}`
    },
    report: (targetId: string) => `${API_URL}/exports/report/${targetId}`,
  },
  clusters: {
    list: () => apiFetch<{ data: Cluster[] }>('/clusters/'),
    refresh: () => apiFetch<{ message: string }>('/clusters/refresh', { method: 'POST' }),
    status: () => apiFetch<{ running: boolean; done: boolean; count: number }>('/clusters/status'),
  },
  rollup: {
    list: () =>
      apiFetch<{ data: RollupScenario[] }>('/rollup/'),
    create: (name: string, description?: string) =>
      apiFetch<RollupScenario>('/rollup/', {
        method: 'POST',
        body: JSON.stringify({ name, description }),
      }),
    get: (id: string) =>
      apiFetch<RollupScenario>(`/rollup/${id}`),
    update: (id: string, data: { name?: string; description?: string; status?: string }) =>
      apiFetch<RollupScenario>(`/rollup/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      apiFetch<void>(`/rollup/${id}`, { method: 'DELETE' }),
    duplicate: (id: string) =>
      apiFetch<RollupScenario>(`/rollup/${id}/duplicate`, { method: 'POST' }),
    addTarget: (scenarioId: string, targetId: string) =>
      apiFetch<RollupScenario>(`/rollup/${scenarioId}/targets`, {
        method: 'POST',
        body: JSON.stringify({ target_id: targetId }),
      }),
    updateTarget: (scenarioId: string, targetId: string, data: Partial<RollupScenarioTarget>) =>
      apiFetch<RollupScenarioTarget>(`/rollup/${scenarioId}/targets/${targetId}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    removeTarget: (scenarioId: string, targetId: string) =>
      apiFetch<void>(`/rollup/${scenarioId}/targets/${targetId}`, { method: 'DELETE' }),
    reorder: (scenarioId: string, order: { target_id: string; sequence_order: number }[]) =>
      apiFetch<{ ok: boolean }>(`/rollup/${scenarioId}/reorder`, {
        method: 'POST',
        body: JSON.stringify({ order }),
      }),
    financials: (id: string) =>
      apiFetch<RollupFinancials>(`/rollup/${id}/financials`),
    estimateEbitda: (scenarioId: string, targetId: string) =>
      apiFetch<{ ebitda_margin_pct: number; ebitda_margin_source: string }>(
        `/rollup/${scenarioId}/estimate-ebitda/${targetId}`,
        { method: 'POST' }
      ),
    sequence: (id: string) =>
      apiFetch<{ suggestions: { target_id: string; suggested_order: number; rationale: string }[] }>(
        `/rollup/${id}/sequence`,
        { method: 'POST' }
      ),
    memo: (id: string) =>
      apiFetch<{ memo: string }>(`/rollup/${id}/memo`, { method: 'POST' }),
    memoPdfUrl: (id: string) => `${API_URL}/rollup/${id}/memo/pdf`,
  },
  scenarios: {
    run: (
      targetId: string,
      params: { scenario_type: string; severity: number; description: string },
      rollupScenarioId?: string
    ) =>
      apiFetch<ScenarioResult>('/scenarios/run', {
        method: 'POST',
        body: JSON.stringify({
          target_id: targetId,
          ...params,
          ...(rollupScenarioId ? { rollup_scenario_id: rollupScenarioId } : {}),
        }),
      }),
    forTarget: (targetId: string) =>
      apiFetch<{ data: ScenarioResult[] }>(`/scenarios/target/${targetId}`),
    delete: (resultId: string) =>
      apiFetch<void>(`/scenarios/${resultId}`, { method: 'DELETE' }),
  },
  network: {
    analyse: (scenarioId: string) =>
      apiFetch<{ edges_created: number; target_count: number }>(
        `/network/analyse/${scenarioId}`,
        { method: 'POST' }
      ),
    get: (scenarioId: string) =>
      apiFetch<NetworkGraph>(`/network/${scenarioId}`),
    stats: (scenarioId: string) =>
      apiFetch<NetworkStats>(`/network/${scenarioId}/stats`),
    clear: (scenarioId: string) =>
      apiFetch<void>(`/network/${scenarioId}`, { method: 'DELETE' }),
  },
  enrichment: {
    enrich: (targetId: string, force = false) =>
      apiFetch<EnrichmentJob>(
        `/enrichment/enrich/${targetId}${force ? '?force=true' : ''}`,
        { method: 'POST' }
      ),
    enrichBatch: (targetIds: string[], force = false) =>
      apiFetch<BatchEnrichmentResult>(
        `/enrichment/enrich-batch${force ? '?force=true' : ''}`,
        { method: 'POST', body: JSON.stringify({ target_ids: targetIds }) }
      ),
    enrichAll: () =>
      apiFetch<{ total_queued: number; succeeded: number; failed: number; started: boolean }>(
        '/enrichment/enrich-all',
        { method: 'POST' }
      ),
    jobs: (targetId: string) =>
      apiFetch<{ data: EnrichmentJob[] }>(`/enrichment/jobs/${targetId}`),
    stats: () =>
      apiFetch<EnrichmentStats>('/enrichment/stats'),
  },
}

export interface Filters {
  search: string
  country: string
  industry_code: string
  score_min: string
  score_max: string
}

export interface TargetScore {
  overall_score: number
  transition_score: number
  value_score: number
  market_score: number
  financial_score: number
  rationale: string
  key_signals: string[]
  scored_at: string
}

export interface DirectorRole {
  name: string
  role: string
  start_date: string | null
  end_date: string | null
  status: 'active' | 'inactive'
}

export interface Target {
  id: string
  tenant_id: string
  name: string
  country: string | null
  region: string | null
  city: string | null
  industry_label: string | null
  industry_code: string | null
  employee_count: number | null
  revenue_eur: number | null
  founded_year: number | null
  owner_age_estimate: number | null
  website: string | null
  linkedin_url: string | null
  lat: number | null
  lng: number | null
  geocoded_at: string | null
  created_at: string
  updated_at: string
  target_scores: TargetScore[]
  // Enrichment fields
  enrichment_status: 'none' | 'pending' | 'enriched' | 'partial' | 'failed' | null
  last_enriched_at: string | null
  enrichment_data: Record<string, unknown> | null
  legal_form: string | null
  share_capital: string | null
  directors: string[] | null
  director_roles: DirectorRole[] | null
  registration_number: string | null
  registration_authority: string | null
  lei_code: string | null
  parent_company: string | null
  ultimate_parent: string | null
  data_sources: string[] | null
  // Web enrichment fields
  is_family_business: boolean | null
  succession_risk: 'high' | 'medium' | 'low' | 'unknown' | null
  succession_signals: Record<string, unknown> | null
  founder_age_estimate: string | null
  founder_age_reasoning: string | null
  products_services: string[] | null
  industries_served: string[] | null
  geographic_focus: string | null
  key_customers: string[] | null
  key_suppliers: string[] | null
  web_analysis: Record<string, unknown> | null
}

export interface EnrichmentSource {
  id: string
  job_id: string
  provider: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  confidence: number
  extracted_data: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  completed_at: string | null
}

export interface EnrichmentJob {
  id: string
  target_id: string
  status: 'pending' | 'running' | 'completed' | 'partial' | 'failed'
  providers_completed: string[]
  providers_failed: string[]
  data_enriched: Record<string, unknown>
  error_message: string | null
  created_at: string
  completed_at: string | null
  enrichment_sources?: EnrichmentSource[]
}

export interface BatchEnrichmentResult {
  total: number
  succeeded: number
  failed: number
  skipped: number
  results: EnrichmentJob[]
}

export interface EnrichmentStats {
  total_enriched: number
  total_partial: number
  total_pending: number
  total_failed: number
  total_none: number
  total_targets: number
  providers_used: Record<string, number>
  last_enrichment_at: string | null
}

export interface PipelineEntry {
  id: string
  target_id: string
  stage: string
  notes: string | null
  created_at: string
  updated_at: string
  targets: {
    id: string
    name: string
    country: string | null
    city: string | null
    industry_label: string | null
    target_scores: { overall_score: number }[]
  } | null
}

export interface Cluster {
  id: string
  label: string
  description: string
  cluster_type: string
  member_count: number
  metadata: {
    country: string
    industry_label: string
    transition_bracket: string
    member_ids: string[]
  }
  cluster_members: {
    target_id: string
    targets: {
      id: string
      name: string
      country: string | null
      city: string | null
      industry_label: string | null
      target_scores: { overall_score: number }[]
    } | null
  }[]
}

export interface RollupScenario {
  id: string
  tenant_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'archived'
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  target_count?: number
  rollup_scenario_targets?: RollupScenarioTarget[]
}

export interface RollupScenarioTarget {
  id: string
  scenario_id: string
  target_id: string
  sequence_order: number
  entry_multiple: number
  ebitda_margin_pct: number | null
  ebitda_margin_source: 'ai' | 'manual'
  synergy_pct: number
  revenue_uplift_pct: number
  debt_pct: number
  integration_cost_eur: number
  hold_period_years: number
  notes: string | null
  targets?: {
    id: string
    name: string
    country: string | null
    city: string | null
    industry_label: string | null
    industry_code: string | null
    revenue_eur: number | null
    employee_count: number | null
    founded_year: number | null
    owner_age_estimate: number | null
    target_scores: { overall_score: number; transition_score: number; financial_score: number; key_signals: string[]; rationale: string }[]
  } | null
}

export interface TargetFinancials {
  target_id: string
  name: string
  sequence_order: number
  revenue_eur: number
  ebitda: number
  entry_cost: number
  debt: number
  equity_in: number
  synergy_value: number
  revenue_uplift: number
}

export interface CombinedFinancials {
  total_revenue: number
  total_ebitda_pre_synergy: number
  total_synergy_value: number
  total_revenue_uplift: number
  proforma_ebitda: number
  proforma_revenue: number
  total_entry_cost: number
  total_integration_cost: number
  total_equity_in: number
  total_debt: number
  avg_entry_multiple: number
  exit_value: number
  equity_return_pct: number
}

export interface RollupFinancials {
  targets: TargetFinancials[]
  combined: CombinedFinancials
}

export interface ScoreDeltas {
  overall_delta: number
  transition_delta: number
  value_delta: number
  market_delta: number
  financial_delta: number
}

export interface ScenarioResult {
  id: string
  tenant_id: string
  target_id: string
  rollup_scenario_id: string | null
  scenario_type: 'macro_shock' | 'industry_shift' | 'succession_trigger'
  severity: number
  description: string
  score_before: {
    overall_score: number | null
    transition_score: number | null
    value_score: number | null
    market_score: number | null
    financial_score: number | null
    scored_at: string | null
  }
  score_deltas: ScoreDeltas
  implications: string[]
  acquisition_window_effect: string
  model_version: string
  run_at: string
}

export interface NetworkEdge {
  id: string
  scenario_id: string
  source_target_id: string
  dest_target_id: string
  edge_type: 'supply_chain' | 'geographic' | 'industry' | 'customer_overlap' | 'vendor_overlap'
  strength: number
  description: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface NetworkStats {
  total_edges: number
  avg_strength: number
  edge_type_distribution: Record<string, number>
  most_connected: { target_id: string; name: string; edge_count: number } | null
  isolated_targets: string[]
}

export interface NetworkGraph {
  nodes: Target[]
  edges: NetworkEdge[]
}

export async function streamChat(
  messages: { role: string; content: string }[],
  context: Record<string, unknown>,
  onChunk: (text: string) => void,
  onDone: () => void
) {
  const res = await fetch(`${API_URL}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  })

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value)
    const lines = chunk.split('\n').filter(l => l.startsWith('data: '))
    for (const line of lines) {
      const data = line.replace('data: ', '')
      if (data === '[DONE]') { onDone(); return }
      try {
        const parsed = JSON.parse(data)
        if (parsed.text) onChunk(parsed.text)
      } catch {}
    }
  }
  onDone()
}
