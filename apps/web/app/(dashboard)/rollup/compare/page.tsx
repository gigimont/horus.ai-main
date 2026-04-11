'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api, RollupScenario, RollupFinancials } from '@/lib/api/client'
import FinancialSummary from '../[id]/components/FinancialSummary'
import SynergyMap from '../[id]/components/SynergyMap'
import AcquisitionTimeline from '../[id]/components/AcquisitionTimeline'
import { ArrowLeft } from 'lucide-react'

function CompareColumn({ scenarioId }: { scenarioId: string }) {
  const [scenario, setScenario] = useState<RollupScenario | null>(null)
  const [financials, setFinancials] = useState<RollupFinancials | null>(null)

  useEffect(() => {
    Promise.all([api.rollup.get(scenarioId), api.rollup.financials(scenarioId)]).then(([s, f]) => {
      setScenario(s)
      setFinancials(f)
    })
  }, [scenarioId])

  if (!scenario || !financials) {
    return <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  const targets = scenario.rollup_scenario_targets ?? []

  return (
    <div className="flex-1 min-w-0 border-r last:border-r-0 overflow-y-auto">
      <div className="px-6 py-4 border-b bg-muted/20">
        <h2 className="text-sm font-semibold">{scenario.name}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{targets.length} targets</p>
      </div>
      <div className="p-6 space-y-8">
        <FinancialSummary financials={financials} />
        <div className="border-t pt-6">
          <AcquisitionTimeline targets={targets} />
        </div>
        <div className="border-t pt-6">
          <SynergyMap financials={financials} />
        </div>
      </div>
    </div>
  )
}

function CompareContent() {
  const params = useSearchParams()
  const a = params.get('a')
  const b = params.get('b')

  if (!a || !b) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        Select two scenarios from the{' '}
        <Link href="/rollup" className="mx-1 text-primary hover:underline">scenario list</Link>
        to compare.
      </div>
    )
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <CompareColumn scenarioId={a} />
      <CompareColumn scenarioId={b} />
    </div>
  )
}

export default function ComparePage() {
  return (
    <div className="flex flex-col h-[calc(100vh-56px)] -m-6">
      <div className="flex items-center gap-3 px-6 h-12 border-b shrink-0 bg-background">
        <Link href="/rollup" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold">Scenario comparison</h1>
      </div>
      <Suspense fallback={<div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">Loading…</div>}>
        <CompareContent />
      </Suspense>
    </div>
  )
}
