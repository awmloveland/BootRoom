// Supabase sends this one, not us: it is rendered to static HTML in
// supabase/templates/sign-in-code.html and pasted into the dashboard's
// Magic Link and Confirm signup templates. {{ .Token }} is Supabase's
// placeholder for the 6-digit code.
import type { CSSProperties } from 'react'
import { Heading, Text } from '@react-email/components'
import { bodyTextStyle, EmailLayout, eyebrowStyle, headingStyle, PLEX } from '@/lib/email/templates/EmailLayout'

export function SignInCodeEmail() {
  return (
    <EmailLayout
      preview="{{ .Token }} is your Craft Football sign-in code"
      leagueName="Sign in"
      reason="Someone asked to sign in with this email. If it wasn't you, you can ignore it."
    >
      <Text style={eyebrowStyle}>Sign-in code</Text>
      <Heading style={headingStyle}>Your Craft Football code</Heading>
      <Text style={bodyTextStyle}>Enter it on Craft Football to finish signing in. It works once and expires soon.</Text>
      <Text style={codeStyle}>{'{{ .Token }}'}</Text>
    </EmailLayout>
  )
}

const codeStyle: CSSProperties = {
  fontFamily: PLEX,
  color: '#f4f9ff',
  fontSize: '32px',
  fontWeight: 700,
  letterSpacing: '10px',
  textAlign: 'center',
  backgroundColor: '#0c1728',
  border: '1px solid #223a5c',
  borderRadius: '4px',
  padding: '16px 12px',
  margin: '0',
}
