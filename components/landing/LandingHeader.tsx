import { LoginLink } from '@/components/landing/LoginLink'

const TICKER_ITEMS: { text: string; highlight?: boolean }[] = [
  { text: 'WK14 · TEAM A 6-4 TEAM B' },
  { text: 'S. OKAFOR CROWNED Q1 CHAMPION', highlight: true },
  { text: 'WK13 · TEAM B 5-3 TEAM A' },
  { text: 'E. KNIGHT · 3 WINS ON THE SPIN', highlight: true },
  { text: 'WK12 · DRAWN 4-4' },
  { text: 'W. LOVELAND · 42ND CAP' },
]

const NAV_LINKS = [
  { href: '#features', label: 'FEATURES' },
  { href: '#how', label: 'HOW IT WORKS' },
  { href: '#faq', label: 'FAQ' },
]

export function LandingHeader() {
  return (
    <header className="sticky top-0 z-50 bg-[rgba(6,11,20,.94)] backdrop-blur-[10px] border-b border-[#101d31]">
      <div className="h-9 bg-[#0b1728] border-b border-[#17263c] flex items-center overflow-hidden">
        <span className="inline-flex items-center gap-[7px] flex-none px-[18px] h-full border-r border-[#17263c] font-plex text-[10px] font-bold tracking-[.18em] text-[#bef264]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#bef264] animate-cf-pulse" />
          LATEST
        </span>
        <div className="flex-1 overflow-hidden">
          <div className="flex w-max animate-cf-tick font-plex text-[11px] tracking-[.1em] text-[#8ba4c4]">
            {[0, 1].map((copy) => (
              <span key={copy} aria-hidden={copy === 1} className="flex">
                {TICKER_ITEMS.map((item) => (
                  <span key={item.text} className={item.highlight ? 'px-[26px] text-[#38bdf8]' : 'px-[26px]'}>
                    {item.text}
                  </span>
                ))}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="max-w-[1200px] mx-auto h-[74px] px-5 sm:px-11 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Craft Football" className="w-[34px] h-[34px] block" />
          <span className="text-lg font-bold tracking-[-.02em]">Craft Football</span>
        </div>
        <nav className="flex items-center gap-4 md:gap-8">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="hidden md:block font-plex text-[11px] font-semibold tracking-[.16em] text-[#8ba4c4] hover:text-[#eaf2ff]"
            >
              {link.label}
            </a>
          ))}
          <span className="flex items-center gap-2.5">
            <a
              href="#waitlist"
              className="inline-flex items-center h-10 px-4 sm:px-5 bg-[#38bdf8] hover:bg-[#7dd3fc] text-[#05101d] rounded text-[13px] font-bold transition-colors"
            >
              Register interest
            </a>
            <LoginLink className="inline-flex items-center h-10 px-4 sm:px-[18px] border border-[#223a5c] hover:border-[#38bdf8] rounded text-[#cfe0f4] hover:text-white text-[13px] font-bold transition-colors cursor-pointer">
              Log in
            </LoginLink>
          </span>
        </nav>
      </div>
    </header>
  )
}
