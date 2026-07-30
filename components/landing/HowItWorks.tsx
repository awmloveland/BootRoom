import { cn } from '@/lib/utils'

const STEPS = [
  {
    num: '01',
    strokeClass: '[-webkit-text-stroke:1.5px_#2f4a70]',
    title: 'Record your week',
    body: 'Who played, who won and by how much, plus a note on what it was like out there.',
  },
  {
    num: '02',
    strokeClass: '[-webkit-text-stroke:1.5px_#2f4a70]',
    title: 'The stats build themselves',
    body: 'Win rates, form, caps and honours update with every result. No spreadsheet, no admin.',
  },
  {
    num: '03',
    strokeClass: '[-webkit-text-stroke:1.5px_#38bdf8]',
    title: 'Next week picks itself',
    body: 'Lineup Lab uses those records to split whoever is playing into two fair sides.',
  },
]

export function HowItWorks() {
  return (
    <section id="how" className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px]">
      <div className="max-w-[660px]">
        <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">HOW IT WORKS</p>
        <h2 className="mt-3.5 text-4xl sm:text-[50px] leading-none font-bold tracking-[-.04em] text-[#f4f9ff]">
          One minute a week.<br />The rest is automatic.
        </h2>
      </div>
      <div className="grid md:grid-cols-3 gap-8 mt-11">
        {STEPS.map((step) => (
          <div key={step.num} className="border-t border-[#17263c] pt-[22px]">
            <p className={cn('font-plex text-[64px] font-bold leading-[.9] tracking-[-.05em] text-transparent', step.strokeClass)}>
              {step.num}
            </p>
            <p className="mt-[18px] text-[22px] font-bold tracking-[-.02em] text-[#f4f9ff]">{step.title}</p>
            <p className="mt-[9px] font-inter-body text-sm leading-relaxed text-[#8ba4c4]">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
