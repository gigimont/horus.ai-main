'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Upload, Loader2, CheckCircle } from 'lucide-react'
import { api } from '@/lib/api/client'
import { toast } from 'sonner'

interface Props { onImported: () => void }

export default function ImportButton({ onImported }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')
  const [count, setCount] = useState(0)

  const handleFile = async (file: File) => {
    setState('loading')
    try {
      const res = await api.targets.bulkImport(file)
      setCount(res.inserted)
      setState('done')
      toast.success(`${res.inserted} targets imported`)
      setTimeout(() => { setState('idle'); onImported() }, 2000)
    } catch (err) {
      setState('idle')
      toast.error(`Import failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    }
  }

  return (
    <>
      <input
        ref={ref} type="file" accept=".csv"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <Button
        variant="outline" size="sm"
        className="gap-2"
        onClick={() => ref.current?.click()}
        disabled={state === 'loading'}
      >
        {state === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
        {state === 'done' && <CheckCircle className="h-4 w-4 text-emerald-500" />}
        {state === 'idle' && <Upload className="h-4 w-4" />}
        {state === 'done' ? `${count} imported` : 'Import CSV'}
      </Button>
    </>
  )
}
