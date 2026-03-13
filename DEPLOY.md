# Deployment Checklist — Steps 3–6

After deploying to Vercel and setting env vars, complete these steps.

---

## Step 3: Vercel domains

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your project
2. Go to **Settings** → **Domains**
3. Add all three domains:
   - `craft-football.com`
   - `www.craft-football.com` (redirect to `craft-football.com`)
   - `m.craft-football.com`

Vercel will show DNS instructions for each domain.

---

## Step 4: DNS (at your domain registrar)

Configure these records where you manage DNS for `craft-football.com`:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `76.76.21.21` |
| CNAME | `m` | `cname.vercel-dns.com` |
| CNAME | `www` | `cname.vercel-dns.com` |

Propagation can take a few minutes to 48 hours.

---

## Step 5: Supabase Auth redirect URLs

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **Authentication** → **URL Configuration**
3. Set **Site URL** to `https://m.craft-football.com`
4. Under **Redirect URLs**, add:
   ```
   https://m.craft-football.com
   https://m.craft-football.com/auth/callback
   https://m.craft-football.com/reset-password
   ```
5. Save. See `SUPABASE_SETUP.md` for a full list including localhost.

---

## Step 6: Migrations and legacy admin

1. Run the new migrations in Supabase SQL Editor (in order):
   - `supabase/migrations/20250313100001_games_and_invites.sql`
   - `supabase/migrations/20250313100002_add_game_id_to_data.sql`
   - `supabase/migrations/20250313100003_open_signup_and_accept_invite.sql`
   - `supabase/migrations/20250313100004_claim_profile_display_name.sql`
   - `supabase/migrations/20250313100005_create_game_rpc.sql`
   - `supabase/migrations/20250313100006_game_data_policies.sql`
   - `supabase/migrations/20250313100007_player_stats_by_game.sql`
   - `supabase/migrations/20250313100008_fix_game_members_rls_recursion.sql` ← **fixes "infinite recursion" error**
   - `supabase/migrations/20250313100009_bootstrap_invite.sql` ← **open invite links (no email required)**

2. Sign up at m.craft-football.com/sign-in (open signup)

3. Add yourself as creator of the legacy game:
   ```bash
   CREATOR_EMAIL=you@example.com \
   NEXT_PUBLIC_SUPABASE_URL=https://okkmnluglygrbtcawljr.supabase.co \
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
   node scripts/seed-legacy-admin.mjs
   ```

4. Invite others: sign in → **Settings** → select league → create invite link → share the link (anyone who follows it can sign up and get access)

---

## Verify

- **craft-football.com** → marketing landing page
- **m.craft-football.com** → app (match history, sign-in)
- Sign in → see stats (after running seed-legacy-admin)
- Settings → invite someone → they open link, sign in, accept → they see stats
