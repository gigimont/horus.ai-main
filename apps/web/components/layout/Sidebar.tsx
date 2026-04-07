'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Search, Kanban, Settings, Network } from 'lucide-react'

const nav = [
  { href: '/dashboard',   label: 'Dashboard',  icon: LayoutDashboard },
  { href: '/discovery',   label: 'Discovery',  icon: Search },
  { href: '/clusters',    label: 'Clusters',   icon: Network },
  { href: '/pipeline',    label: 'Pipeline',   icon: Kanban },
  { href: '/settings',    label: 'Settings',   icon: Settings },
]

export default function Sidebar() {
  const path = usePathname()
  const [tenantName, setTenantName] = useState('My Fund')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return
      const { data: userData } = await supabase
        .from('users')
        .select('tenants(name)')
        .eq('id', data.user.id)
        .single()
      if (userData?.tenants) {
        const t = userData.tenants as unknown as { name: string }
        setTenantName(t.name)
      }
    })
  }, [])

  return (
    <aside className="flex flex-col w-[220px] border-r bg-card shrink-0">
      <div className="flex items-center gap-2 px-4 h-14 border-b">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">S</div>
        <span className="font-semibold text-sm">SearchFund AI</span>
      </div>
      <nav className="flex-1 p-3 space-y-1">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              path === href || path.startsWith(href + '/')
                ? 'bg-primary/10 text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t">
        <p className="text-xs font-medium px-3 truncate">{tenantName}</p>
        <p className="text-xs text-muted-foreground px-3">Trial plan</p>
      </div>
    </aside>
  )
}
