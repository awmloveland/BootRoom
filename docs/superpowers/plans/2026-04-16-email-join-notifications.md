# Email Join Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send branded email notifications to league admins when a join request is submitted, and to the requester when their request is approved or declined.

**Architecture:** Resend is wired directly into the two existing join-request API routes. Email sends are fire-and-forget (`notifyX(...).catch(...)`), so they never block the response or break the core flow. All email logic lives in `lib/email/` — a singleton Resend client, two React Email templates, and two notification helper functions.

**Tech Stack:** `resend` (email API), `@react-email/components` + `@react-email/render` (HTML templates), Supabase service-role client (to read `auth.users` for admin emails)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `lib/email/resend.ts` | Lazy Resend client singleton |
| Create | `lib/email/templates/JoinRequestAdminEmail.tsx` | Branded admin notification template |
| Create | `lib/email/templates/JoinRequestStatusEmail.tsx` | Branded requester status template |
| Create | `lib/email/send-join-request-notifications.ts` | `notifyAdminsOfJoinRequest` + `notifyRequesterOfReview` |
| Create | `lib/__tests__/email.templates.test.ts` | Template render tests |
| Create | `lib/__tests__/email.notifications.test.ts` | Notification function unit tests |
| Modify | `app/api/league/[id]/join-requests/route.ts` | Wire in admin notification |
| Modify | `app/api/league/[id]/join-requests/[requestId]/review/route.ts` | Wire in requester notification |

---

## Task 1: Install dependencies and add env var placeholder

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.local`

- [ ] **Step 1: Install packages**

```bash
npm install resend @react-email/components @react-email/render
```

Expected: packages added to `dependencies` in `package.json`.

- [ ] **Step 2: Add env var placeholder to `.env.local`**

Append to `.env.local`:

```
# Email (Resend) — get key from resend.com dashboard
# RESEND_API_KEY=re_...
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json .env.local
git commit -m "chore: install resend and react-email packages"
```

---

## Task 2: Resend client singleton

**Files:**
- Create: `lib/email/resend.ts`

- [ ] **Step 1: Create the client**

Create `lib/email/resend.ts`:

```ts
import { Resend } from 'resend'

let _client: Resend | null = null

export function getResendClient(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('Missing RESEND_API_KEY')
    _client = new Resend(key)
  }
  return _client
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/email/resend.ts
git commit -m "feat: add Resend client singleton"
```

---

## Task 3: Admin email template (TDD)

**Files:**
- Create: `lib/__tests__/email.templates.test.ts`
- Create: `lib/email/templates/JoinRequestAdminEmail.tsx`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/email.templates.test.ts`:

```ts
import { render } from '@react-email/render'
import { JoinRequestAdminEmail } from '@/lib/email/templates/JoinRequestAdminEmail'

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
    // message prop is null — the message box should not appear
    expect(html).not.toContain('Played with Dan last season')
  })
})
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
npx jest lib/__tests__/email.templates.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/email/templates/JoinRequestAdminEmail'`

- [ ] **Step 3: Implement the template**

Create `lib/email/templates/JoinRequestAdminEmail.tsx`:

