# Supabase + Vercel Setup Guide

Based on official docs and best practices (2024–2025).

---

## Option A: Supabase Vercel Integration (Recommended)

Auto-syncs env vars and can update auth redirect URLs for your Vercel domains.

### 1. Install the integration

**From Supabase:**
1. [Supabase Integrations → Vercel](https://supabase.com/dashboard/integrations/vercel/install)
2. Click **Connect** and authorize Vercel
3. Select your Vercel project and your Supabase project
4. Environment variables are synced automatically

**From Vercel:**
1. Vercel Dashboard → your project → **Settings** → **Integrations**
2. Browse Marketplace → search "Supabase" → Add
3. Connect and select your existing Supabase project

### 2. Synced variables

The integration typically sets:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

Auth redirect URLs may be updated to match your Vercel domain (main + preview deploys).

---

## Option B: Manual setup

If you prefer not to use the integration:

### 1. Vercel environment variables

Vercel Dashboard → Project → **Settings** → **Environment Variables**

Add (for Production, Preview, and Development):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://okkmnluglygrbtcawljr.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your anon or publishable key |

Get the key from [Supabase → Settings → API](https://supabase.com/dashboard/project/okkmnluglygrbtcawljr/settings/api)  
Use **anon public** (legacy) or **Publishable key** (new format).

### 2. Production site URL (optional)

For correct redirects across environments, add:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SITE_URL` | `https://m.craft-football.com` |

---

## Supabase redirect URLs

Supabase Dashboard → **Authentication** → **URL Configuration**

### Site URL
Set to: `https://m.craft-football.com`

### Redirect URLs

Add these (one per line):

**Production**
```
https://m.craft-football.com
https://m.craft-football.com/**
https://m.craft-football.com/auth/callback
https://m.craft-football.com/reset-password
```

**Vercel preview deployments**
```
https://*-.vercel.app/**
```

**Local development**
```
http://localhost:3000
http://localhost:3000/**
http://127.0.0.1:3000
http://127.0.0.1:3000/**
```

Save after adding.

---

## Publishable vs anon key

- **Publishable** (`sb_publishable_xxx`): new format, for client-side use.
- **Anon** (`eyJ...`): legacy JWT format.

Both work. If auth fails with the publishable key, switch to the legacy anon key from the API settings page.

---

## Common issues

### 1. "Invalid email or password" after sign-up
- Turn off **Confirm email**: Authentication → Providers → Email (or User Signups section)
- Or confirm the user manually: Authentication → Users → ⋮ → Confirm user

### 2. API routes 404 on Vercel
- Confirm Next.js API routes are in `app/api/`
- Redeploy after changes
- Check Functions tab in the deployment for errors

### 3. Redirect fails after auth
- Check redirect URLs in Supabase match exactly (including protocol)
- Use `https://m.craft-football.com/**` for subpaths
- Ensure Site URL is set correctly

### 4. Preview deployments
- Add `https://*-.vercel.app/**` to redirect URLs
- Or use the Supabase integration for auto-updates

### 5. Sign-in returns 401 in production
- **Env var naming**: The Supabase integration may set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` instead of `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The app supports both; ensure one is set in Vercel.
- **Wrong project**: Confirm `NEXT_PUBLIC_SUPABASE_URL` points to the same Supabase project where users were created.
- **Email confirmation**: If "Check your email" appears, turn off Confirm email in Supabase → Auth → Providers → Email, or confirm the user manually.
- **Vercel logs**: Check Deployment → Functions → sign-in for `[sign-in] Auth error:` to see the exact Supabase message.

---

## Quick checklist

- [ ] `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `_PUBLISHABLE_KEY`) in Vercel
- [ ] Supabase Site URL = `https://m.craft-football.com`
- [ ] Redirect URLs include production, localhost, and Vercel preview pattern
- [ ] Confirm email off (if desired) in User Signups
- [ ] Redeploy on Vercel after env changes
