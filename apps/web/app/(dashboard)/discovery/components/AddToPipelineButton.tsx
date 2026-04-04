'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Plus, Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'

interface Props { targetId: string }

export default function AddToPipelineButton({ targetId }: Props) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'exists'>('idle')

  const handle = async () => {
    setState('loading')
    try {
      await api.targets.addToPipeline(targetId)
      setState('done')
      toast.success('Added to watchlist')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('409') || msg.includes('already')) {
        setState('exists')
      } else {
        setState('idle')
        toast.error('Failed to add to pipeline')
      }
    }
  }

  if (state === 'done' || state === 'exists') {
    return (
      <Button size="sm" variant="outline" disabled className="gap-2">
        <Check className="h-4 w-4 text-emerald-500" />
        {state === 'done' ? 'Added to pipeline' : 'Already in pipeline'}
      </Button>
    )
  }

  return (
    <Button size="sm" variant="outline" onClick={handle} disabled={state === 'loading'} className="gap-2">
      {state === 'loading'
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <Plus className="h-4 w-4" />}
      Add to pipeline
    </Button>
  )
}
