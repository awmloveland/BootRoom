'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { WAITLIST_FORMATS, type WaitlistFormat } from '@/lib/waitlist'

const EMAIL_RE = /^\S+@\S+\.\S+$/

const FORMAT_LABELS: Record<WaitlistFormat, string> = {
  '5': '5s',
  '6': '6s',
  '7': '7s',
  mixed: 'Mixed',
}

const inputClass =
  'w-full min-w-0 h-[46px] bg-[#0c1728] border border-[#1b2c46] rounded-md px-[13px] font-inter-body text-[13px] text-[#f4f9ff] placeholder:text-[#4f688a] outline-none focus:border-[#38bdf8] box-border'

export function WaitlistForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [format, setFormat] = useState<WaitlistFormat>('7')
  const [website, setWebsite] = useState('') // honeypot
  const [emailError, setEmailError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [requestFailed, setRequestFailed] = useState(false)

  async function submit() {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailError(true)
      return
    }
    setSubmitting(true)
    setRequestFailed(false)
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), city: city.trim(), format, website }),
      })
      if (!res.ok) throw new Error('request failed')
      setDone(true)
    } catch {
      setRequestFailed(true)
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-3.5 py-2">
        <span className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-[rgba(190,242,100,.12)] border border-[rgba(190,242,100,.45)] text-[#bef264] shrink-0">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </span>
        <div>
          <p className="text-[17px] font-bold tracking-[-.02em] text-[#f4f9ff]">You are on the list.</p>
          <p className="mt-1 font-inter-body text-[13px] text-[#8ba4c4]">
            We will email you as soon as Craft Football opens up.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-2.5">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <input
          type="email"
          placeholder="you@example.com"
          value={email}
          aria-invalid={emailError}
          onChange={(e) => {
            setEmail(e.target.value)
            setEmailError(false)
          }}
          className={cn(inputClass, emailError && 'border-[#e2686f]')}
        />
      </div>
      <input
        type="text"
        placeholder="City"
        value={city}
        onChange={(e) => setCity(e.target.value)}
        className={cn(inputClass, 'mt-2.5')}
      />
      <input
        type="text"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2 mt-2.5">
        <span className="font-plex text-[9px] font-semibold tracking-[.16em] text-[#6f88a8]">FORMAT</span>
        {WAITLIST_FORMATS.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFormat(value)}
            className={cn(
              'h-[34px] px-[13px] rounded-md border text-xs font-bold cursor-pointer transition-colors whitespace-nowrap',
              format === value
                ? 'bg-[#38bdf8] border-[#38bdf8] text-[#05101d]'
                : 'bg-transparent border-[#1b2c46] text-[#8ba4c4]'
            )}
          >
            {FORMAT_LABELS[value]}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="mt-3.5 w-full h-[50px] bg-[#bef264] hover:bg-[#d3f78d] disabled:opacity-60 rounded-md text-[#0d1a05] text-[15px] font-bold cursor-pointer transition-colors"
      >
        Register interest
      </button>
      {requestFailed && (
        <p className="mt-2.5 font-inter-body text-[13px] text-[#e2686f]">Something went wrong, try again.</p>
      )}
    </div>
  )
}
