'use client'
import { RollupFinancials, RollupScenarioTarget } from '@/lib/api/client'
import FinancialSummary from './FinancialSummary'
import AcquisitionTimeline from './AcquisitionTimeline'
import SynergyMap from './SynergyMap'
import IcMemo from './IcMemo'

interface Props {
  scenarioId: string
  scenarioName: string
  targets: RollupScenarioTarget[]
  financials: RollupFinancials | null
}

export default function RightPanel({ scenarioId, scenarioName, targets, financials }: Props) {
  if (targets.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Add targets from the left panel to see financial projections
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6">
      {financials && <FinancialSummary financials={financials} />}
      <div className="border-t pt-6">
        <AcquisitionTimeline targets={targets} />
      </div>
      {financials && (
        <div className="border-t pt-6">
          <SynergyMap financials={financials} />
        </div>
      )}
      <div className="border-t pt-6">
        <IcMemo scenarioId={scenarioId} scenarioName={scenarioName} />
      </div>
    </div>
  )
}
