'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, ExternalLink, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const PLANS = [
  {
    id: 'trial',
    name: 'Trial',
    price: 'Free',
    features: ['Up to 25 targets', 'AI scoring (limited)', 'Discovery list', 'Pipeline CRM'],
    cta: null,
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '€149/mo',
    features: ['Unlimited targets', 'Full AI scoring', 'Map view', 'Cluster analysis', 'CSV export'],
    cta: 'Upgrade to Pro',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '€499/mo',
    features: ['Everything in Pro', 'API access', 'Custom clustering', 'Priority support', 'SSO'],
    cta: 'Contact sales',
  },
]

export default function SettingsPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [upgrading, setUpgrading] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user)
      setLoading(false)
    })
  }, [])

  const handleUpgrade = async (planId: string) => {
    setUpgrading(planId)
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, origin: window.location.origin }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.detail ?? 'Stripe not configured yet — add price IDs to config.py')
    } catch {
      toast.error('Could not start checkout')
    } finally {
      setUpgrading(null)
    }
  }

  const handlePortal = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/billing/portal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: window.location.origin }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else toast.error(data.detail ?? 'Billing portal unavailable')
    } catch {
      toast.error('No billing portal available — not yet subscribed')
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="h-8 w-32 bg-muted rounded animate-pulse" />
    </div>
  )

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-muted-foreground text-sm mt-1">Manage your account and subscription</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email ?? '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Current plan</span>
            <Badge variant="secondary" className="capitalize">Trial</Badge>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-medium mb-3">Subscription plans</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLANS.map(plan => {
            const isCurrent = plan.id === 'trial'
            return (
              <Card key={plan.id} className={isCurrent ? 'ring-2 ring-primary' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{plan.name}</CardTitle>
                    {isCurrent && <Badge className="text-xs">Current</Badge>}
                  </div>
                  <CardDescription className="text-lg font-semibold text-foreground">
                    {plan.price}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ul className="space-y-1.5">
                    {plan.features.map(f => (
                      <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  {plan.cta && (
                    <Button
                      size="sm" className="w-full mt-2"
                      variant={plan.id === 'pro' ? 'default' : 'outline'}
                      onClick={() => plan.id === 'enterprise'
                        ? toast.info('Contact hello@searchfund.ai for enterprise pricing')
                        : handleUpgrade(plan.id)
                      }
                      disabled={upgrading === plan.id}
                    >
                      {upgrading === plan.id
                        ? <Loader2 className="h-4 w-4 animate-spin" />
                        : plan.cta}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Billing</CardTitle>
          <CardDescription>Manage your subscription, invoices, and payment method</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" className="gap-2" onClick={handlePortal}>
            <ExternalLink className="h-4 w-4" />
            Open billing portal
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