```tsx
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
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest lib/__tests__/email.templates.test.ts --no-coverage --testNamePattern="JoinRequestAdminEmail"
```

Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates/JoinRequestAdminEmail.tsx lib/__tests__/email.templates.test.ts
git commit -m "feat: add admin join request email template"
```

---

## Task 4: Status email template (TDD)

**Files:**
- Modify: `lib/__tests__/email.templates.test.ts`
- Create: `lib/email/templates/JoinRequestStatusEmail.tsx`

- [ ] **Step 1: Append the failing tests**

Append to `lib/__tests__/email.templates.test.ts`:

```ts
import { JoinRequestStatusEmail } from '@/lib/email/templates/JoinRequestStatusEmail'

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
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
npx jest lib/__tests__/email.templates.test.ts --no-coverage --testNamePattern="JoinRequestStatusEmail"
```

Expected: FAIL — `Cannot find module '@/lib/email/templates/JoinRequestStatusEmail'`

- [ ] **Step 3: Implement the template**

Create `lib/email/templates/JoinRequestStatusEmail.tsx`:

```tsx
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
            Craft Football · craft-football.com{'\n'}
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
  whiteSpace: 'pre-line' as const,
}
```

- [ ] **Step 4: Run all template tests — expect pass**

```bash
npx jest lib/__tests__/email.templates.test.ts --no-coverage
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/email/templates/JoinRequestStatusEmail.tsx lib/__tests__/email.templates.test.ts
git commit -m "feat: add requester join request status email template"
```

---

## Task 5: Notification functions (TDD)

**Files:**
- Create: `lib/__tests__/email.notifications.test.ts`
- Create: `lib/email/send-join-request-notifications.ts`

- [ ] **Step 1: Write the failing tests**

Create `lib/__tests__/email.notifications.test.ts`:

```ts
import {
  notifyAdminsOfJoinRequest,
  notifyRequesterOfReview,
} from '@/lib/email/send-join-request-notifications'
import { createServiceClient } from '@/lib/supabase/service'
import { getResendClient } from '@/lib/email/resend'

jest.mock('@/lib/supabase/service')
jest.mock('@/lib/email/resend')

const mockEmailSend = jest.fn().mockResolvedValue({ data: { id: 'e1' }, error: null })

beforeEach(() => {
  jest.clearAllMocks()
  ;(getResendClient as jest.Mock).mockReturnValue({ emails: { send: mockEmailSend } })
})

/** Builds a chainable Supabase query mock whose terminal methods resolve to data. */
function makeChain(terminalData: unknown) {
  const result = { data: terminalData, error: null }
  const chain: Record<string, jest.Mock> = {}
  chain.select = jest.fn(() => chain)
  chain.eq = jest.fn(() => chain)
  chain.in = jest.fn().mockResolvedValue(result)
  chain.single = jest.fn().mockResolvedValue(result)
  return chain
}

describe('notifyAdminsOfJoinRequest', () => {
  it('sends one email per admin with correct subject and recipient', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'games') return makeChain({ name: 'Sunday 5s', slug: 'sunday-5s' })
        if (table === 'game_members') return makeChain([{ user_id: 'uid-admin' }])
        if (table === 'profiles') return makeChain({ display_name: 'Marcus Thompson' })
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({
            data: { user: { email: 'admin@test.com' } },
            error: null,
          }),
        },
      },
    })

    await notifyAdminsOfJoinRequest(
      'game-id',
      { userId: 'user-id', email: 'marcus@test.com', message: null },
      'https://craft-football.com'
    )

    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@test.com',
        subject: 'New join request for Sunday 5s',
        from: 'notifications@craft-football.com',
      })
    )
  })

  it('sends one email per admin when there are multiple admins', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'games') return makeChain({ name: 'Sunday 5s', slug: 'sunday-5s' })
        if (table === 'game_members')
          return makeChain([{ user_id: 'uid-1' }, { user_id: 'uid-2' }])
        if (table === 'profiles') return makeChain({ display_name: 'Marcus' })
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: {
        admin: {
          getUserById: jest
            .fn()
            .mockResolvedValueOnce({ data: { user: { email: 'admin1@test.com' } }, error: null })
            .mockResolvedValueOnce({ data: { user: { email: 'admin2@test.com' } }, error: null }),
        },
      },
    })

    await notifyAdminsOfJoinRequest(
      'game-id',
      { userId: 'user-id', email: 'marcus@test.com', message: null },
      'https://craft-football.com'
    )

    expect(mockEmailSend).toHaveBeenCalledTimes(2)
  })

  it('does nothing when there are no admins', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn((table: string) => {
        if (table === 'games') return makeChain({ name: 'Sunday 5s', slug: 'sunday-5s' })
        if (table === 'game_members') return makeChain([])
        throw new Error(`Unexpected table: ${table}`)
      }),
      auth: { admin: { getUserById: jest.fn() } },
    })

    await notifyAdminsOfJoinRequest(
      'game-id',
      { userId: 'user-id', email: 'marcus@test.com', message: null },
      'https://craft-football.com'
    )

    expect(mockEmailSend).not.toHaveBeenCalled()
  })
})

