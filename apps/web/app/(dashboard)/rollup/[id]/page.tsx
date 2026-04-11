'use client'
import { use, useState } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api/client'
import { useScenario } from './hooks/useScenario'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import { ArrowLeft, Pencil, Check } from 'lucide-react'
import { toast } from 'sonner'

export default function RollupEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { scenario, targets, financials, loading, addTarget, removeTarget, updateAssumption, reorder, applySequenceSuggestion } = useScenario(id)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState('')

  const startEditName = () => {
    setNameValue(scenario?.name ?? '')
    setEditingName(true)
  }

  const saveName = async () => {
    if (!nameValue.trim()) return
    await api.rollup.update(id, { name: nameValue.trim() })
    setEditingName(false)
    toast.success('Scenario renamed')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] text-sm text-muted-foreground">
        Loading scenario…
      </div>
    )
  }

  if (!scenario) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)] text-sm text-muted-foreground">
        Scenario not found. <Link href="/rollup" className="ml-1 text-primary hover:underline">Back to scenarios</Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-12 border-b shrink-0 bg-background">
        <Link href="/rollup" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              className="h-7 px-2 text-sm font-medium border rounded-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false) }}
              autoFocus
            />
            <button onClick={saveName} className="text-emerald-600 hover:text-emerald-700">
              <Check className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <h1 className="text-sm font-semibold">{scenario.name}</h1>
            <button onClick={startEditName} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{targets.length} targets</span>
      </div>

      {/* Split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: fixed 380px */}
        <div className="w-[380px] shrink-0 border-r overflow-hidden flex flex-col">
          <LeftPanel
            targets={targets}
            scenarioId={id}
            onAddTarget={addTarget}
            onRemoveTarget={removeTarget}
            onUpdateAssumption={updateAssumption}
            onReorder={reorder}
            onApplySequence={applySequenceSuggestion}
          />
        </div>

        {/* Right: scrollable */}
        <div className="flex-1 overflow-y-auto">
          <RightPanel
            scenarioId={id}
            scenarioName={scenario.name}
            targets={targets}
            financials={financials}
          />
        </div>
      </div>
    </div>
  )
}
