# Supabase + Vercel integration – steps

The Supabase Vercel integration page should be open. Follow these steps:

---

## 1. Connect Vercel

1. Click **Connect** (or similar) to authorize Supabase with your Vercel account
2. Log in to Vercel if prompted
3. Approve the requested permissions

---

## 2. Select your project

1. Choose the **Vercel project** (e.g. BootRoom / craft-football)
2. Choose the **Supabase project** (okkmnluglygrbtcawljr)
3. Confirm the connection

---

## 3. Environment variables

After connecting, these are synced automatically:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`)

They appear in Vercel → Project → Settings → Environment Variables.

---

## 4. Deploy

1. Trigger a new deployment (e.g. push to git or **Redeploy** in Vercel)
2. Wait for the build to finish
3. Test auth at https://m.craft-football.com/sign-in

---

## 5. If the integration doesn’t list your project

Connect manually:

1. Vercel Dashboard → Your project → **Settings** → **Integrations**
2. Search for **Supabase** and add it
3. Or add env vars under **Settings** → **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://okkmnluglygrbtcawljr.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key from Supabase

---

## Quick commands

```bash
npm run supabase:vercel   # Open integration page
npm run supabase:setup    # Open API settings
```
