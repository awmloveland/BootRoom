# Share Preview Images (Result, Quarter, League, Invite, Default) — Design

**Date:** 2026-10-06
**Status:** Approved

## Summary

The line-ups share already unfurls into a picture of both teams
(`2026-10-05-lineup-share-preview-image-design.md`). This extends the same
idea to every other link the app shares, so that each one unfurls with its
own image in WhatsApp, iMessage, Slack and Discord:

| Share point | Where the button is | Image |
|---|---|---|
| Match result | Result modal share step; Share on the latest played week (Results) | Headline + highlights |
| Quarter wrap | "Share the glory" on the celebration modal, the Results champion cards and Seasons | Champion hero |
| League link | Share in the league header (members) | League name + next game |
| Invite link | Settings → copy member / admin invite link | "You're invited to join" |
| Anything else | Any craft-football.com page with nothing more specific | Site default (today's generic card) |

Share message text is unchanged everywhere; only the link at the end
changes. Images are rendered with `ImageResponse` from `next/og`, reusing the
fonts, palette and wordmark from the line-ups image. No new dependencies.

## Decisions

| Question | Decision |
|---|---|
| Scope | Result, quarter, league, invite, site default. Not DNF (rarely shared). Not Admin → Money owed (plain text, no link, private). |
| Privacy | Every image that shows league data is behind a signed link. You can only sign what you can already see. |
| Feature flag | None. Link previews are additive and only show what the sharer can see. (The flag rule in `CLAUDE.md` was rewritten alongside this spec: flags are now opt-in.) |
| Result layout | C: headline + highlights panel |
| Quarter layout | A: champion hero |
| League layout | C: league name + next game |
| Invite layout | Single proposed design, accepted |
| Emoji | Not used in images. Satori can only draw emoji by fetching them from a CDN at render time; highlights use small inline SVG icons instead. |

The `lineup_share_image` flag stays as it is; this work does not touch it.

## 1. Signed links

### Module

`lib/lineupShare.ts` is renamed `lib/shareLinks.ts` and generalised.
`lib/lineupShareServer.ts` becomes `lib/shareLinksServer.ts`. Same HMAC-SHA256,
same `SHARE_SIGNING_SECRET`, same 12-byte signature, same
`crypto.timingSafeEqual` verification. If the secret is missing, nothing
signs and every image route renders the generic card.

Each kind signs a JSON payload that starts with its own version tag, so a
token for one kind can never verify as another:

| Kind | Signed payload | Query param |
|---|---|---|
| Line-ups | `["lineup:v1", weekId, teamA, teamB]` (unchanged, byte-compatible) | `lineup` |
| Result | `["result:v1", weekId, winner, goalDifference, teamA, teamB]` | `result` |
| Quarter | `["quarter:v1", gameId, year, q]` | `quarter` |
| League | `["league:v1", gameId]` | `league` |

Token shape: `<id as base64url, 22 chars>[.<extra>].<signature, 16 chars>`.
Line-ups and result encode the week ID. League encodes the game ID. Quarter
encodes the game ID plus `<year><q>` (e.g. `20263`) as the middle segment.
Parsing is strict: anything malformed returns null without throwing.

**Behaviour that follows from what is signed:**

- **Result:** editing the result (winner, margin, either team) changes the
  link. An old link then renders the generic card, never a stale result.
  Re-sharing after an edit gives Slack and Discord a fresh URL.
- **Quarter and league:** the signature never changes for a given league
  (and quarter), so the image is drawn from live data whenever a chat app
  fetches it. A league token is effectively permanent; rotating
  `SHARE_SIGNING_SECRET` is the only way to revoke it (and revokes every
  shared preview).

### URLs

| Kind | Shared URL |
|---|---|
| Result | `https://craft-football.com/{slug}?result=<token>` |
| Quarter | `https://craft-football.com/{slug}/honours?quarter=<token>#q-{year}-{q}` (keeps today's deep link) |
| League | `https://craft-football.com/{slug}/{current tab}?league=<token>` (keeps today's "copy the page I'm on") |
| Invite | `https://craft-football.com/invite?token=…` (unchanged) |

The `/{slug}` root redirect already preserves the query string (done for
line-ups), so `?result=` survives it.

### Who can sign

Same principle as line-ups: sharing never exposes more than the sharer can
already see.

- **Result:** the week belongs to this league, has status `played` and a
  winner, and the viewer is an admin or has `match_history` on for their
  tier. Guests on public leagues can already share the latest result, so
  they get the image too.
- **Quarter:** the quarter is complete and has a champion, and the viewer can
  see a champion card for it: a signed-in member or admin (Seasons), or the
  public with both `match_history` and `quarter_celebration` on (Results
  champion cards).
- **League:** the viewer is a member or admin of the league (the only people
  who see the header Share button).
- **Invite:** no new signing. The invite token is already an unguessable
  secret created by an admin.

## 2. Getting the URL ready before the tap

iOS Safari rejects `navigator.share` and `clipboard.writeText` if the page
awaits a network request after the tap, so every signed URL is ready in
advance. Two routes:

**Signed on the server while rendering (no extra request).** The Results
page, the Seasons page and the tabs layout sign links while rendering. The
server already has the data, so it passes each URL down as a prop:

- Results page: the latest played week's result URL (to `MatchCard` via
  `WeekList` / `PublicMatchList`) and each completed quarter's URL (to the
  `QuarterCelebration` champion cards).
- Seasons page: each completed quarter's URL (to `HonoursSection`).
- Tabs layout: the league URL token (to `LeagueJoinArea`), for members and
  admins only. At copy time `LeagueJoinArea` copies
  `leagueShareHref(location.href, token)`. That keeps the current path and
  any other query params, strips other share tokens (`lineup`, `result`,
  `quarter`, `open_join`) and the hash, then sets `league=<token>`, so the link
  still points at the tab being viewed.

After an edit, `router.refresh()` re-renders the page, which re-signs.

**Fetched by the client, for things created in the browser.** Only the result
modal calls the endpoint below. It has just saved a result the server never rendered, so it asks for the
link:

- New endpoint `POST /api/league/[id]/share-link`, body
  `{ kind: 'result', weekId }` or `{ kind: 'quarter', year, q }`, returns
  `{ url }` or `{ url: null }`. Applies the "who can sign" rules above. Bad
  input (non-UUID week, non-integer year, q outside 1 to 4, unknown kind) is a
  400 before any lookup.
- `ResultModal` calls it in the background as soon as the save succeeds,
  while the share or celebrate step appears. If the save clinched a quarter,
  it requests the quarter link as well.

**Fallback.** If no URL is ready (still loading, request failed, secret
missing, not allowed), every share uses today's link exactly. Sharing never
breaks.

**Text builders.** Share text builders are unchanged. A
`withShareLink(text, url)` helper in `lib/utils.ts` swaps the final `🔗` line
for the signed URL at tap time, falling back to the text as built.
`LeagueJoinArea` copies `leagueShareHref(location.href, token)` (see above)
when it has a token, otherwise `window.location.href` as today.

## 3. Page metadata

### League pages

`leaguePageMetadata(slug, page, lineupToken?)` becomes
`leaguePageMetadata(slug, page, searchParams?)`. Every tab's
`generateMetadata` passes its `searchParams` through. It checks, in order:

1. `lineup` (Overview, Results only; unchanged behaviour)
2. `result` (Overview, Results only)
3. `quarter` (Seasons only)
4. `league` (any tab)

The first valid token wins and adds `openGraph` (title, description,
`images: [{ url: /api/og/{kind}?t=<token>, width: 1200, height: 630 }]`,
`siteName`, `type`) and `twitter.card: 'summary_large_image'`. The token's
league must match the page's slug. With no token or an invalid one, the
metadata is exactly as today (and inherits the site default image). The tab
title logic is untouched, and the page body ignores the param.

| Kind | `og:title` | `og:description` |
|---|---|---|
| Result | `Week {n} result · {league}` | `Team A won by 3 · Tue 07 Oct` (or `Draw · Tue 07 Oct`) |
| Quarter | `Q{q} {year} champion · {league}` | `{champion} wins the {season} quarter with {pts} pts` |
| League | `{league}` | `Next game Tue 14 Oct · 19:00 · {venue}` (or `{n} games played` when there is no next game) |

Like line-ups, none of these set `og:url`.

### Invite page

`app/invite/page.tsx` is a client component, so it is split: the existing
component moves to `components/InviteAccept.tsx` (unchanged), and
`app/invite/page.tsx` becomes a small server component that renders it and
exports `generateMetadata`. The metadata calls the `preview_invite` RPC with
the `token` search param:

- Valid: title stays `League invite`; `og:title` `Join {league} on Craft Football`,
  `og:description` the tagline, image `/api/og/invite?token=<token>`.
- Invalid, expired or missing: today's metadata (site default image).

### Site default

The root layout's `metadata.openGraph` gains
`images: [{ url: '/api/og/default', width: 1200, height: 630 }]`, plus
`twitter: { card: 'summary_large_image' }`. Child metadata that sets its own
`openGraph` replaces the whole object (Next merges metadata shallowly), so
the token cases above must always include `images`; pages that only set a
title inherit the default.

## 4. Image routes

One route per kind, all Node runtime, all `GET`:

| Route | Param | Loader |
|---|---|---|
| `app/api/og/result/route.tsx` | `t` | `loadSharedResult(token)` |
| `app/api/og/quarter/route.tsx` | `t` | `loadSharedQuarter(token)` |
| `app/api/og/league/route.tsx` | `t` | `loadSharedLeague(token)` |
| `app/api/og/invite/route.tsx` | `token` | `loadInvitePreview(token)` |
| `app/api/og/default/route.tsx` | none | none |

Each loader lives in `lib/shareLinksServer.ts`, uses the service-role client
(the token is the authorisation), returns null on any failure and never
throws. Every outcome is a 200 PNG: a null loader result renders the generic
card. As with line-ups, a font read failure surfaces as an uncached 500 and is
retried on the next request.

**Cache headers:**

| Image | `Cache-Control` | Why |
|---|---|---|
| Result | `public, max-age=300, s-maxage=3600` | Token changes when the result does |
| Quarter | `public, max-age=300, s-maxage=3600` | A completed quarter rarely changes |
| League | `public, max-age=300, s-maxage=900` | Next game moves weekly |
| Invite | `public, max-age=300, s-maxage=900` | A revoked invite falls back within 15 minutes |
| Default | `public, max-age=3600, s-maxage=86400` | Static |
| Generic fallback (any route) | `public, max-age=60, s-maxage=60` | May stand in for a transient DB error |

## 5. The images

All 1200 × 630 on `#060b14`, using the line-ups image's fonts (Space Grotesk,
Inter, IBM Plex Mono, all Bold, from `assets/fonts/`), the top meta line style
(Plex Mono 700, ~19px, uppercase, `.15em`, `#8ba4c4`, 30px / 60px padding) and
the centred wordmark 24px from the bottom. Half-size HTML mockups were reviewed
in the brainstorm session (kept locally in the gitignored `.superpowers/brainstorm/`);
this section is the source of truth.

