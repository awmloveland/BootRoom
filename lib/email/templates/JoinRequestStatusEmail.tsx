import type { CSSProperties } from 'react'
import { Heading, Text } from '@react-email/components'
import {
  bodyTextStyle,
  EmailButton,
  EmailLayout,
  headingStyle,
  monoCaps,
  strongStyle,
} from '@/lib/email/templates/EmailLayout'

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
    <EmailLayout
      preview={previewText}
      leagueName={leagueName}
      reason={`You requested to join ${leagueName}.`}
    >
      <Text style={isApproved ? approvedBadgeStyle : declinedBadgeStyle}>
        {isApproved ? 'Approved' : 'Not accepted'}
      </Text>
      <Heading style={headingStyle}>
        {isApproved ? `You're in, ${requesterName}` : 'Request not accepted'}
      </Heading>
      <Text style={isApproved ? bodyTextStyle : { ...bodyTextStyle, margin: '0' }}>
        Your request to join <span style={strongStyle}>{leagueName}</span>
        {isApproved
          ? ' has been approved. You now have access to the league.'
          : ' was not accepted at this time.'}
      </Text>

      {isApproved && leagueUrl && <EmailButton href={leagueUrl}>Go to league</EmailButton>}
    </EmailLayout>
  )
}

const badgeStyle: CSSProperties = {
  ...monoCaps(10),
  display: 'inline-block',
  borderRadius: '4px',
  padding: '5px 10px',
  margin: '0 0 16px',
}
// Lime for positive status and red for destructive, as in the app.
const approvedBadgeStyle: CSSProperties = {
  ...badgeStyle,
  backgroundColor: 'rgba(190,242,100,0.12)',
  color: '#bef264',
  border: '1px solid rgba(190,242,100,0.4)',
}
const declinedBadgeStyle: CSSProperties = {
  ...badgeStyle,
  backgroundColor: 'rgba(226,104,111,0.12)',
  color: '#e2686f',
  border: '1px solid rgba(226,104,111,0.4)',
}
