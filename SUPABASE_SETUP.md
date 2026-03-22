# Supabase setup

## 1. Get your credentials

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Local environment

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Restart the dev server after changing.

## 3. Vercel environment variables

**Option A — Supabase Vercel integration (recommended):**

Auto-syncs env vars and redirect URLs for all Vercel domains.

1. [Supabase Integrations → Vercel](https://supabase.com/dashboard/integrations/vercel/install) → **Connect** → authorise Vercel
2. Select your Vercel project and your Supabase project
3. Confirm — env vars are synced automatically to Vercel

Or from Vercel: Dashboard → Project → **Settings** → **Integrations** → search "Supabase" → Add.

The integration sets:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

**Option B — Manual:**

Vercel Dashboard → Project → **Settings** → **Environment Variables** → add for Production, Preview, and Development:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://okkmnluglygrbtcawljr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://craft-football.com` |

Trigger a redeploy after adding env vars.

## 4. Auth redirect URLs

Supabase Dashboard → **Authentication** → **URL Configuration**:

**Site URL:** `https://craft-football.com`

**Redirect URLs** (one per line):
```
https://craft-football.com
https://craft-football.com/**
https://craft-football.com/auth/callback
https://craft-football.com/reset-password
https://*-.vercel.app/**
http://localhost:3000
http://localhost:3000/**
http://127.0.0.1:3000
http://127.0.0.1:3000/**
```

Save after adding.

## 5. Disable email confirmation (recommended)

Required for new users to sign in immediately. With confirmation on, sign-up succeeds but sign-in returns 401 until they click the email link.

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Turn off **Confirm email**
3. Save

## 6. Local Supabase (optional)

If using `supabase start` for local dev, `supabase/config.toml` already includes the required URLs. Restart after changes:

```bash
supabase stop && supabase start
```

---

## Publishable vs anon key

- **Publishable** (`sb_publishable_xxx`): new format, for client-side use.
- **Anon** (`eyJ...`): legacy JWT format.

Both work. If auth fails with the publishable key, switch to the legacy anon key from the API settings page.

---

## Common issues

**"Invalid email or password" after sign-up**
- Turn off **Confirm email** (see step 5 above) or confirm the user manually: Authentication → Users → ⋮ → Confirm user

**Sign-in returns 401 in production**
- Check `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`) are set in Vercel
- Check Vercel → Deployment → Functions → sign-in for `[sign-in] Auth error:` to see the exact Supabase message

**Redirect fails after auth**
- Check redirect URLs in Supabase match exactly (including protocol)
- Use `https://craft-football.com/**` for subpaths

**Preview deployments not working**
- Add `https://*-.vercel.app/**` to redirect URLs, or use the Supabase integration for auto-updates

**API routes 404 on Vercel**
- Confirm routes are in `app/api/`, redeploy, and check the Functions tab in the deployment

---

## Quick checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`) set locally and in Vercel
- [ ] Supabase Site URL = `https://craft-football.com`
- [ ] Redirect URLs include production, localhost, and Vercel preview pattern
- [ ] Confirm email off in Authentication → Providers → Email
- [ ] Redeploy on Vercel after env changes