### Overflow

Long names never clip. Names clamp with an ellipsis using Satori's `lineClamp`:
winners get 3 lines, and draw rows and highlights get 2. Hero names (quarter
champion, league name, invite league name) use fit-to-width sizing first, then
an ellipsis at the floor size. Content is vertically centred between the meta
line and the wordmark.

### Shared pieces (`components/og/`)

`LineupShareImage.tsx` is split so the new images share its parts:

- `components/og/frame.tsx`: `OG_SIZE`, the root style, `Wordmark`,
  `MetaLine`, `GenericShareImage` (moved here), and the inline SVG icons used
  by highlights and the quarter trophy (paths copied from lucide: `Flame`,
  `HeartCrack`, `Zap`, `Award`, `TrendingUp`, `Crown`, `Trophy`).
- `LineupShareImage.tsx`, `ResultShareImage.tsx`, `QuarterShareImage.tsx`,
  `LeagueShareImage.tsx`, `InviteShareImage.tsx`: one layout each.

### Result (layout C)

- **Background:** radial glow from the top left, `rgba(56,189,248,.18)` for
  a Team A win, `rgba(167,139,250,.18)` for Team B, none for a draw. 8px bar
  on the left edge in the winner's accent (`#38bdf8` / `#a78bfa`; `#223a5c`
  for a draw).
