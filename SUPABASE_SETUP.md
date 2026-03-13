# Supabase configuration

## 1. Get your credentials

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **Settings** → **API**
3. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2. Update .env.local

Create or edit `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Replace with your actual values. Restart the dev server after changing.

## 3. Add redirect URLs (hosted Supabase)

In Supabase Dashboard → **Authentication** → **URL Configuration**:

1. Set **Site URL** to: `https://m.craft-football.com`
2. Under **Redirect URLs**, add (one per line):

```
https://m.craft-football.com
https://m.craft-football.com/**
https://m.craft-football.com/auth/callback
https://m.craft-football.com/reset-password
https://*-.vercel.app/**
http://localhost:3000
http://localhost:3000/**
http://127.0.0.1:3000
http://127.0.0.1:3000/**
```

3. Save

**For full Supabase + Vercel setup**, see `SUPABASE_VERCEL_SETUP.md`

## 4. Local Supabase (optional)

If using `supabase start` for local dev, `supabase/config.toml` already includes these URLs. Restart after changes:

```bash
supabase stop && supabase start
```

## 5. Disable email confirmation (optional)

If you want users to sign in immediately after sign-up (no confirmation email):

1. Supabase Dashboard → **Authentication** → **Providers** → **Email**
2. Turn off **Confirm email**
3. Save

## 6. Verify

- Local: `npm run dev` → visit http://localhost:3000/sign-in → try sign up
- Production: set the same env vars in Vercel, redeploy, then try at m.craft-football.com
