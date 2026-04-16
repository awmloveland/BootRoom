# URL Slug Migration — Redirect Audit Design

**Date:** 2026-04-16

## Problem

The UUID→slug URL migration removed the old routes (`/results/[id]` and `/app/league/[id]/*`) that were previously shared publicly. Those URLs now 404. Existing bookmarks and shared links in WhatsApp groups, messages, etc. are broken.

Two dead-code components (`Header.tsx`, `PublicHeader.tsx`) still contain the old UUID-based URL patterns and were never updated during the migration — they were simply abandoned in place.

## Goal

1. Restore broken inbound links via server-side redirect pages at the old URL paths.
2. Remove the two dead-code components.

## Architecture

### `getGameById` utility

Add `getGameById(id: string): Promise<{ id: string; slug: string } | null>` to `lib/fetchers.ts`. Queries the `games` table by UUID, returns `{ id, slug }` or `null`. Used by all redirect pages.

### Redirect pages

All redirect pages are server components with `export const dynamic = 'force-dynamic'`. Each:
1. Calls `getGameById(id)`
2. If not found → `notFound()`
3. If found → `redirect('/{slug}/target', 'permanent')`  (HTTP 308)

**Old public routes:**

| File | Old URL | Redirects to |
|---|---|---|
| `app/results/[id]/page.tsx` | `/results/[id]` | `/{slug}/results` |
| `app/results/[id]/players/page.tsx` | `/results/[id]/players` | `/{slug}/players` |

**Old authenticated routes:**

| File | Old URL | Redirects to |
|---|---|---|
| `app/app/league/[id]/page.tsx` | `/app/league/[id]` | `/{slug}/results` |
| `app/app/league/[id]/players/page.tsx` | `/app/league/[id]/players` | `/{slug}/players` |
| `app/app/league/[id]/settings/page.tsx` | `/app/league/[id]/settings` | `/{slug}/settings` |

### Dead code removal

Delete `components/Header.tsx` and `components/PublicHeader.tsx`. Neither is imported anywhere in the codebase. Both contain stale UUID-based URLs that would mislead future contributors.

## What is not changing

All active slug-based navigation is already correct:
- `LeaguePageHeader`, `LeagueInfoBar`, `LeagueJoinArea` all use `leagueSlug`
- `buildShareText` and `buildResultShareText` both use `leagueSlug`
- `HonoursLoginPrompt`, `LineupLabLoginPrompt` redirects use `leagueSlug`
- `Navbar` reads slug from `useParams()`

No changes are needed to any of these.
