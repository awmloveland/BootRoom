// Shared pieces for the link-preview images in components/og, rendered to PNG
// by next/og (Satori) in app/api/og/*. Satori only understands inline style
// objects, so this folder is the one place in the app that styles with
// `style`. Every element with more than one child needs display: 'flex'.
import type { CSSProperties, ReactNode } from 'react'
import { fitFontSize, SITE_TAGLINE } from '@/lib/utils'
import type { ResultHighlightIcon } from '@/lib/types'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_W = OG_SIZE.width
export const OG_H = OG_SIZE.height

// The ball from app/icon.svg (viewBox 4 4 72 72).
const BALL_PATH =
  'M40.15 31.00L40.15 23.50L49.26 17.64L58.40 24.28L55.65 34.76L48.51 37.08ZM48.61 37.36L55.74 35.04L64.13 41.90L60.63 52.64L49.82 53.26L45.41 47.19ZM45.17 47.37L49.58 53.44L45.65 63.53L34.35 63.53L30.42 53.44L34.83 47.37ZM34.59 47.19L30.18 53.26L19.37 52.64L15.87 41.90L24.26 35.04L31.39 37.36ZM31.49 37.08L24.35 34.76L21.60 24.28L30.74 17.64L39.85 23.50L39.85 31.00Z'

export const ROOT: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  position: 'relative',
  backgroundColor: '#060b14',
  color: '#f4f9ff',
  fontFamily: 'Space Grotesk',
}

const FULL: CSSProperties = { position: 'absolute', left: 0, top: 0, width: OG_W, height: OG_H }

/** Plex Mono bold caps, the label style used across the images. `em` is the letter spacing. */
export function monoCaps(fontSize: number, em = 0.15): CSSProperties {
  return { fontFamily: 'IBM Plex Mono', fontSize, fontWeight: 700, letterSpacing: em * fontSize, textTransform: 'uppercase' }
}

/** Meta line on top; children centred between it and the footer wordmark. */
export function OgBody({ meta, children, align = 'stretch' }: { meta: ReactNode; children: ReactNode; align?: CSSProperties['alignItems'] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, width: '100%', padding: '30px 60px 76px' }}>
      {meta}
      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center', alignItems: align }}>{children}</div>
    </div>
  )
}

/** A big single-line name, sized to fit `width` and ellipsised if it still doesn't. */
export function HeroName({ text, width, max, min }: { text: string; width: number; max: number; min: number }) {
  const size = fitFontSize(text.length, width, max, min)
  return (
    <div style={{ maxWidth: width, fontSize: size, fontWeight: 700, letterSpacing: -0.035 * size, lineHeight: 1.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {text}
    </div>
  )
}

export function Wordmark({ ballSize, fontSize }: { ballSize: number; fontSize: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(ballSize * 0.35) }}>
      <svg width={ballSize} height={ballSize} viewBox="4 4 72 72">
        <circle cx="40" cy="40" r="33" fill="none" stroke="#d8d8d8" strokeWidth="4" />
        <path fill="#d8d8d8" d={BALL_PATH} />
      </svg>
      <div style={{ fontSize, fontWeight: 700, letterSpacing: -0.02 * fontSize, color: '#f4f9ff' }}>
        Craft Football
      </div>
    </div>
  )
}

/** The small centred wordmark 24px from the bottom of every image. */
export function FooterWordmark() {
  return (
    <div style={{ position: 'absolute', left: 0, bottom: 24, width: OG_W, display: 'flex', justifyContent: 'center', opacity: 0.9 }}>
      <Wordmark ballSize={28} fontSize={21} />
    </div>
  )
}

/** The top line: Plex Mono caps, a label on the left and an optional detail on the right. */
export function MetaLine({ left, right }: { left: string; right?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        ...monoCaps(19),
        color: '#8ba4c4',
      }}
    >
      <div style={{ maxWidth: 680, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{left}</div>
      {right ? <div>{right}</div> : null}
    </div>
  )
}

/** The app's dot field, fading out towards the bottom. */
export function DotField() {
  return (
    <div style={{ ...FULL, display: 'flex' }}>
      <div style={{ ...FULL, backgroundImage: 'radial-gradient(circle closest-side, #223a5c 0%, #223a5c 18%, rgba(34,58,92,0) 24%)', backgroundSize: '24px 24px' }} />
      <div style={{ ...FULL, backgroundImage: 'linear-gradient(180deg, rgba(6,11,20,0) 0%, rgba(6,11,20,0.6) 55%, #060b14 100%)' }} />
    </div>
  )
}

/** A soft radial glow, e.g. the winner's colour behind a result. `size` is where the glow fades out. */
export function Glow({ at, color, size = '55%' }: { at: string; color: string; size?: string }) {
  return <div style={{ ...FULL, backgroundImage: `radial-gradient(circle at ${at}, ${color}, rgba(6,11,20,0) ${size})` }} />
}

export type OgIconName = ResultHighlightIcon | 'trophy'

// Path data copied from lucide (24 × 24, stroke icons). Satori can't render
// the lucide-react components themselves, so the shapes are inlined.
const ICONS: Record<OgIconName, { paths: string[]; circles?: { cx: number; cy: number; r: number }[] }> = {
  flame: { paths: ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4'] },
  'heart-crack': {
    paths: [
      'M12.409 5.824c-.702.792-1.15 1.496-1.415 2.166l2.153 2.156a.5.5 0 0 1 0 .707l-2.293 2.293a.5.5 0 0 0 0 .707L12 15',
      'M13.508 20.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5a5.5 5.5 0 0 1 9.591-3.677.6.6 0 0 0 .818.001A5.5 5.5 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5z',
    ],
  },
  zap: { paths: ['M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z'] },
  award: {
    paths: ['m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526'],
    circles: [{ cx: 12, cy: 8, r: 6 }],
  },
  'trending-up': { paths: ['M16 7h6v6', 'm22 7-8.5 8.5-5-5L2 17'] },
  crown: {
    paths: [
      'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
      'M5 21h14',
    ],
  },
  trophy: {
    paths: [
      'M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978',
      'M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978',
      'M18 9h1.5a1 1 0 0 0 0-5H18',
      'M4 22h16',
      'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z',
      'M6 9H4.5a1 1 0 0 1 0-5H6',
    ],
  },
}

export function OgIcon({ name, size, color, strokeWidth = 2.2 }: {
  name: OgIconName
  size: number
  color: string
  strokeWidth?: number
}) {
  const icon = ICONS[name]
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {icon.paths.map((d) => <path key={d} d={d} />)}
      {icon.circles?.map((c) => <circle key={`${c.cx}-${c.cy}`} cx={c.cx} cy={c.cy} r={c.r} />)}
    </svg>
  )
}

/** Shown for missing, malformed or stale tokens and as the site default. Reveals no league data. */
export function GenericShareImage() {
  return (
    <div style={{ ...ROOT, flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <Wordmark ballSize={88} fontSize={64} />
      <div style={{ marginTop: 28, fontFamily: 'Inter', fontWeight: 700, fontSize: 28, color: '#8ba4c4' }}>
        {SITE_TAGLINE}
      </div>
    </div>
  )
}
