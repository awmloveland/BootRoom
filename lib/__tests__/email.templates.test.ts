import { render } from '@react-email/render'
import { JoinRequestAdminEmail } from '@/lib/email/templates/JoinRequestAdminEmail'
import { JoinRequestStatusEmail } from '@/lib/email/templates/JoinRequestStatusEmail'

const baseAdminProps = {
  leagueName: 'Sunday 5s',
  requesterName: 'Marcus Thompson',
  requesterEmail: 'marcus@example.com',
  message: null,
  membersPageUrl: 'https://craft-football.com/app/league/sunday-5s/settings',
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
    expect(html).toContain('craft-football.com/app/league/sunday-5s/settings')
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
        leagueUrl: 'https://craft-football.com/app/league/sunday-5s',
      })
    )
    expect(html).toContain('in, Marcus')
    expect(html).toContain('craft-football.com/app/league/sunday-5s')
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
