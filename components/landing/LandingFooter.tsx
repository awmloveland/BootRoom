import { LoginLink } from '@/components/landing/LoginLink'

const PRODUCT_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how', label: 'How it works' },
  { href: '#faq', label: 'FAQ' },
]

const footerLinkClass = 'font-inter-body text-[13px] text-[#8ba4c4] hover:text-[#eaf2ff] text-left'

export function LandingFooter() {
  return (
    <footer className="max-w-[1200px] mx-auto mt-[72px] px-5 sm:px-11 pt-10 pb-[26px] border-t border-[#101d31]">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-10">
        <div>
          <div className="flex items-center gap-[11px]">
            <img src="/logo.png" alt="Craft Football" className="w-7 h-7 block" />
            <span className="text-base font-bold tracking-[-.02em]">Craft Football</span>
          </div>
          <p className="mt-3 font-plex text-[10px] tracking-[.14em] text-[#4f688a]">
            PRIVATE INVITE-ONLY BETA · BUILT FOR 5, 6 &amp; 7-A-SIDE
          </p>
        </div>
        <div className="flex flex-wrap gap-y-5 gap-x-[clamp(28px,5vw,56px)]">
          <div className="flex flex-col gap-[9px]">
            <p className="mb-[3px] font-plex text-[9px] font-semibold tracking-[.18em] text-[#4f688a]">PRODUCT</p>
            {PRODUCT_LINKS.map((link) => (
              <a key={link.href} href={link.href} className={footerLinkClass}>
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex flex-col gap-[9px]">
            <p className="mb-[3px] font-plex text-[9px] font-semibold tracking-[.18em] text-[#4f688a]">ACCOUNT</p>
            <LoginLink className={footerLinkClass}>Log in</LoginLink>
            <a href="#waitlist" className={footerLinkClass}>Register interest</a>
          </div>
        </div>
      </div>
      <p className="mt-7 font-plex text-[10px] tracking-[.14em] text-[#3f5674]">
        © 2026 CRAFT FOOTBALL · CRAFT-FOOTBALL.COM
      </p>
    </footer>
  )
}
