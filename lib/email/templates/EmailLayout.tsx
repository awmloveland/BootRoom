// Shared frame for the transactional emails: the app's navy card with a
// header band, plus the palette and type styles the templates build on.
// Email clients only reliably honour inline styles, so like components/og
// this folder styles with `style` objects and hex values, not Tailwind.
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

export const eyebrowStyle: CSSProperties = { ...monoCaps(11), color: '#7dd3fc', margin: '0 0 10px' }

export const headingStyle: CSSProperties = {
  fontFamily: GROTESK,
  color: '#f4f9ff',
  fontSize: '24px',
  fontWeight: 700,
  letterSpacing: '-0.5px',
  lineHeight: '1.2',
  margin: '0 0 10px',
}

export const bodyTextStyle: CSSProperties = {
  fontFamily: INTER,
  color: '#8ba4c4',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 24px',
}

/** Inline emphasis inside body copy, e.g. the league name. */
export const strongStyle: CSSProperties = { color: '#f4f9ff', fontWeight: 600 }

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
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
        <link href={FONTS_URL} rel="stylesheet" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={pageStyle}>
        <Container style={containerStyle}>
          <Section style={cardStyle}>
            <Section style={bandStyle}>
              <Row>
                <Column style={{ width: '32px', verticalAlign: 'middle' }}>
                  <Img src="https://craft-football.com/logo.png" alt="" width={24} height={24} style={{ display: 'block' }} />
                </Column>
                <Column style={{ verticalAlign: 'middle' }}>
                  <Text style={wordmarkStyle}>Craft Football</Text>
                </Column>
                <Column style={{ verticalAlign: 'middle', textAlign: 'right' }}>
                  <Text style={leagueStyle}>{leagueName}</Text>
                </Column>
              </Row>
            </Section>
            <Section style={contentStyle}>{children}</Section>
          </Section>
          <Text style={footerStyle}>
            Craft Football · craft-football.com
            <br />
            {reason}
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const pageStyle: CSSProperties = { backgroundColor: '#060b14', margin: '0', padding: '0', fontFamily: INTER }
const containerStyle: CSSProperties = { maxWidth: '560px', margin: '0 auto', padding: '32px 16px' }
const cardStyle: CSSProperties = {
  backgroundColor: '#0a1421',
  border: '1px solid #1b2c46',
  borderRadius: '12px',
  overflow: 'hidden',
}
const bandStyle: CSSProperties = {
  backgroundColor: '#0c1728',
  borderBottom: '1px solid #17263c',
  padding: '14px 24px',
}
const wordmarkStyle: CSSProperties = {
  fontFamily: GROTESK,
  color: '#f4f9ff',
  fontSize: '15px',
  fontWeight: 700,
  letterSpacing: '-0.3px',
  margin: '0',
}
const leagueStyle: CSSProperties = { ...monoCaps(10), color: '#8ba4c4', margin: '0' }
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
  color: '#4f688a',
  fontSize: '12px',
  lineHeight: '1.6',
  textAlign: 'center',
  margin: '20px 0 0',
}
