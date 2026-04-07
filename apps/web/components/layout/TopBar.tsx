import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export default async function TopBar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <header className="flex items-center justify-end px-6 h-12 border-b bg-white shrink-0">
      <div className="flex items-center gap-3">
        {user?.email && (
          <span className="text-xs text-muted-foreground hidden sm:block">{user.email}</span>
        )}
        <form>
          <Button type="submit" formAction={logout} variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7 text-xs cursor-pointer">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </form>
      </div>
    </header>
  )
}
