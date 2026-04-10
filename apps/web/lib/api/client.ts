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
