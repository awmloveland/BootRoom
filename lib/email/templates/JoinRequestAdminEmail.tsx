import type { CSSProperties } from 'react'
import { Heading, Hr, Section, Text } from '@react-email/components'
import {
  bodyTextStyle,
  EmailButton,
  EmailLayout,
  eyebrowStyle,
  headingStyle,
  INTER,
  monoCaps,
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
      <Text style={eyebrowStyle}>New join request</Text>
      <Heading style={headingStyle}>Someone wants to join</Heading>
      <Text style={bodyTextStyle}>
        <span style={strongStyle}>{requesterName}</span> has asked to join{' '}
        <span style={strongStyle}>{leagueName}</span>. Approve or decline them from the league settings.
      </Text>

      <Section style={detailsStyle}>
        <Text style={labelStyle}>Name</Text>
        <Text style={valueStyle}>{requesterName}</Text>
        <Hr style={dividerStyle} />
        <Text style={labelStyle}>Email</Text>
        <Text style={valueStyle}>{requesterEmail}</Text>
        {message && (
          <>
            <Hr style={dividerStyle} />
            <Text style={labelStyle}>Message</Text>
            <Text style={valueStyle}>&ldquo;{message}&rdquo;</Text>
          </>
        )}
      </Section>

      <EmailButton href={membersPageUrl}>Review request</EmailButton>
    </EmailLayout>
  )
}

const detailsStyle: CSSProperties = {
  backgroundColor: '#0c1728',
  border: '1px solid #1b2c46',
  borderRadius: '8px',
  padding: '4px 16px',
  marginBottom: '24px',
}
const labelStyle: CSSProperties = { ...monoCaps(10), color: '#6f88a8', margin: '12px 0 4px' }
const valueStyle: CSSProperties = {
  fontFamily: INTER,
  color: '#f4f9ff',
  fontSize: '14px',
  lineHeight: '1.5',
  margin: '0 0 12px',
}
const dividerStyle: CSSProperties = { borderTop: '1px solid #17263c', margin: '0' }
