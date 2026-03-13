# Craft Football

Match history browser for [The Boot Room](https://craft-football.com) 5-a-side league. League members only — sign in via magic link or password.

## Tech stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Radix UI
- Supabase (Auth + PostgreSQL)

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Run the SQL migrations in `supabase/migrations/` (in order) via the Supabase SQL Editor.
3. Copy `.env.example` to `.env.local` and add your Supabase URL and anon key.

### 2. Data migration

```bash
# Set env vars in .env.local or shell
export NEXT_PUBLIC_SUPABASE_URL=...
export SUPABASE_SERVICE_ROLE_KEY=...

node scripts/migrate-data.mjs
```

### 3. Invite league members

Add allowed emails to `league_invites` (via Supabase dashboard or SQL):

```sql
INSERT INTO league_invites (email) VALUES ('alice@example.com');
```

Or use `scripts/seed-invites.example.mjs` as a template.

### 4. Auth redirect URLs

In Supabase Auth → URL Configuration, add:

- `http://localhost:3000/auth/callback` (dev)
- `https://m.craft-football.com/auth/callback` (prod)

### 5. Optional: Lock production with secret URL key

To lock the live site (m.craft-football.com) behind a secret key while testing:

1. Add to Vercel env (production only):
   - `APP_ACCESS_KEY` — your secret (e.g. `my-test-key-123`)
   - `NEXT_PUBLIC_ACCESS_KEY_MODE=true`
   - `SUPABASE_SERVICE_ROLE_KEY` — required for API routes in key mode

2. Share: `https://m.craft-football.com/?key=my-test-key-123`

3. The key is stored in a cookie for 7 days; users don’t need it on every visit.

4. **Localhost** — no key needed; the app works normally for local dev.

5. To switch back to auth-only, remove `APP_ACCESS_KEY` and `NEXT_PUBLIC_ACCESS_KEY_MODE`.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy

### Domains

- **craft-football.com** — marketing website (landing page)
- **m.craft-football.com** — web app (match history, players, sign-in)

Mobile users visiting craft-football.com are redirected to m.craft-football.com.

### Vercel

1. Push to GitHub and import in [Vercel](https://vercel.com).
2. Add env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Add custom domains: **Project Settings → Domains → Add** both `craft-football.com` and `m.craft-football.com`.
4. Configure DNS at your registrar:
   - Root: A record `@` → `76.76.21.21`
   - www: CNAME `www` → `cname.vercel-dns.com`
   - m: CNAME `m` → `cname.vercel-dns.com`

### Build locally

```bash
npm run build
npm run start
```
