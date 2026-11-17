// components/new-league/Confetti.tsx
'use client'

import { useEffect, useRef } from 'react'

const COLOURS = ['#bef264', '#38bdf8', '#a78bfa', '#f4f9ff', '#7dd3fc']
const PIECES = 42

interface Piece {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  colour: string
  angle: number
  spin: number
  life: number   // seconds
  age: number
}

/**
 * One burst of confetti from behind the logo tile when the Live screen
 * mounts. Drawn on a full-screen canvas behind the page, so no per-piece
 * styles; skipped entirely for people who prefer reduced motion.
 */
export function Confetti() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
    // The logo tile sits at the top centre of the 520px column; the burst starts just above it.
    const origin = { x: canvas.width / 2, y: Math.min(120, canvas.height * 0.2) }
    const pieces: Piece[] = Array.from({ length: PIECES }, () => {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1
      const speed = 220 + Math.random() * 260
      return {
        x: origin.x, y: origin.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        size: 5 + Math.random() * 6,
        colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
        angle: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 8,
        life: 1.4 + Math.random() * 0.9, age: 0,
      }
    })

    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = 0
      for (const p of pieces) {
        p.age += dt
        if (p.age >= p.life) continue
        alive++
        p.vy += 900 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.angle += p.spin * dt
        ctx.save()
        ctx.globalAlpha = 1 - p.age / p.life
        ctx.translate(p.x, p.y)
        ctx.rotate(p.angle)
        ctx.fillStyle = p.colour
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2)
        ctx.restore()
      }
      if (alive > 0) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 -z-10" />
}
