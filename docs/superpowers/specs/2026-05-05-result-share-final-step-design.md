# Result modal — final share step — design

**Date:** 2026-05-05
**Status:** Pending review
**Supersedes:** `components/ResultSuccessPanel.tsx` (deleted in this change)

## Problem

Today, recording a result is a 1-to-3 step modal flow ending on **Confirm → Save result**. After save, the modal closes and a separate `ResultSuccessPanel` modal is meant to open, showing the result headline, team grids, highlights, and a "Share result" button.

Two things are wrong with this:

1. **The success panel is not firing reliably.** The render guard in `NextMatchCard.tsx:1111` requires both `savedResult` and `scheduledWeek` to be truthy, but `scheduledWeek` is sourced from data that re-resolves after save (the just-played week is no longer "scheduled"), so the panel often never renders. A user can save a result and see no celebration or share affordance.
2. **The share moment is structurally separate from the recording flow.** Even when it does fire, it feels like a passive summary modal, not the natural last beat of "I just recorded a result."

We want the final beat of the result-recording flow to be a deliberate share moment, inside the same modal — focused, fun, and impossible to miss.

## Decision

Replace the post-save `ResultSuccessPanel` with a **new final step inside `ResultModal`**: `share`. The modal stays open after save and transitions into the share step on success. `ResultSuccessPanel.tsx` is deleted; its content moves into the modal.

The share step fires for both standard results and DNFs. The DNF branch in `NextMatchCard.tsx` no longer short-circuits closing the modal.

## Step flow

| Has guests/new players? | Steps |
|---|---|
| No | winner → **share** (2 steps) |
| Yes | winner → review → confirm → **share** (4 steps) |

The existing step-count rules are preserved; share is a new terminal step appended after whatever the last pre-save step was.

- For the no-review case, **Confirm Result** on Step 1 saves and advances to share. (Today this button just saves and closes.)
- For the review case, **Save result** on Confirm saves and advances to share. (Today this button saves and closes.)

**Step indicator visibility.** Today the indicator dots render only when `hasReviewStep` is true. That rule is preserved for the winner/review/confirm steps. **The indicator is hidden on the share step in all cases** — even when `hasReviewStep` is true. The share UI is celebratory and self-explanatory; the dots would add noise.

`totalSteps` becomes `hasReviewStep ? 4 : 2`. `currentStepNum` on the share step equals `totalSteps` (so 4 with review, 2 without) — only used by code that still references it, not rendered.

The share step has no Back button — once a result is saved it cannot be unsaved from this UI. Closing the modal (via the X, the Done button, or Escape/overlay click) dismisses the share step and triggers the same parent-side `onResultSaved` cleanup that fires today after `ResultSuccessPanel` dismissal.

## Share step layout

Container: same `Dialog.Content` as the rest of the modal — no second `Dialog.Root`.

```
┌────────────────────────────────────────┐
│  Week 14 — Team A Wins! (+2 goals)   X │
│  05 May 2026                           │
├────────────────────────────────────────┤
│                                        │
│  🔵 TEAM A                             │
│  Alex, Ben, Charlie, Dan, Ed           │
│                                        │
│  🟣 TEAM B                             │
│  Frank, George, Harry, Ian, Joe        │
│                                        │
│  HIGHLIGHTS                            │
│  🔥 Alex on a 4-game win streak        │
│  ⚡ Upset of the season                │
│                                        │
│  NOTES                                 │
│  Charlie scored a screamer.            │
│                                        │
├────────────────────────────────────────┤
│  [ ⤴ Share Result ]  [ Done ]          │
└────────────────────────────────────────┘
```

**Header (share step only — winner/review/confirm headers are unchanged from today)**
- Title: `Week {N} — {result phrase}`. Result phrase by case:
  - `teamA` win: `Team A Wins! (+{N} goals)` (singular: `(+1 goal)`)
  - `teamB` win: `Team B Wins! (+{N} goals)` (singular: `(+1 goal)`)
  - `draw`: `Draw`
  - DNF: `Did Not Finish`
- Subtitle: date in `DD MMM YYYY` format (e.g. `05 May 2026`). Reformat from `scheduledWeek.date` which is `YYYY-MM-DD`.
- X close button (top right) — **new on the share step only**, not added to the existing winner/review/confirm headers. Dismisses the modal and runs the standard cleanup.

**Body** (vertical stack, `gap: 8px` between cards)
- Team A card — slate-900 bg, `border-blue-900/50`, blue label, comma-joined player names.
- Team B card — slate-900 bg, `border-violet-900/50`, violet label, comma-joined player names.
- **Highlights card** — only when `highlightsText` is non-empty AND `winner` is not DNF. Renders one slate-300 line per `\n`-separated highlight, same as today's `ResultSuccessPanel`.
- **Notes card** — only when `notes.trim()` is non-empty (applies to both standard and DNF results). Single slate-300 paragraph rendering the notes string verbatim, italic.

If neither Highlights nor Notes apply, body is just the two team cards. No empty cards or "No highlights yet" placeholders.

**Footer** — 50/50 grid, `gap: 8px`, `padding: 4px 18px 18px`
- Left: **Share Result** — `bg-blue-600`, white text, white `Share2` icon. On click, runs the existing share handler (clipboard + Web Share API on mobile). When clipboard succeeds, button label flips to **Result copied!** for 2 seconds.
- Right: **Done** — outlined button (slate-600 border, slate-300 text). On click, runs `onClose`/cleanup.

## Save behaviour

The save call in `handleSave` is unchanged in shape. The only difference is the post-save action:

