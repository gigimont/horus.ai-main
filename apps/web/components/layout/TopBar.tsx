import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export default async function TopBar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="flex items-center justify-between px-6 h-14 border-b bg-card shrink-0">
      <div />
      <div className="flex items-center gap-3">
        {user?.email && (
          <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
        )}
        <form>
          <Button type="submit" formAction={logout} variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <LogOut className="h-4 w-4" />
            Sign out
          </Button>
        </form>
      </div>
    </header>
  )
}
