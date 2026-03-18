// components/LeaguePrivateState.tsx
import Link from 'next/link'

interface Props {
  leagueName: string
}

export function LeaguePrivateState({ leagueName }: Props) {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-slate-100 font-semibold text-lg mb-2">{leagueName}</p>
      <p className="text-slate-400 text-sm mb-6">
        This league hasn&apos;t made any content public yet.
      </p>
      <Link
        href="/sign-in"
        className="inline-flex items-center px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors"
      >
        Sign in
      </Link>
    </div>
  )
}
