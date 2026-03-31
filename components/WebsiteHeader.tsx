'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function WebsiteHeader() {
  return (
    <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-700 h-14 flex items-center">
      <div className="w-full max-w-2xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        <img src="/logo.png" alt="Crafted Football" className="h-10 w-10" />
        <nav className="flex items-center gap-2">
          <Button size="xs" asChild>
            <Link href="/sign-in">Log in</Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
