import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
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
  clusters: {
    list: () => apiFetch<{ data: Cluster[] }>('/clusters/'),
    refresh: () => apiFetch<{ message: string }>('/clusters/refresh', { method: 'POST' }),
    status: () => apiFetch<{ running: boolean; done: boolean; count: number }>('/clusters/status'),
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