describe('notifyRequesterOfReview', () => {
  it('sends approved email with correct subject', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() =>
        makeChain({
          email: 'marcus@test.com',
          display_name: 'Marcus',
          games: { name: 'Sunday 5s', slug: 'sunday-5s' },
        })
      ),
    })

    await notifyRequesterOfReview('request-id', 'approved', 'https://craft-football.com')

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marcus@test.com',
        subject: "You've been approved to join Sunday 5s",
        from: 'notifications@craft-football.com',
      })
    )
  })

  it('sends declined email with correct subject', async () => {
    ;(createServiceClient as jest.Mock).mockReturnValue({
      from: jest.fn(() =>
        makeChain({
          email: 'marcus@test.com',
          display_name: 'Marcus',
          games: { name: 'Sunday 5s', slug: 'sunday-5s' },
        })
      ),
    })

    await notifyRequesterOfReview('request-id', 'declined', 'https://craft-football.com')

    expect(mockEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marcus@test.com',
        subject: 'Update on your request to join Sunday 5s',
      })
    )
  })
})
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
npx jest lib/__tests__/email.notifications.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/lib/email/send-join-request-notifications'`

- [ ] **Step 3: Implement the notification functions**

Create `lib/email/send-join-request-notifications.ts`:

```ts
import { render } from '@react-email/render'
import { createServiceClient } from '@/lib/supabase/service'
import { getResendClient } from '@/lib/email/resend'
import { JoinRequestAdminEmail } from '@/lib/email/templates/JoinRequestAdminEmail'
import { JoinRequestStatusEmail } from '@/lib/email/templates/JoinRequestStatusEmail'

const FROM_ADDRESS = 'notifications@craft-football.com'

export async function notifyAdminsOfJoinRequest(
  gameId: string,
  requester: { userId: string; email: string; message: string | null },
  origin: string
): Promise<void> {
  const db = createServiceClient()

  const { data: league, error: leagueError } = await db
    .from('games')
    .select('name, slug')
    .eq('id', gameId)
    .single()

  if (leagueError || !league) throw new Error(`League not found: ${gameId}`)

  const { data: adminMembers, error: membersError } = await db
    .from('game_members')
    .select('user_id')
    .eq('game_id', gameId)
    .in('role', ['admin', 'creator'])

  if (membersError) throw membersError
  if (!adminMembers?.length) return

  const userResults = await Promise.all(
    (adminMembers as { user_id: string }[]).map(m =>
      db.auth.admin.getUserById(m.user_id)
    )
  )
  const adminEmails = userResults
    .filter(r => !r.error && r.data.user?.email)
    .map(r => r.data.user!.email as string)

  if (!adminEmails.length) return

  const { data: profile } = await db
    .from('profiles')
    .select('display_name')
    .eq('id', requester.userId)
    .single()

  const { name: leagueName, slug } = league as { name: string; slug: string }
  const requesterName =
    (profile as { display_name: string | null } | null)?.display_name ?? requester.email

  const html = await render(
    JoinRequestAdminEmail({
      leagueName,
      requesterName,
      requesterEmail: requester.email,
      message: requester.message,
      membersPageUrl: `${origin}/app/league/${slug}/settings`,
    })
  )

  const resend = getResendClient()
  await Promise.all(
    adminEmails.map(adminEmail =>
      resend.emails.send({
        from: FROM_ADDRESS,
        to: adminEmail,
        subject: `New join request for ${leagueName}`,
        html,
      })
    )
  )
}

export async function notifyRequesterOfReview(
  requestId: string,
  action: 'approved' | 'declined',
  origin: string
): Promise<void> {
  const db = createServiceClient()

  const { data: joinRequest, error } = await db
    .from('game_join_requests')
    .select('email, display_name, games(name, slug)')
    .eq('id', requestId)
    .single()

  if (error || !joinRequest) throw new Error(`Join request not found: ${requestId}`)

  const req = joinRequest as {
    email: string
    display_name: string
    games: { name: string; slug: string } | null
  }

  if (!req.games) throw new Error(`League not found for request: ${requestId}`)

  const html = await render(
    JoinRequestStatusEmail({
      leagueName: req.games.name,
      requesterName: req.display_name,
      action,
      leagueUrl: action === 'approved' ? `${origin}/app/league/${req.games.slug}` : null,
    })
  )

  const resend = getResendClient()
  await resend.emails.send({
    from: FROM_ADDRESS,
    to: req.email,
    subject:
      action === 'approved'
        ? `You've been approved to join ${req.games.name}`
        : `Update on your request to join ${req.games.name}`,
    html,
  })
}
```

- [ ] **Step 4: Run tests — expect pass**

```bash
npx jest lib/__tests__/email.notifications.test.ts --no-coverage
```

Expected: 5 tests PASS

- [ ] **Step 5: Run all tests to check nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add lib/email/send-join-request-notifications.ts lib/__tests__/email.notifications.test.ts
git commit -m "feat: add join request email notification functions"
```

