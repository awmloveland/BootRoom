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

export interface JoinRequestAdminEmailProps {
  leagueName: string
  requesterName: string
  requesterEmail: string
  message: string | null
  membersPageUrl: string
}

export function JoinRequestAdminEmail({
  leagueName,
  requesterName,
  requesterEmail,
  message,
  membersPageUrl,
}: JoinRequestAdminEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>New join request for {leagueName}</Preview>
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

          <Heading style={titleStyle}>New join request</Heading>
          <Text style={subtitleStyle}>
            Someone wants to join{' '}
            <strong style={{ color: '#94a3b8' }}>{leagueName}</strong>. Review
            their details and approve or decline from the members page.
          </Text>

          <Section style={cardStyle}>
            <Text style={cardLabelStyle}>Name</Text>
            <Text style={cardValueStyle}>{requesterName}</Text>
            <Hr style={cardDividerStyle} />
            <Text style={cardLabelStyle}>Email</Text>
            <Text style={cardValueStyle}>{requesterEmail}</Text>
            {message && (
              <>
                <Hr style={cardDividerStyle} />
                <Text style={cardLabelStyle}>Message</Text>
                <Text style={messageStyle}>&ldquo;{message}&rdquo;</Text>
              </>
            )}
          </Section>

          <Link href={membersPageUrl} style={ctaStyle}>
            Review request →
          </Link>

          <Hr style={footerDividerStyle} />
          <Text style={footerStyle}>
            Craft Football · craft-football.com{'\n'}
            You&apos;re receiving this because you&apos;re an admin of{' '}
            {leagueName}.
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
const cardStyle = {
  backgroundColor: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '8px',
  padding: '16px',
  marginBottom: '24px',
  textAlign: 'left' as const,
}
const cardLabelStyle = { color: '#475569', fontSize: '13px', fontWeight: '500' as const, margin: '0 0 2px' }
const cardValueStyle = { color: '#cbd5e1', fontSize: '13px', margin: '0 0 8px' }
const cardDividerStyle = { borderColor: '#0f172a', margin: '4px 0' }
const messageStyle = {
  backgroundColor: '#0f172a',
  border: '1px solid #1e293b',
  borderRadius: '6px',
  padding: '12px',
  fontSize: '13px',
  color: '#94a3b8',
  fontStyle: 'italic',
  lineHeight: '1.5',
  margin: '0',
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
  whiteSpace: 'pre-line' as const,
}
