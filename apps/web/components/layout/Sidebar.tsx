'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Search, Kanban, Settings, Network } from 'lucide-react'
import LogoMark from '@/components/shared/LogoMark'

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
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('tenants(name)')
          .eq('id', data.user.id)
          .single()
        if (userData?.tenants) {
          const t = userData.tenants as unknown as { name: string }
          setTenantName(t.name)
        }
      } catch {
        // tenant name is cosmetic — silently fall back to default
      }
    })
  }, [])

  return (
    <aside className="flex flex-col w-[220px] shrink-0 bg-[#0F172A] border-r border-[#1E293B]">
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-[#1E293B]">
        <LogoMark size={24} context="dark" />
        <span className="text-sm font-bold tracking-widest uppercase text-white">HORUS</span>
      </div>
      <nav className="flex-1 p-2.5 space-y-0.5">
        {nav.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors duration-150 cursor-pointer',
              path === href || path.startsWith(href + '/')
                ? 'bg-[#1E293B] text-white font-medium'
                : 'text-slate-400 hover:bg-[#1E293B]/60 hover:text-slate-200'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-[#1E293B]">
        <p className="text-xs font-medium px-3 text-slate-300 truncate">{tenantName}</p>
        <p className="text-xs text-slate-500 px-3 mt-0.5">Trial plan</p>
      </div>
    </aside>
  )
}
