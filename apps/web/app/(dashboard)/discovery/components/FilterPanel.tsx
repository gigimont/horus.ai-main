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
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-md border bg-white">
      <Input
        className="h-7 w-40 text-xs bg-white"
        placeholder="Search company…"
        value={filters.search}
        onChange={set('search')}
      />
      <select
        className="h-7 rounded-md border border-input bg-white px-2 text-xs text-foreground cursor-pointer"
        value={filters.country}
        onChange={set('country')}
      >
        <option value="">All countries</option>
        {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        className="h-7 rounded-md border border-input bg-white px-2 text-xs text-foreground cursor-pointer"
        value={filters.industry_code}
        onChange={set('industry_code')}
      >
        <option value="">All industries</option>
        {INDUSTRIES.map(i => <option key={i.code} value={i.code}>{i.label}</option>)}
      </select>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-muted-foreground shrink-0">Score</Label>
        <Input
          className="h-7 w-14 text-xs bg-white"
          type="number" min="0" max="10" step="0.5"
          placeholder="min"
          value={filters.score_min}
          onChange={set('score_min')}
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          className="h-7 w-14 text-xs bg-white"
          type="number" min="0" max="10" step="0.5"
          placeholder="max"
          value={filters.score_max}
          onChange={set('score_max')}
        />
      </div>
      {hasActive && (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground cursor-pointer" onClick={onReset}>
          <X className="h-3 w-3" /> Reset
        </Button>
      )}
    </div>
  )
}
