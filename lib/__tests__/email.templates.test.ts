import fs from 'fs'
import path from 'path'
import { render } from '@react-email/render'
import { JoinRequestAdminEmail } from '@/lib/email/templates/JoinRequestAdminEmail'
import { JoinRequestStatusEmail } from '@/lib/email/templates/JoinRequestStatusEmail'
import { SignInCodeEmail } from '@/lib/email/templates/SignInCodeEmail'

const baseAdminProps = {
  leagueName: 'Sunday 5s',
  requesterName: 'Marcus Thompson',
  requesterEmail: 'marcus@example.com',
  message: null,
  membersPageUrl: 'https://craft-football.com/sunday-5s/settings',
}

describe('JoinRequestAdminEmail', () => {
  it('renders requester name and email', async () => {
    const html = await render(JoinRequestAdminEmail(baseAdminProps))
    expect(html).toContain('Marcus Thompson')
    expect(html).toContain('marcus@example.com')
  })

  it('renders league name', async () => {
    const html = await render(JoinRequestAdminEmail(baseAdminProps))
    expect(html).toContain('Sunday 5s')
  })

  it('includes the review CTA link', async () => {
    const html = await render(JoinRequestAdminEmail(baseAdminProps))
    expect(html).toContain('craft-football.com/sunday-5s/settings')
    expect(html).toContain('Review request')
  })

  it('renders message when provided', async () => {
    const html = await render(
      JoinRequestAdminEmail({ ...baseAdminProps, message: 'Played with Dan last season' })
    )
    expect(html).toContain('Played with Dan last season')
  })

  it('omits message block when message is null', async () => {
    const html = await render(JoinRequestAdminEmail(baseAdminProps))
    expect(html).not.toContain('Played with Dan last season')
  })
})

describe('JoinRequestStatusEmail', () => {
  it('renders approved state with requester name and league link', async () => {
    const html = await render(
      JoinRequestStatusEmail({
        leagueName: 'Sunday 5s',
        requesterName: 'Marcus',
        action: 'approved',
        leagueUrl: 'https://craft-football.com/sunday-5s',
      })
    )
    expect(html).toContain('in, Marcus')
    expect(html).toContain('craft-football.com/sunday-5s')
    expect(html).toContain('Go to league')
  })

  it('renders declined state without league link', async () => {
    const html = await render(
      JoinRequestStatusEmail({
        leagueName: 'Sunday 5s',
        requesterName: 'Marcus',
        action: 'declined',
        leagueUrl: null,
      })
    )
    expect(html).toContain('Request not accepted')
    expect(html).not.toContain('Go to league')
  })

  it('renders the league name in both states', async () => {
    const html = await render(
      JoinRequestStatusEmail({
        leagueName: 'Sunday 5s',
        requesterName: 'Marcus',
        action: 'declined',
        leagueUrl: null,
      })
    )
    expect(html).toContain('Sunday 5s')
  })
})

describe('SignInCodeEmail', () => {
  // The committed HTML is what gets pasted into Supabase, so it must match the
  // component. Regenerate with UPDATE_EMAIL_TEMPLATES=1 npm test -- email.templates
  it('matches supabase/templates/sign-in-code.html', async () => {
    // Supabase's editor mangles the invisible preview padding, so write every
    // non-ASCII character as an HTML entity.
    const html = (await render(SignInCodeEmail())).replace(/[^\x00-\x7f]/g, c => `&#${c.codePointAt(0)};`)
    expect(html).toContain('{{ .Token }}')
    const file = path.join(__dirname, '../../supabase/templates/sign-in-code.html')
    if (process.env.UPDATE_EMAIL_TEMPLATES) fs.writeFileSync(file, html)
    expect(fs.readFileSync(file, 'utf8')).toBe(html)
  })
})
