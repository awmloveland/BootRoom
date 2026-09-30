// app/not-found.tsx
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-[#f4f9ff] font-semibold text-lg mb-2">Page not found</p>
      <p className="text-[#8ba4c4] text-sm mb-6">
        This page doesn&apos;t exist or you don&apos;t have access to it.
      </p>
      <Link
        href="/"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-[#1b2c46] hover:bg-[#223a5c] text-[#f4f9ff] text-sm font-medium transition-colors"
      >
        Go home
      </Link>
    </div>
  )
}