```diff
- onSaved({ dnf: false, winner, goalDifference, shareText, highlightsText })
+ setShareData({ ... })
+ setStep('share')
```

`setStep('share')` is called *only* after the RPC/POST succeeds — `error` set in the catch block keeps the user on the current step (winner or confirm) with the existing red error text. No save → no share step.

The `onSaved` callback to the parent (`NextMatchCard`) fires when the share step is dismissed, not when the save succeeds. This is a behaviour change in `onSaved` semantics: it now signals "user is done with the flow" rather than "result is saved." See parent-side changes below.

For DNFs, the same pattern applies — `setStep('share')` after the RPC succeeds, instead of `onSaved({ dnf: true })`.

## Code shape

**`components/ResultModal.tsx`**

- Add `'share'` to `ResultStep` union.
- Track share data in component state:
  ```ts
  type ShareData =
    | { dnf: false; winner: NonNullable<Winner>; goalDifference: number; shareText: string; highlightsText: string }
    | { dnf: true; shareText: string }
  const [shareData, setShareData] = useState<ShareData | null>(null)
  ```
- For the DNF save path, build share text with the existing `buildDnfShareText` helper and stash it into `shareData` before transitioning. (Today, `handleSave` does not call `buildDnfShareText`; the only existing caller is `DnfCard.handleShare`. Pull the same call shape.)
- For the standard save path, the existing `buildResultShareText` call already produces `shareText` and `highlightsText` — pass both through into `shareData`.
- `currentStepNum` widens to 4 when `step === 'share'`. `totalSteps` becomes `hasReviewStep ? 4 : 2`.
- The header `Dialog.Title` is computed from step + winner/DNF state. On the share step, the header reads `Week {N} — {result phrase}` and the description reads the formatted date.
- New helper `formatShareDate(iso: string): string` in the file (or in `lib/utils.ts`) — accepts `YYYY-MM-DD`, returns `DD MMM YYYY`. Three-letter month abbreviation, English locale.
- New helper `buildResultHeadline(winner, goalDifference, isDnf): string` — pure function returning the result phrase used in the header title.
- New step-render block `step === 'share' && shareData && <ShareStep ... />` (or inline JSX following the existing pattern).
- The share-step button copies use the same handler logic as `ResultSuccessPanel.handleShare` today — pull that handler in directly.

**`components/ResultSuccessPanel.tsx`**

Deleted. No callers remain after this change.

**`components/NextMatchCard.tsx`**

- Remove the `<ResultSuccessPanel ... />` block at lines 1111–1128.
- Remove the `import { ResultSuccessPanel }` line.
- Remove `savedResult` state and the `setSavedResult(result)` call in the `onSaved` handler.
- Simplify the `onSaved` callback to a single cleanup path (since the parent no longer distinguishes DNF vs non-DNF — the modal owns the share moment for both):
  ```tsx
  onSaved={() => {
    setShowResultModal(false)
    setGuestEntries([])
    setNewPlayerEntries([])
    setScheduledWeek(null)
    setCardState('idle')
    onResultSaved()
  }}
  ```
- The `onSaved` prop signature in `ResultModal` simplifies to `() => void` — no payload, since the modal no longer needs to hand a payload back to the parent for the success panel.

**`ResultSavedPayload` type**

Currently exported from `ResultModal.tsx` and consumed in `NextMatchCard.tsx`. Removed in this change — no external consumer remains.

## Existing tests

`lib/__tests__/utils.winCopy.test.ts` covers `buildResultShareText` and `buildDnfShareText` and is unaffected — share text construction does not change.

No existing tests cover `ResultSuccessPanel`'s render path (it's a presentational component). No existing tests cover `ResultModal`'s step flow at the integration level.

## New tests

A small unit test for `buildResultHeadline` — added to `lib/__tests__/utils.test.ts` (or a new `result-headline` file co-located with the helper):

1. `winner='teamA', goalDifference=2, isDnf=false` → `'Team A Wins! (+2 goals)'`
2. `winner='teamA', goalDifference=1, isDnf=false` → `'Team A Wins! (+1 goal)'` (singular)
3. `winner='teamB', goalDifference=3, isDnf=false` → `'Team B Wins! (+3 goals)'`
4. `winner='draw', goalDifference=0, isDnf=false` → `'Draw'`
5. `winner=null, goalDifference=0, isDnf=true` → `'Did Not Finish'`

A small unit test for `formatShareDate`:

1. `'2026-05-05'` → `'05 May 2026'`
2. `'2026-01-09'` → `'09 Jan 2026'`
3. `'2026-12-31'` → `'31 Dec 2026'`

No new component tests — the share step is presentational, the share button reuses an already-tested handler shape (`PlayedCard.handleShare` / `DnfCard.handleShare`), and the modal step transition is a single `setStep('share')` call inside an existing tested code path.

## Visibility

- Share step fires for all writers — admins, members in public mode, anyone going through the result-recording flow.
- Same share text contents and same surface area as today's clipboard/Web Share output. No new data is exposed.

## What does not change

- The `winner` / `review` / `confirm` step UIs and their validation.
- `record_result` / `promote_roster` RPC calls and their parameters.
- Public-mode `POST /api/public/league/[id]/result` payload.
- `buildResultShareText` / `buildDnfShareText` text formatting.
- The most-recent-played-card and most-recent-DNF-card share buttons in `MatchCard.tsx` — those continue to be the way to re-share an already-saved result later.
- League list, settings, and feature-flag wiring — share step is unconditional, not behind a flag.
