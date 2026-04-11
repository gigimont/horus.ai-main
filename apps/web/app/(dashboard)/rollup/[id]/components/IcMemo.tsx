// apps/web/app/(dashboard)/rollup/[id]/components/IcMemo.tsx
'use client'
import { useState } from 'react'
import { api } from '@/lib/api/client'
import { FileText, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

interface Props { scenarioId: string; scenarioName: string }

export default function IcMemo({ scenarioId, scenarioName }: Props) {
  const [memo, setMemo] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await api.rollup.memo(scenarioId)
      setMemo(res.memo)
    } catch {
      toast.error('Memo generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const handlePdfDownload = async () => {
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(api.rollup.memoPdfUrl(scenarioId), {
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
      })
      if (!res.ok) { toast.error('PDF generation failed'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rollup-memo-${scenarioName.toLowerCase().replace(/\s+/g, '-').slice(0, 40)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('PDF download failed')
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          IC Memo
        </h3>
        <div className="flex items-center gap-2">
          {memo && (
            <button
              onClick={handlePdfDownload}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs border border-input rounded-sm hover:bg-accent transition-colors"
            >
              <Download className="h-3 w-3" />
              PDF
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="inline-flex items-center gap-1.5 h-7 px-2.5 text-xs bg-foreground text-background rounded-sm hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {generating
              ? <><Loader2 className="h-3 w-3 animate-spin" /> Generating…</>
              : <><FileText className="h-3 w-3" /> {memo ? 'Regenerate' : 'Generate memo'}</>}
          </button>
        </div>
      </div>

      {memo ? (
        <div className="border rounded-sm p-4 bg-card text-xs leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto font-mono">
          {memo}
        </div>
      ) : (
        <div className="border rounded-sm p-8 text-center text-xs text-muted-foreground">
          <FileText className="h-6 w-6 mx-auto mb-2 opacity-30" />
          <p>Generate an investment committee memo for this roll-up strategy.</p>
          <p className="mt-1 opacity-70">Takes ~30–60s · Uses Claude AI</p>
        </div>
      )}
    </div>
  )
}