- **Meta line:** `{League} · Week {n}` left, `{formatFixtureDate(date)}` right.
- **Left column (~55%):**
  - `Full time` label (Plex Mono, winner's light accent).
  - Headline, Space Grotesk 700 ~80px, line-height 1.02, two lines:
    `Team A` / `win by 3` (second line in `#7dd3fc` or `#c4b5fd`;
    `win by 1` for a one-goal margin). A draw is `Honours` / `even` in
    `#8ba4c4`.
  - Winners' names below in Inter 700 ~24px, `#dff1ff` (Team A) or `#efeaff`
    (Team B), comma-separated, wrapping to at most three lines, then
    clamped with an ellipsis. For a draw, both teams, each prefixed with its label.
- **Right column (~45%), left hairline `#17263c`:**
  - `Highlights` label.
  - Up to three lines, Inter 700 ~24px, each with a 24px icon. The first line
    is in `#bef264`, the rest `#f4f9ff`.
  - Fallback when there are no highlights: label `Beat` and the losing
    team's names in `#8ba4c4`. For a draw with no highlights, the right column
    is omitted and the left column takes the full width.

**Highlights, in priority order (first three that apply):**

| Highlight | Rule (unchanged from share text) | Icon | Image copy |
|---|---|---|---|
| Win streak | winner on a 3+ game winning streak | Flame | `Jordan · 4-game win streak` |
| Unbeaten run ended | loser's 5+ unbeaten run ended | HeartCrack | `Kit's 7-game unbeaten run is over` |
| Upset | winner had the lower rating | Zap | `Upset · Team B stronger on paper` |
| Milestone | a player's milestone game | Award | `Rory's 50th game` |
| In form | best recent PPG among tonight's players (≥1.5, ≥5 games) | TrendingUp | `In form · Sam · 2.4 PPG` |
| Quarter leader | top of that quarter's table after this game | Crown | `Q4 leader · Jordan · 15 pts` |

**Computed as of that game.** A link opened weeks later must still show that
night's streaks, so the image never uses current totals:

- The highlight logic in `buildResultShareText` is extracted into a pure
  `computeResultHighlights(...)` in `lib/utils.ts` that takes the same inputs
  `buildResultShareText` takes today (both teams, winner, ratings, `players`
  as they stood before the game, and `weeks` ending with the game) and returns
  typed items (`{ kind, player?, count?, ... }`).
- `buildResultShareText` formats those items into exactly today's text
  (existing tests pass unchanged).
- The image route passes as-of inputs: `weeks` sliced to end at the shared
  week (sorted by date, then week number), and `players` derived from the
  weeks *before* it by a new pure `playerStatsAsOf(weeks)` (played count and
  last-five recent form per name). The route maps the items to icons and the
  shorter image copy below.
- Known simplification: as-of played counts come from recorded weeks only, so
  a milestone could differ from the share text if a player has games that
  were never recorded as weeks. Acceptable for the image.

### Quarter (layout A)

- **Background:** the champion sheen from `QuarterCelebration`: radial lime
  `rgba(190,242,100,.16)` at the top left and sky `rgba(56,189,248,.14)` at
  the top right.
- **Meta line:** league name left; `{from} – {to} · {n} games` right, with the year
  dropped from each date, matching the share text (e.g.
  `07 Jul – 29 Sep · 12 games`).
- **Centred stack:**
  - Trophy icon, 52px, `#bef264`.
  - `Q{q} {year} · {Season} champion`, Plex Mono 700 ~20px, `.2em`, `#bef264`.
  - Champion name, Space Grotesk 700, 104px, shrinking to fit 1000px wide
    (floor 64px, then ellipsis).
  - Record, Plex Mono ~20px, `#8ba4c4`: `24 pts · 8 wins · 0 draws` (same
    wording as `QuarterCelebration`, draws omitted when zero).
  - Podium line, Inter 700 ~22px, `#8ba4c4` with the position in `#f4f9ff`:
    `2 Sam Okafor · 21    3 Kit Marsh · 19`. Omitted entries when the table
    is shorter.
- **Data:** `computeAllQuarters(weeks, now)` for the token's league, picking
  the matching `year` and `q`. If that quarter is not complete or has no
  champion, the generic card.

### League (layout C)

- **Background:** the app's dot field (`#223a5c` dots on a 24px grid, fading
  out down the image).