---

## Task 6: Wire admin notification into join-requests route

**Files:**
- Modify: `app/api/league/[id]/join-requests/route.ts`

The current `POST` handler ends with:
```ts
return NextResponse.json({ ok: true }, { status: 201 })
```

- [ ] **Step 1: Add the import**

At the top of `app/api/league/[id]/join-requests/route.ts`, after the existing imports, add:

```ts
import { notifyAdminsOfJoinRequest } from '@/lib/email/send-join-request-notifications'
```

- [ ] **Step 2: Fire the notification after the successful RPC call**

In the `POST` handler, replace:

```ts
  return NextResponse.json({ ok: true }, { status: 201 })
```

with:

```ts
  const origin = request.headers.get('origin') ?? 'https://craft-football.com'
  notifyAdminsOfJoinRequest(
    id,
    { userId: user.id, email: user.email ?? '', message },
    origin
  ).catch(err => console.error('[email:notifyAdminsOfJoinRequest]', err))

  return NextResponse.json({ ok: true }, { status: 201 })
```

- [ ] **Step 3: Run all tests to confirm nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add app/api/league/\[id\]/join-requests/route.ts
git commit -m "feat: notify admins by email when a join request is submitted"
```

---

## Task 7: Wire requester notification into review route

**Files:**
- Modify: `app/api/league/[id]/join-requests/[requestId]/review/route.ts`

The current `POST` handler ends with:
```ts
return NextResponse.json({ success: true })
```

- [ ] **Step 1: Add the import**

At the top of `app/api/league/[id]/join-requests/[requestId]/review/route.ts`, after the existing imports, add:

```ts
import { notifyRequesterOfReview } from '@/lib/email/send-join-request-notifications'
```

- [ ] **Step 2: Fire the notification after the successful RPC call**

In the `POST` handler, replace:

```ts
  return NextResponse.json({ success: true })
```

with:

```ts
  const origin = request.headers.get('origin') ?? 'https://craft-football.com'
  notifyRequesterOfReview(requestId, action, origin)
    .catch(err => console.error('[email:notifyRequesterOfReview]', err))

  return NextResponse.json({ success: true })
```

- [ ] **Step 3: Run all tests to confirm nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add "app/api/league/[id]/join-requests/[requestId]/review/route.ts"
git commit -m "feat: notify requester by email when join request is reviewed"
```

---

## Done — Manual Smoke Test Checklist

Before merging, verify end-to-end with a real `RESEND_API_KEY` set in `.env.local`:

1. Submit a join request on a public league → admin inbox receives "New join request for [League]" email with correct requester name, email, optional message, and working "Review request →" link
2. Approve the request → requester inbox receives "You've been approved to join [League]" email with working "Go to league →" link
3. Decline a separate request → requester inbox receives "Update on your request to join [League]" email with no CTA button
4. Set `RESEND_API_KEY` to an invalid value → join/review actions still succeed (email error is logged, not thrown)

> **Vercel:** Add `RESEND_API_KEY` to the project's Environment Variables before deploying.
