// apps/web/app/(dashboard)/rollup/[id]/hooks/useScenario.ts
'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { api, RollupScenario, RollupScenarioTarget, RollupFinancials } from '@/lib/api/client'
import { computeFinancials } from '../lib/computeFinancials'
import { arrayMove } from '@dnd-kit/sortable'

export function useScenario(id: string) {
  const [scenario, setScenario] = useState<RollupScenario | null>(null)
  const [targets, setTargets] = useState<RollupScenarioTarget[]>([])
  const [financials, setFinancials] = useState<RollupFinancials | null>(null)
  const [loading, setLoading] = useState(true)
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const refresh = useCallback(async () => {
    const s = await api.rollup.get(id)
    setScenario(s)
    const t = s.rollup_scenario_targets ?? []
    const sorted = [...t].sort((a, b) => a.sequence_order - b.sequence_order)
    setTargets(sorted)
    setFinancials(computeFinancials(sorted))
  }, [id])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const addTarget = useCallback(async (targetId: string) => {
    // API estimates EBITDA and returns updated scenario
    const s = await api.rollup.addTarget(id, targetId)
    const t = s.rollup_scenario_targets ?? []
    const sorted = [...t].sort((a, b) => a.sequence_order - b.sequence_order)
    setTargets(sorted)
    setFinancials(computeFinancials(sorted))
  }, [id])

  const removeTarget = useCallback(async (targetId: string) => {
    setTargets(prev => {
      const next = prev.filter(t => t.target_id !== targetId)
      setFinancials(computeFinancials(next))
      return next
    })
    await api.rollup.removeTarget(id, targetId)
  }, [id])

  const updateAssumption = useCallback((targetId: string, field: keyof RollupScenarioTarget, value: number | string) => {
    setTargets(prev => {
      const next = prev.map(t =>
        t.target_id === targetId
          ? { ...t, [field]: value, ...(field === 'ebitda_margin_pct' ? { ebitda_margin_source: 'manual' } : {}) }
          : t
      )
      setFinancials(computeFinancials(next))
      return next
    })
    // Debounce API call per target
    const key = `${targetId}-${field}`
    clearTimeout(debounceRefs.current[key])
    debounceRefs.current[key] = setTimeout(() => {
      const payload: Record<string, unknown> = { [field]: value }
      if (field === 'ebitda_margin_pct') payload.ebitda_margin_source = 'manual'
      api.rollup.updateTarget(id, targetId, payload as Partial<RollupScenarioTarget>)
    }, 500)
  }, [id])

  const reorder = useCallback(async (activeId: string, overId: string) => {
    setTargets(prev => {
      const oldIndex = prev.findIndex(t => t.target_id === activeId)
      const newIndex = prev.findIndex(t => t.target_id === overId)
      if (oldIndex === -1 || newIndex === -1) return prev
      const next = arrayMove(prev, oldIndex, newIndex).map((t, i) => ({ ...t, sequence_order: i }))
      setFinancials(computeFinancials(next))
      // Fire API in background
      api.rollup.reorder(id, next.map(t => ({ target_id: t.target_id, sequence_order: t.sequence_order })))
      return next
    })
  }, [id])

  const applySequenceSuggestion = useCallback(async () => {
    const res = await api.rollup.sequence(id)
    const suggestions = res.suggestions
    setTargets(prev => {
      const map = new Map(suggestions.map(s => [s.target_id, s.suggested_order]))
      const next = [...prev]
        .map(t => ({ ...t, sequence_order: map.get(t.target_id) ?? t.sequence_order }))
        .sort((a, b) => a.sequence_order - b.sequence_order)
      setFinancials(computeFinancials(next))
      api.rollup.reorder(id, next.map(t => ({ target_id: t.target_id, sequence_order: t.sequence_order })))
      return next
    })
    return suggestions
  }, [id])

  return {
    scenario,
    targets,
    financials,
    loading,
    addTarget,
    removeTarget,
    updateAssumption,
    reorder,
    applySequenceSuggestion,
    refresh,
  }
}
