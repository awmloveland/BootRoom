# Pending requests banner and badge fixes — design

**Date:** 2026-10-13

## Summary

Admins only learn about join requests from a 7px red dot on the settings
icon. The dot links to Settings → Details, where the requests aren't shown,
and the Members tab carries no count. Requests arrive roughly once a month,
so they sit unnoticed for days.

This change adds a banner above the league tabs whenever an admin has
something to review, and fixes the badge and links around it.

## Decisions (settled during brainstorming)

1. **Option A1 from the mockups**: a sky banner between the league info bar
   and the tab row, in the style of `ClaimOnboardingBanner`. Shown on every
   league tab, phone and desktop.
2. **Not dismissible.** It disappears once nothing is waiting.
3. **No feature flag.** Admin only, and shows data admins can already see.
4. **Join requests and player claims are both covered**, matching what the
   settings badge already counts.

## What counts as pending

- Each pending join request (`get_join_requests`).
- Each pending player claim (`get_player_claims`) from a user who does *not*
  also have a pending join request. A join request made with a player name
  creates both rows; today that person is counted twice. The settings page
  already shows such a claim inline on the join request, so it's one item.

`getPendingRequests(leagueId)` in `lib/fetchers.ts` returns
`PendingRequestSummary { joinNames: string[]; claimNames: string[] }`
(join requests oldest first, as the RPC orders them). It returns empty lists
for non-admins without calling either RPC. `getPendingBadgeCount` becomes the
sum of the two list lengths, so the tab title count gets the same fix.

## Banner

`components/PendingRequestsBanner.tsx`, rendered by `LeaguePageHeader`
between `LeagueInfoBar` and `LeagueTabNav` when the summary is non-empty.

Copy comes from `pendingRequestsBannerText(summary)` in `lib/utils.ts`:

| Waiting | Title | Detail |
|---|---|---|
| 1 join | 1 person wants to join | Callum Shaw |
| 2 joins | 2 people want to join | Callum Shaw, Priya Nair |
| 2 joins, 1 claim | 2 people want to join | Callum Shaw, Priya Nair · 1 player claim to review |
| 1 claim only | 1 player claim to review | Sofia Marsh |
| 5 joins | 5 people want to join | Callum Shaw, Priya Nair, Rav Singh and 2 more |

The Review button links to `/{slug}/settings?tab=members`.

## Small fixes

1. **Number badge**: the settings icon shows the count (capped at `9+`) in
   place of the dot. The count moves into the settings link's accessible name
   ("League settings, 2 pending requests"); the badge itself is
   `aria-hidden`.
2. **Direct link**: while anything is pending, the settings icon links to
   `?tab=members`.
3. **Members tab count**: Settings fetches pending requests and claims as
   soon as it knows the viewer is an admin, not only when Members opens, and
   shows the same count beside the Members tab label.
4. **Stale header after review**: approving or declining in Settings reloads
   the members data (as `PlayerClaimsTable` already does via `onChanged`) and
   calls `router.refresh()`, so going Back shows the updated banner and badge.

## Testing

- `pendingRequestsBannerText`: every row of the copy table, plus empty.
- `getPendingRequests` / `getPendingBadgeCount`: non-admins skip the RPCs;
  a claim attached to a pending join request isn't counted twice.
- `PendingRequestsBanner`: renders the copy and the members link.
- `LeagueJoinArea`: number badge, `9+` cap, members link when pending,
  plain settings link when not.