- **Meta line:** league name left, `{n} games played` right (played weeks
  only).
- **League name:** Space Grotesk 700, ~92px, `-.035em`, shrinking to fit
  (floor 56px).
- **Next game panel:** a `#0a1421` box with a `#1b2c46` border and 16px
  radius; `Next game` label in `#38bdf8`, then `Tue 14 Oct · 19:00`
  (Space Grotesk 700 ~34px) and the venue (Inter 700 ~24px, `#8ba4c4`).
  - The next game is chosen the same way as the Overview next game card: the
    league's `scheduled` week if there is one, otherwise the next date from
    the league's game day. Kick-off and venue come from the league settings
    and are omitted when not set.
  - With neither a scheduled week nor a game day, the panel is replaced by a
    stat line: `{m} players` (players with at least one game). The games count is
    left out because the meta line already shows games played.

### Invite

- **Background:** dot field plus a sky glow `rgba(56,189,248,.16)` centred
  behind the name.
- **Centred stack:** `You're invited to join` (Plex Mono 700 ~20px, `.2em`,
  `#7dd3fc`); league name (Space Grotesk 700 ~104px, shrinking to fit);
  tagline `Results, stats and fair teams for your weekly game.` (Inter 700
  ~28px, `#8ba4c4`); a `Join the league` button shape (`#38bdf8` fill, text
  `#05101d`, 4px radius).
