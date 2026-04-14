// apps/web/app/(dashboard)/discovery/[id]/components/ScenarioPanel.tsx
'use client'
import { useState } from 'react'
import { api, ScenarioResult } from '@/lib/api/client'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Props {
  targetId: string
  currentScores: {
    overall_score: number | null
    transition_score: number | null
    value_score: number | null
    market_score: number | null
    financial_score: number | null
    scored_at: string | null
  }
  rollupScenarioId?: string
}

type State = 'idle' | 'running' | 'done' | 'error'

const SCENARIO_TYPES = [
  { value: 'macro_shock',         label: 'Macro shock' },
  { value: 'industry_shift',      label: 'Industry shift' },
  { value: 'succession_trigger',  label: 'Succession trigger' },
] as const

function DeltaCard({ label, delta }: { label: string; delta: number }) {
  return (
    <div className={cn(
      'p-2 border rounded-sm text-center',
      delta > 0 ? 'border-green-200 bg-green-50' :
      delta < 0 ? 'border-red-200 bg-red-50' :
                  'border-slate-200 bg-slate-50'
    )}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn(
        'text-sm font-semibold tabular-nums',
        delta > 0 ? 'text-green-700' :
        delta < 0 ? 'text-red-700' :
                    'text-slate-500'
      )}>
        {delta > 0 ? '+' : ''}{delta}
      </div>
    </div>
  )
}

export default function ScenarioPanel({ targetId, rollupScenarioId }: Props) {
  const [state, setState]               = useState<State>('idle')
  const [scenarioType, setScenarioType] = useState('macro_shock')
  const [severity, setSeverity]         = useState(5)
  const [description, setDescription]   = useState('')
  const [result, setResult]             = useState<ScenarioResult | null>(null)
  const [error, setError]               = useState('')
  const [history, setHistory]           = useState<ScenarioResult[]>([])
  const [historyOpen, setHistoryOpen]   = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('running')
    setError('')
    try {
      const res = await api.scenarios.run(
        targetId,
        { scenario_type: scenarioType, severity, description },
        rollupScenarioId
      )
      setResult(res)
      setState('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setState('error')
    }
  }

  async function toggleHistory() {
    if (historyLoaded) { setHistoryOpen(v => !v); return }
    try {
      const res = await api.scenarios.forTarget(targetId)
      setHistory(res.data)
      setHistoryLoaded(true)
      setHistoryOpen(true)
    } catch {}
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="space-y-2">
        <select
          className="w-full text-xs border rounded-sm px-2 py-1.5 bg-background"
          value={scenarioType}
          onChange={e => setScenarioType(e.target.value)}
          disabled={state === 'running'}
        >
          {SCENARIO_TYPES.map(t => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>

        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Severity</span><span className="tabular-nums">{severity}/10</span>
          </div>
          <input
            type="range" min={1} max={10} value={severity}
            onChange={e => setSeverity(Number(e.target.value))}
            className="w-full"
            disabled={state === 'running'}
          />
        </div>

        <textarea
          className="w-full text-xs border rounded-sm px-2 py-1.5 bg-background resize-none"
          rows={2}
          placeholder="Describe the scenario…"
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={state === 'running'}
          required
        />

        <Button
          type="submit"
          size="sm"
          className="w-full text-xs"
          disabled={state === 'running' || !description.trim()}
        >
          {state === 'running' ? 'Analyzing…' : 'Run scenario'}
        </Button>
      </form>

      {state === 'error' && (
        <div className="text-xs text-destructive">
          {error}
          <button className="ml-2 underline" onClick={() => setState('idle')}>Retry</button>
        </div>
      )}

      {state === 'done' && result && (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1.5">
            <DeltaCard label="Transition" delta={result.score_deltas.transition_delta} />
            <DeltaCard label="Value"      delta={result.score_deltas.value_delta} />
            <DeltaCard label="Market"     delta={result.score_deltas.market_delta} />
            <DeltaCard label="Financial"  delta={result.score_deltas.financial_delta} />
          </div>
          <div className="space-y-1">
            {result.implications.map((imp, i) => (
              <p key={i} className="text-xs text-muted-foreground">• {imp}</p>
            ))}
          </div>
          <p className="text-xs italic text-muted-foreground border-t pt-2">
            {result.acquisition_window_effect}
          </p>
        </div>
      )}

      <button
        type="button"
        className="text-xs text-muted-foreground hover:text-foreground underline"
        onClick={toggleHistory}
      >
        {historyOpen ? 'Hide history' : 'Show history'}
      </button>

      {historyOpen && (
        <div className="space-y-1">
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground">No previous runs.</p>
          ) : (
            <div className="divide-y">
              {history.map(h => (
                <div key={h.id} className="py-1 text-xs text-muted-foreground">
                  <span>{new Date(h.run_at).toLocaleDateString()}</span>
                  {' · '}{h.scenario_type.replace('_', ' ')}
                  {' · severity '}{h.severity}
                  {' · overall '}
                  <span className={h.score_deltas.overall_delta >= 0 ? 'text-green-600' : 'text-red-600'}>
                    {h.score_deltas.overall_delta >= 0 ? '+' : ''}{h.score_deltas.overall_delta}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
