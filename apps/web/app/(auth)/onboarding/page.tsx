'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'

export default function OnboardingPage() {
  const [fundName, setFundName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    if (!fundName.trim()) return
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.updateUser({ data: { fund_name: fundName.trim() } })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-lg">S</div>
          <CardTitle className="text-xl">Name your fund</CardTitle>
          <CardDescription>This will be your workspace name on SearchFund AI</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fund">Fund name</Label>
            <Input
              id="fund"
              placeholder="Acme Capital Partners"
              value={fundName}
              onChange={e => setFundName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={loading || !fundName.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
