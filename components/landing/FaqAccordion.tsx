'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

const FAQS = [
  {
    q: 'Will it cost anything?',
    a: 'The beta is free, and groups that register interest early will keep early pricing when we launch.',
  },
  {
    q: 'When can my group join?',
    a: 'We are in private beta while we shape the product. Register your interest and we will email you the moment we open up; one person becomes admin and invites the rest with a link.',
  },
  {
    q: 'Does the whole group need accounts?',
    a: 'No, only people who want to log in. Your admin can record everything, and a public league link works without an account.',
  },
  {
    q: 'What is public and what is private?',
    a: 'Private by default. Admins choose, feature by feature, what members and the public can see.',
  },
  {
    q: 'We rotate 5s, 6s and 7s. Is that fine?',
    a: 'Completely. The format is recorded per week, and the stats do not mind.',
  },
  {
    q: 'Is there a mobile app?',
    a: 'It is a web app designed for phones first. Add it to your home screen and it behaves like one.',
  },
]

export function FaqAccordion() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section
      id="faq"
      className="max-w-[1200px] mx-auto px-5 sm:px-11 pt-16 lg:pt-[88px] grid lg:grid-cols-[.72fr_1.28fr] gap-8 lg:gap-14 items-start"
    >
      <div>
        <p className="font-plex text-[10px] font-bold tracking-[.2em] text-[#6f88a8]">FAQ</p>
        <h2 className="mt-3.5 text-4xl sm:text-[44px] leading-none font-bold tracking-[-.035em] text-[#f4f9ff]">
          Before<br />you ask.
        </h2>
      </div>
      <div>
        {FAQS.map((faq, i) => {
          const open = openIndex === i
          return (
            <div key={faq.q} className="border-t border-[#17263c]">
              <button
                type="button"
                onClick={() => setOpenIndex(open ? -1 : i)}
                aria-expanded={open}
                className="w-full flex items-start gap-4 sm:gap-[22px] py-5 bg-transparent border-none cursor-pointer text-left"
              >
                <span className={cn('font-plex text-[10px] font-bold tracking-[.14em] pt-[5px]', open ? 'text-[#38bdf8]' : 'text-[#2f4a70]')}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-lg font-bold tracking-[-.02em] text-[#f4f9ff]">{faq.q}</span>
                <svg
                  viewBox="0 0 24 24"
                  width="16"
                  height="16"
                  fill="none"
                  stroke="#6f88a8"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={cn('shrink-0 mt-[5px] transition-transform duration-200', open && 'rotate-180')}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {open && (
                <p className="pb-5 pl-8 max-w-[640px] font-inter-body text-sm leading-[1.65] text-[#8ba4c4]">{faq.a}</p>
              )}
            </div>
          )
        })}
        <div className="border-t border-[#17263c]" />
      </div>
    </section>
  )
}
