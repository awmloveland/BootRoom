# Deployment Checklist — Steps 3–6

After deploying to Vercel and setting env vars, complete these steps.

---

## Step 3: Vercel domains

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your project
2. Go to **Settings** → **Domains**
3. Add both domains:
   - `craft-football.com`
   - `m.craft-football.com`

Vercel will show DNS instructions for each domain.

---

## Step 4: DNS (at your domain registrar)

Configure these records where you manage DNS for `craft-football.com`:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |
| CNAME | `m` | `cname.vercel-dns.com` |

Optional (for www redirect):

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `cname.vercel-dns.com` |

Propagation can take a few minutes to 48 hours.

---

## Step 5: Supabase Auth redirect URL

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → project `okkmnluglygrbtcawljr`
2. Go to **Authentication** → **URL Configuration**
3. Under **Redirect URLs**, add:
   ```
   https://m.craft-football.com/auth/callback
   ```
4. Save

---

## Step 6: Migrations and legacy admin

1. Run the new migrations in Supabase SQL Editor (in order):
   - `supabase/migrations/20250313100001_games_and_invites.sql`
   - `supabase/migrations/20250313100002_add_game_id_to_data.sql`
   - `supabase/migrations/20250313100003_open_signup_and_accept_invite.sql`

2. Sign up at m.craft-football.com/sign-in (open signup)

3. Add yourself as creator of the legacy game:
   ```bash
   CREATOR_EMAIL=you@example.com \
   NEXT_PUBLIC_SUPABASE_URL=https://okkmnluglygrbtcawljr.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   node scripts/seed-legacy-admin.mjs
   ```

4. Invite others: sign in → **Settings** → enter their email → create invite link → share the link

---

## Verify

- **craft-football.com** → marketing landing page
- **m.craft-football.com** → app (match history, sign-in)
- Sign in → see stats (after running seed-legacy-admin)
- Settings → invite someone → they open link, sign in, accept → they see stats
