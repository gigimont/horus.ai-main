'use client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { Filters } from '@/lib/api/client'

interface Props {
  filters: Filters
  onChange: (f: Filters) => void
  onReset: () => void
}

const COUNTRIES = ['DE', 'IT', 'FR', 'ES', 'PL', 'NL', 'BE', 'AT', 'CH', 'PT']
const INDUSTRIES = [
  { code: 'C16', label: 'Woodwork & joinery' },
  { code: 'C24', label: 'Steel fabrication' },
  { code: 'C28', label: 'Industrial equipment' },
  { code: 'F43', label: 'HVAC & construction' },
  { code: 'H49', label: 'Logistics & transport' },
]

export default function FilterPanel({ filters, onChange, onReset }: Props) {
  const set = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    onChange({ ...filters, [key]: e.target.value })

  const hasActive = Object.values(filters).some(v => v !== '')

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1">
        <Label className="text-xs">Search</Label>
        <Input
          className="h-8 w-44 text-sm"
          placeholder="Company name..."
          value={filters.search}
          onChange={set('search')}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Country</Label>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={filters.country}
          onChange={set('country')}
        >
          <option value="">All countries</option>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Industry</Label>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
          value={filters.industry_code}
          onChange={set('industry_code')}
        >
          <option value="">All industries</option>
          {INDUSTRIES.map(i => <option key={i.code} value={i.code}>{i.label}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Score min</Label>
        <Input
          className="h-8 w-20 text-sm"
          type="number" min="0" max="10" step="0.5"
          placeholder="0"
          value={filters.score_min}
          onChange={set('score_min')}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Score max</Label>
        <Input
          className="h-8 w-20 text-sm"
          type="number" min="0" max="10" step="0.5"
          placeholder="10"
          value={filters.score_max}
          onChange={set('score_max')}
        />
      </div>
      {hasActive && (
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground" onClick={onReset}>
          <X className="h-3 w-3" /> Reset
        </Button>
      )}
    </div>
  )
}
