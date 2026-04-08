import { signup } from './actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Link from 'next/link'
import LogoMark from '@/components/shared/LogoMark'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex">
      {/* Dark brand panel */}
      <div className="hidden lg:flex flex-col justify-between w-[42%] bg-[#0F172A] p-12 shrink-0">
        <div className="flex items-center gap-2.5">
          <LogoMark size={32} context="dark" />
          <span className="text-sm font-bold tracking-widest uppercase text-white">HORUS AI</span>
        </div>
        <div className="space-y-4">
          <p className="text-2xl font-semibold text-white leading-snug">
            Financial intelligence<br />for Search Fund operators.
          </p>
          <p className="text-slate-400 text-sm leading-relaxed max-w-xs">
            Identify, score, and track SME acquisition targets with AI-powered analysis. Built for the institutional M&A operator.
          </p>
        </div>
        <p className="text-slate-600 text-xs">© 2025 Horus AI</p>
      </div>

      {/* Light form panel */}
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex items-center gap-2.5 mb-6">
            <LogoMark size={28} context="light" />
            <span className="text-sm font-bold tracking-widest uppercase">HORUS AI</span>
          </div>
          <div>
            <h1 className="text-xl font-semibold">Create account</h1>
            <p className="text-sm text-muted-foreground mt-1">Start your Horus AI trial</p>
          </div>
          <form className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium">Full name</Label>
              <Input id="name" name="name" type="text" placeholder="Alex Morgan" required className="bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@fund.com" required className="bg-white" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium">Password</Label>
              <Input id="password" name="password" type="password" minLength={8} required className="bg-white" />
            </div>
            <Button type="submit" formAction={signup} className="w-full bg-[#0F172A] hover:bg-[#1E293B] text-white cursor-pointer">
              Create account
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
