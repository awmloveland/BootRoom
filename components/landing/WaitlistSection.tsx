import { WaitlistForm } from '@/components/landing/WaitlistForm'

const PROMISES = [
  'FREE WHILE WE BUILD · EARLY GROUPS KEEP EARLY PRICING',
  'PRIVATE BY DEFAULT · YOU CHOOSE WHAT GOES PUBLIC',
  'ONE PERSON SIGNS UP FOR THE WHOLE GROUP',
]

export function WaitlistSection() {
  return (
    <section id="waitlist" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="bg-[#38bdf8] rounded-2xl p-6 sm:p-11 grid lg:grid-cols-[1fr_.9fr] gap-8 lg:gap-12 items-center">
        <div>
          <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[rgba(5,16,29,.6)]">REGISTER YOUR INTEREST</p>
          <h2 className="mt-3.5 text-4xl sm:text-[52px] leading-[.98] font-bold tracking-[-.04em] text-[#05101d]">
            Be first in when<br />we open up.
          </h2>
          <p className="mt-4 max-w-[420px] font-inter-body text-[15px] leading-relaxed text-[rgba(5,16,29,.72)]">
            Private beta, a handful of groups. Tell us about yours and we will let you know the
            moment it is ready.
          </p>
          <div className="flex flex-col gap-2 mt-[22px]">
            {PROMISES.map((line) => (
              <p key={line} className="font-plex text-[11px] font-semibold tracking-[.1em] text-[rgba(5,16,29,.72)]">
                {line}
              </p>
            ))}
          </div>
        </div>
        <div className="bg-[#05101d] rounded-xl p-5 sm:p-[26px]">
          <WaitlistForm />
        </div>
      </div>
    </section>
  )
}