- Same image for member and admin invites; the role and target email are
  never shown.
- Invalid, expired or revoked invite: the generic card.

### Default

`GenericShareImage`, unchanged.

## 6. Testing

### Unit (Jest)

- `shareLinks`: for each kind, sign/parse/verify round-trips; tampered
  signature, tampered ID and tampered extra segment fail; a token of one kind
  never verifies as another kind; malformed tokens return null without
  throwing; a missing secret fails closed. Existing line-up token tests pass
  unchanged (and an existing line-up token still verifies).
- Result token: changing the winner, the goal difference, or any player
  (add, remove, swap, reorder) fails verification.
- `computeResultHighlights`: priority order and the three-item cap; draw
  handling. `buildResultShareText` output is byte-identical to today for the
  existing fixtures.
- `playerStatsAsOf` and the result loader: a week added after the shared
  week does not change its streaks, milestones or in-form line.
- `buildResultShareText` / `buildQuarterShareText`: use `shareUrl` when given,
  fall back otherwise.
- `POST /api/league/[id]/share-link`: signs result and quarter when allowed;
  `{ url: null }` when the viewer cannot see the week or quarter, the week is
  not `played` or belongs to another league, the quarter is incomplete, or the
  secret is missing; 400 on bad input.
- `leaguePageMetadata`: each kind adds the right title, description, image
  and twitter card on the right tabs; a token for another league, a token on
  the wrong tab, or an invalid token gives today's output; precedence when
  several params are present.
- Invite metadata: valid invite adds the image; invalid falls back.
- Image routes: each renders a PNG for a valid token and the generic card
  (with the short cache header) for an invalid one.
- `LeagueJoinArea`: copies the tokenised URL when it has a token, the plain
  URL otherwise.

### Manual check before merging

Share one of each (result, quarter, league, invite) into WhatsApp (iOS and
web), iMessage, Slack and Discord. Record whether the large preview appears
and the text arrives intact. Edit a result and re-share: Slack should show the
new result, and the old link should show the generic card within an hour.
Paste a plain `craft-football.com` link to confirm the default image.

## Out of scope

- DNF share images.
- Admin → Money owed (no link, private data).
- Attaching images as files via the Web Share API.
- Changing the line-ups image, its endpoint or its feature flag.
- Per-tab league images (the league card is the same on every tab).
