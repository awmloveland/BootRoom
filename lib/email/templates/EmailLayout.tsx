// Shared frame for the transactional emails, plus the palette and type styles
// the templates build on. Email clients only reliably honour inline styles, so
// like components/og this folder styles with `style` objects and hex values,
// not Tailwind.
//
// The emails are light and flat on purpose. Mail apps in dark mode recolour an
// email themselves: light emails darken cleanly, but an always-navy design with
// stacked tints came out as washed-out slate or flipped to white. Apps that
// honour prefers-color-scheme (Apple Mail mainly) get the navy palette from
// DARK_CSS through the em-* classes; inline styles are the light version.
import type { CSSProperties, ReactNode } from 'react'
import { Body, Button, Column, Container, Head, Html, Img, Preview, Row, Section, Text } from '@react-email/components'

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Inter:wght@400;600&family=Space+Grotesk:wght@600;700&display=swap'

// Clients that block web fonts (Gmail, Outlook) fall back to the system stack.
const SYSTEM = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
export const GROTESK = `'Space Grotesk', Inter, ${SYSTEM}`
export const INTER = `Inter, ${SYSTEM}`
export const PLEX = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"

/** Plex Mono caps, the label style used across the app. */
export function monoCaps(fontSize: number): CSSProperties {
  return {
    fontFamily: PLEX,
    fontSize: `${fontSize}px`,
    fontWeight: 700,
    letterSpacing: `${(fontSize * 0.14).toFixed(1)}px`,
    textTransform: 'uppercase',
  }
}

const INK = '#0a1421'
const MUTED = '#4f688a'
const LINE = '#d8e1ec'
// Off-white: Apple Mail force-inverts pure #ffffff whatever the dark styles say.
const PAPER = '#fffffe'

// Body copies its background onto an inner cell that takes no class, hence
// the child selector.
const DARK_CSS = `:root { color-scheme: light dark; }
@media (prefers-color-scheme: dark) {
  body, body > table > tbody > tr > td { background-color: #0a1421 !important; }
  .em-ink { color: #f4f9ff !important; }
  .em-muted { color: #8ba4c4 !important; }
  .em-accent { color: #7dd3fc !important; }
  .em-line { border-color: #1b2c46 !important; }
  .em-ok { color: #bef264 !important; border-color: #5d7a2e !important; }
  .em-no { color: #e2686f !important; border-color: #7a3b44 !important; }
}`

export const hairline = `1px solid ${LINE}`

export const eyebrowStyle: CSSProperties = { ...monoCaps(11), color: '#0369a1', margin: '0 0 10px' }

export const headingStyle: CSSProperties = {
  fontFamily: GROTESK,
  color: INK,
  fontSize: '24px',
  fontWeight: 700,
  letterSpacing: '-0.5px',
  lineHeight: '1.2',
  margin: '0 0 10px',
}

export const bodyTextStyle: CSSProperties = {
  fontFamily: INTER,
  color: MUTED,
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 24px',
}

/** Inline emphasis inside body copy, e.g. the league name. */
export const strongStyle: CSSProperties = { color: INK, fontWeight: 600 }
export const mutedStyle: CSSProperties = { color: MUTED }
export const inkStyle: CSSProperties = { color: INK }

/** The app's primary button: sky fill, navy text. */
export function EmailButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button href={href} style={buttonStyle}>
      {children}
    </Button>
  )
}

interface EmailLayoutProps {
  preview: string
  leagueName: string
  /** Second footer line explaining why the recipient got this email. */
  reason: string
  children: ReactNode
}

export function EmailLayout({ preview, leagueName, reason, children }: EmailLayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="color-scheme" content="light dark" />
        <meta name="supported-color-schemes" content="light dark" />
        <link href={FONTS_URL} rel="stylesheet" />
        <style dangerouslySetInnerHTML={{ __html: DARK_CSS }} />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={pageStyle}>
        <Container style={containerStyle}>
          <Section className="em-line" style={cardStyle}>
            <Section className="em-line" style={bandStyle}>
              <Row>
                <Column style={{ width: '38px', verticalAlign: 'middle' }}>
                  {/* The app icon carries its own navy tile, so it reads on any background. */}
                  <Img src="https://craft-football.com/apple-icon.png" alt="" width={28} height={28} style={logoStyle} />
                </Column>
                <Column style={{ verticalAlign: 'middle' }}>
                  <Text className="em-ink" style={wordmarkStyle}>Craft Football</Text>
                </Column>
                <Column style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                  <Text className="em-muted" style={leagueStyle}>{leagueName}</Text>
                </Column>
              </Row>
            </Section>
            <Section style={contentStyle}>{children}</Section>
          </Section>
          <Text className="em-muted" style={footerStyle}>
            Craft Football · craft-football.com
            <br />
            {reason}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const pageStyle: CSSProperties = { backgroundColor: PAPER, margin: '0', padding: '0', fontFamily: INTER }
const containerStyle: CSSProperties = { maxWidth: '560px', margin: '0 auto', padding: '32px 16px' }
const cardStyle: CSSProperties = { border: hairline, borderRadius: '12px', overflow: 'hidden' }
const bandStyle: CSSProperties = { borderBottom: hairline, padding: '14px 24px' }
const logoStyle: CSSProperties = { display: 'block', borderRadius: '6px' }
const wordmarkStyle: CSSProperties = {
  fontFamily: GROTESK,
  color: INK,
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '-0.3px',
  margin: '0',
}
const leagueStyle: CSSProperties = { ...monoCaps(10), color: MUTED, margin: '0' }
const contentStyle: CSSProperties = { padding: '28px 24px 28px' }
const buttonStyle: CSSProperties = {
  display: 'block',
  backgroundColor: '#38bdf8',
  color: '#05101d',
  fontFamily: GROTESK,
  fontSize: '15px',
  fontWeight: 700,
  textAlign: 'center',
  textDecoration: 'none',
  padding: '13px 20px',
  borderRadius: '4px',
}
const footerStyle: CSSProperties = {
  fontFamily: INTER,
  color: MUTED,
  fontSize: '12px',
  lineHeight: '1.6',
  textAlign: 'center',
  margin: '20px 0 0',
}
