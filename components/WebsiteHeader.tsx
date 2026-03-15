'use client'

import { Button } from '@/components/ui/button'

export function WebsiteHeader() {
  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <img src="/logo.png" alt="Crafted Football" className="h-10 w-10" />
        <nav className="flex items-center gap-2">
          <Button size="xs" asChild>
            <a href="/sign-in">Log in</a>
          </Button>
          <Button size="xs" variant="secondary" asChild>
            <a href="/sign-in?mode=signup">Join</a>
          </Button>
        </nav>
      </div>
    </header>
  )
}
