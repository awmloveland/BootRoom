# Email Notifications — League Join Requests

**Date:** 2026-04-16
**Status:** Approved

---

## Overview

Add email notifications at two points in the league join-request flow:

1. **Admin notification** — when a user submits a join request, all league admins receive an email with the requester's details and a direct link to the members page.
2. **Requester notification** — when an admin approves or declines a request, the requester receives an email informing them of the outcome.

---

## Approach

Emails are sent **inline in the existing API routes**, awaited but with errors caught and logged. Email failures never affect the HTTP response or the underlying join/review action.

```ts
notifyAdminsOfJoinRequest(...).catch(err => console.error('[email]', err))
```

---

## Email Provider

**Resend** via the `resend` npm package + `@react-email/components` for HTML templates.

**New env var:** `RESEND_API_KEY` — required in `.env.local` and Vercel project settings.

**From address:** `notifications@craft-football.com`

---

## New Files

### `lib/email/resend.ts`
Initialises and exports a singleton Resend client using `RESEND_API_KEY`.

### `lib/email/templates/JoinRequestAdminEmail.tsx`
React Email template for the admin notification. Props:
- `leagueName: string`
- `requesterName: string`
- `requesterEmail: string`
- `message: string | null`
- `membersPageUrl: string`

### `lib/email/templates/JoinRequestStatusEmail.tsx`
React Email template for the requester notification. Props:
- `leagueName: string`
- `action: 'approved' | 'declined'`
- `leagueUrl: string | null` — only used when approved

### `lib/email/send-join-request-notifications.ts`
Two exported functions:

#### `notifyAdminsOfJoinRequest(gameId, requester, origin)`
- `gameId: string`
- `requester: { userId: string; email: string; message: string | null }` — `userId` and `email` are available from the authenticated user in the route; `display_name` is resolved by the helper
- `origin: string` — used to construct the members page URL

Steps:
1. Use the service-role Supabase client to:
   - Fetch league `name` and `slug` from `games`
   - Fetch admin emails from `game_members` joined to `auth.users` (role `admin` or `creator`)
   - Fetch requester `display_name` from `profiles`
2. Render `JoinRequestAdminEmail` to HTML
3. Call `resend.emails.send()` for each admin email

#### `notifyRequesterOfReview(requestId, action, origin)`
- `requestId: string`
- `action: 'approved' | 'declined'`
- `origin: string`

Steps:
1. Use the service-role Supabase client to fetch the requester's email, display name, and league name/slug from `game_join_requests` joined to `games`
2. Render `JoinRequestStatusEmail` to HTML
3. Call `resend.emails.send()` to the requester

---

## Modified Files

### `app/api/league/[id]/join-requests/route.ts`
After the successful `submit_join_request` RPC call in the `POST` handler:
```ts
notifyAdminsOfJoinRequest(id, { displayName, email, message }, origin).catch(...)
```
The `userId` and `email` come from the authenticated user (`user.id`, `user.email`). The `origin` is read from `request.headers.get('origin')`. Display name is resolved inside the helper.

### `app/api/league/[id]/join-requests/[requestId]/review/route.ts`
After the successful `review_join_request` RPC call in the `POST` handler:
```ts
notifyRequesterOfReview(requestId, action, origin).catch(...)
```

---

## Data Access

Both notification functions use `createServiceClient()` from `lib/supabase/service.ts` to read across `auth.users` (for admin emails) and join `game_join_requests` to `games`. The regular server client cannot read `auth.users`.

---

## Email Content

### Email 1 — Admin notification

- **To:** All members of the league with role `admin` or `creator`
- **Subject:** `New join request for [League Name]`
- **Body:**
  - Requester display name and email
  - Their optional message (omitted if null)
  - CTA button: "Review request" → `/app/league/[slug]/settings` (members tab)

### Email 2 — Requester notification (approved)

- **To:** Requester's email
- **Subject:** `You've been approved to join [League Name]`
- **Body:** Confirmation they're now a member + CTA button linking to the league

### Email 2 — Requester notification (declined)

- **To:** Requester's email
- **Subject:** `Update on your request to join [League Name]`
- **Body:** Simple message that their request was not accepted. No reason given.

---

## Template Styling

Built with `@react-email/components`. Dark aesthetic matching BootRoom:
- Background: `#0f172a` (slate-900)
- Card: `#1e293b` (slate-800) with `#334155` (slate-700) border
- Primary text: `#f1f5f9` (slate-100)
- Secondary text: `#94a3b8` (slate-400)
- CTA button: solid white text on dark background

---

## Out of Scope

- Email unsubscribe / preference management
- Digest emails (one email per request, not batched)
- Admin notification for player claim reviews (separate feature)
- Retry logic for failed sends (log and move on)
