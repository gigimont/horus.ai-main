'use client'
import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { streamChat } from '@/lib/api/client'
import { Send, Loader2, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Message { role: 'user' | 'assistant'; content: string }
interface Props { context: Record<string, unknown> }

const SUGGESTIONS = [
  'What are the main acquisition risks?',
  'What would a fair valuation multiple be?',
  'What due diligence should I prioritise?',
  'How does this compare to sector benchmarks?',
]

export default function CopilotChat({ context }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    if (!text.trim() || streaming) return
    const userMsg: Message = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages([...newMessages, { role: 'assistant', content: '' }])
    setInput('')
    setStreaming(true)

    await streamChat(
      newMessages.map(m => ({ role: m.role, content: m.content })),
      context,
      (chunk) => setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          content: updated[updated.length - 1].content + chunk,
        }
        return updated
      }),
      () => setStreaming(false)
    )
  }

  return (
    <div className="flex flex-col h-[480px]">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">AI Copilot</span>
      </div>
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Ask anything about this target:</p>
            {SUGGESTIONS.map(s => (
              <button
                key={s}
                onClick={() => send(s)}
                className="block w-full text-left text-xs px-3 py-2 rounded-md border border-border hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-sm',
              m.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            )}>
              {m.content || (streaming && i === messages.length - 1
                ? <Loader2 className="h-3 w-3 animate-spin" />
                : null
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <Input
          className="h-8 text-sm"
          placeholder="Ask about this target..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send(input)}
          disabled={streaming}
        />
        <Button size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => send(input)} disabled={streaming}>
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
