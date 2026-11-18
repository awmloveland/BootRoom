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
      <Text className={isApproved ? 'em-ok' : 'em-no'} style={isApproved ? approvedBadgeStyle : declinedBadgeStyle}>
        {isApproved ? 'Approved' : 'Not accepted'}
      </Text>
      <Heading className="em-ink" style={headingStyle}>
        {isApproved ? `You're in, ${requesterName}` : 'Request not accepted'}
      </Heading>
      <Text className="em-muted" style={isApproved ? bodyTextStyle : { ...bodyTextStyle, margin: '0' }}>
        Your request to join <span className="em-ink" style={strongStyle}>{leagueName}</span>
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
// Lime for positive status and red for destructive, as in the app, darkened
// here to read on a light background. Outlined, not filled, so there is no
// tint for a mail app to recolour.
const approvedBadgeStyle: CSSProperties = { ...badgeStyle, color: '#3f6212', border: '1px solid #84cc16' }
const declinedBadgeStyle: CSSProperties = { ...badgeStyle, color: '#b4232c', border: '1px solid #e2686f' }
