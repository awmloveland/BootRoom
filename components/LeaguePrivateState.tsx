// components/LeaguePrivateState.tsx
import Link from 'next/link'

interface Props {
  leagueName: string
}

export function LeaguePrivateState({ leagueName }: Props) {
  return (
    <div className="max-w-md mx-auto px-4 sm:px-6 py-16 text-center">
      <p className="text-[#f4f9ff] font-semibold text-lg mb-2">{leagueName}</p>
      <p className="text-[#8ba4c4] text-sm mb-6">
        This league hasn&apos;t made any content public yet.
      </p>
      <Link
        href="/sign-in"
        className="inline-flex items-center px-4 py-2 rounded bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] text-sm font-bold transition-colors"
      >
        Sign in
      </Link>
    </div>
  )
}
