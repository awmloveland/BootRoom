# Deployment Checklist — Steps 3–6

After deploying to Vercel and setting env vars, complete these steps.

---

## Step 3: Vercel domains

1. Open [Vercel Dashboard](https://vercel.com/dashboard) → your project
2. Go to **Settings** → **Domains**
3. Add:
   - `craft-football.com`
   - `www.craft-football.com` (redirect to `craft-football.com`)
   - `m.craft-football.com` (redirect to `craft-football.com` — handled by `vercel.json`)

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
3. Set **Site URL** to `https://craft-football.com`
4. Under **Redirect URLs**, add:
   ```
   https://craft-football.com
   https://craft-football.com/auth/callback
   https://craft-football.com/reset-password
   ```
5. Save. See `SUPABASE_SETUP.md` § Auth redirect URLs for a full list including localhost.

---

## Step 6: Migrations and legacy admin

1. Run all migrations in Supabase SQL Editor in filename order (there are currently 34):
   ```
   supabase/migrations/
   ```

2. Sign up at craft-football.com/sign-in (open signup)

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

- **craft-football.com** → marketing landing page + member app
- Sign in → see stats (after running seed-legacy-admin)
- Settings → invite someone → they open link, sign in, accept → they see stats
