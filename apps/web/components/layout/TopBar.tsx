import { logout } from '@/app/(auth)/login/actions'
import { Button } from '@/components/ui/button'
import { LogOut } from 'lucide-react'

export default function TopBar() {
  return (
    <header className="flex items-center justify-between px-6 h-14 border-b bg-card shrink-0">
      <div />
      <form>
        <Button type="submit" formAction={logout} variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </form>
    </header>
  )
}
