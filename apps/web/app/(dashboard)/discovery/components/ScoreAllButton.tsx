'use client'
import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'

interface Props { onComplete: () => void }

export default function ScoreAllButton({ onComplete }: Props) {
  const [state, setState] = useState<'idle' | 'running'>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const pollRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const start = async () => {
    try {
      const res = await api.scoring.batch()
      if (res.total === 0) { onComplete(); return }
      setState('running')
      setProgress({ done: 0, total: res.total })
      pollRef.current = setInterval(async () => {
        const status = await api.scoring.status()
        setProgress({ done: status.done, total: status.total })
        if (!status.running) {
          clearInterval(pollRef.current)
          setState('idle')
          onComplete()
          toast.success('All targets scored')
        }
      }, 1500)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : ''
      if (msg?.includes('already running')) return
      toast.error('Could not start scoring')
    }
  }

  useEffect(() => () => clearInterval(pollRef.current), [])

  return (
    <Button size="sm" className="gap-2" onClick={start} disabled={state === 'running'}>
      {state === 'running'
        ? <><Loader2 className="h-4 w-4 animate-spin" /> {progress.done}/{progress.total}</>
        : <><Sparkles className="h-4 w-4" /> Score all</>
      }
    </Button>
  )
}
