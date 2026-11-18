import type { CSSProperties } from 'react'
import { Heading, Hr, Section, Text } from '@react-email/components'
import {
  bodyTextStyle,
  EmailButton,
  EmailLayout,
  eyebrowStyle,
  hairline,
  headingStyle,
  inkStyle,
  INTER,
  monoCaps,
  mutedStyle,
  strongStyle,
} from '@/lib/email/templates/EmailLayout'

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
    <EmailLayout
      preview={`New join request for ${leagueName}`}
      leagueName={leagueName}
      reason={`You're receiving this because you're an admin of ${leagueName}.`}
    >
      <Text className="em-accent" style={eyebrowStyle}>New join request</Text>
      <Heading className="em-ink" style={headingStyle}>Someone wants to join</Heading>
      <Text className="em-muted" style={bodyTextStyle}>
        <span className="em-ink" style={strongStyle}>{requesterName}</span> has asked to join{' '}
        <span className="em-ink" style={strongStyle}>{leagueName}</span>. Approve or decline them from the league settings.
      </Text>

      <Section className="em-line" style={detailsStyle}>
        <Text className="em-muted" style={labelStyle}>Name</Text>
        <Text className="em-ink" style={valueStyle}>{requesterName}</Text>
        <Hr className="em-line" style={dividerStyle} />
        <Text className="em-muted" style={labelStyle}>Email</Text>
        <Text className="em-ink" style={valueStyle}>{requesterEmail}</Text>
        {message && (
          <>
            <Hr className="em-line" style={dividerStyle} />
            <Text className="em-muted" style={labelStyle}>Message</Text>
            <Text className="em-ink" style={valueStyle}>&ldquo;{message}&rdquo;</Text>
          </>
        )}
      </Section>

      <EmailButton href={membersPageUrl}>Review request</EmailButton>
    </EmailLayout>
  )
}

const detailsStyle: CSSProperties = {
  border: hairline,
  borderRadius: '8px',
  padding: '4px 16px',
  marginBottom: '24px',
}
const labelStyle: CSSProperties = { ...monoCaps(10), ...mutedStyle, margin: '12px 0 4px' }
const valueStyle: CSSProperties = {
  fontFamily: INTER,
  ...inkStyle,
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 12px',
}
const dividerStyle: CSSProperties = { borderTop: hairline, margin: '0' }
