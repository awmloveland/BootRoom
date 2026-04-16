import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface JoinRequestStatusEmailProps {
  leagueName: string
  requesterName: string
  action: 'approved' | 'declined'
  leagueUrl: string | null
}

export function JoinRequestStatusEmail({
  leagueName,
  requesterName,
  action,
  leagueUrl,
}: JoinRequestStatusEmailProps) {
  const isApproved = action === 'approved'
  const previewText = isApproved
    ? `You've been approved to join ${leagueName}`
    : `Update on your request to join ${leagueName}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Section style={headerStyle}>
            <Img
              src="https://craft-football.com/logo.png"
              alt="Craft Football"
              width={44}
              height={44}
              style={logoStyle}
            />
            <Text style={brandStyle}>Craft Football</Text>
            <Text style={leagueNameStyle}>{leagueName}</Text>
          </Section>

          <Section style={{ textAlign: 'center' as const, marginBottom: '20px' }}>
            <Text style={isApproved ? approvedBadgeStyle : declinedBadgeStyle}>
              {isApproved ? 'Approved' : 'Not accepted'}
            </Text>
          </Section>

          <Heading style={titleStyle}>
            {isApproved ? `You're in, ${requesterName}` : 'Request not accepted'}
          </Heading>
          <Text style={subtitleStyle}>
            Your request to join{' '}
            <strong style={{ color: '#94a3b8' }}>{leagueName}</strong>
            {isApproved
              ? ' has been approved. You now have access to the league.'
              : ' was not accepted at this time.'}
          </Text>

          {isApproved && leagueUrl && (
            <Link href={leagueUrl} style={ctaStyle}>
              Go to league →
            </Link>
          )}

          <Hr style={footerDividerStyle} />
          <Text style={footerStyle}>
            Craft Football · craft-football.com<br />
            You requested to join {leagueName}.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const bodyStyle = {
  backgroundColor: '#0f172a',
  margin: '0',
  padding: '0',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const containerStyle = {
  maxWidth: '640px',
  margin: '0 auto',
  padding: '32px 16px',
  textAlign: 'center' as const,
}
const headerStyle = {
  textAlign: 'center' as const,
  paddingBottom: '24px',
  borderBottom: '1px solid #1e293b',
  marginBottom: '28px',
}
const logoStyle = { borderRadius: '10px', margin: '0 auto 10px', display: 'block' }
const brandStyle = {
  color: '#f1f5f9',
  fontSize: '14px',
  fontWeight: '700',
  margin: '0',
  textAlign: 'center' as const,
}
const leagueNameStyle = {
  color: '#64748b',
  fontSize: '12px',
  margin: '2px 0 0',
  textAlign: 'center' as const,
}
const approvedBadgeStyle = {
  display: 'inline-block',
  backgroundColor: '#0f2a1a',
  color: '#4ade80',
  border: '1px solid #14532d',
  fontSize: '12px',
  fontWeight: '600' as const,
  padding: '4px 10px',
  borderRadius: '999px',
}
const declinedBadgeStyle = {
  display: 'inline-block',
  backgroundColor: '#1c0a0a',
  color: '#f87171',
  border: '1px solid #450a0a',
  fontSize: '12px',
  fontWeight: '600' as const,
  padding: '4px 10px',
  borderRadius: '999px',
}
const titleStyle = {
  color: '#f1f5f9',
  fontSize: '20px',
  fontWeight: '700',
  textAlign: 'center' as const,
  margin: '0 0 10px',
}
const subtitleStyle = {
  color: '#64748b',
  fontSize: '14px',
  textAlign: 'center' as const,
  lineHeight: '1.6',
  margin: '0 0 28px',
}
const ctaStyle = {
  display: 'block',
  textAlign: 'center' as const,
  backgroundColor: '#f1f5f9',
  color: '#0f172a',
  fontSize: '14px',
  fontWeight: '700',
  textDecoration: 'none',
  padding: '13px 24px',
  borderRadius: '6px',
  marginBottom: '28px',
}
const footerDividerStyle = { borderColor: '#1e293b', margin: '0 0 20px' }
const footerStyle = {
  color: '#334155',
  fontSize: '11px',
  textAlign: 'center' as const,
  lineHeight: '1.6',
  margin: '0',
}
