// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-slate-100 font-semibold text-lg mb-2">Page not found</p>
      <p className="text-slate-400 text-sm mb-6">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-100 text-sm font-medium transition-colors"
      >
        Go home
      </Link>
    </div>
  )
}
