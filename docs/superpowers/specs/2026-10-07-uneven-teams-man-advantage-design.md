# Uneven teams: man advantage in the team builder — design

## Context

The line-up builder now accepts an odd squad and builds uneven teams (for
example 6v5). `autoPick` in `lib/autoPick.ts` already copes with an odd
squad: it flips a coin for which side gets the extra player, then searches
for the split with the smallest gap between the two team ratings.

Team ratings from `ewptScore` are averages, so the extra body earns almost
nothing. The only credit is the depth bonus, which gives the larger team
+0.5 per player over five. The pick cancels that by making the shorter
side's average 0.5 higher. With the win model's logistic scale of 8, that
is a 52% win chance for the larger team. In real small-sided football an
extra player is worth far more, so the builder should weight the shorter
side to be noticeably better on paper.

## Goal

When teams are uneven, the builder should hand the shorter side the
stronger players, by a fixed and tunable margin, and the win-probability
bar should reflect the extra player.

## Approach: explicit man-advantage handicap

A single constant in `lib/utils.ts`:

```ts
export const MAN_ADVANTAGE_PER_PLAYER = 5   // rating points per extra player
export function manAdvantage(sizeA: number, sizeB: number): number {
  return (sizeA - sizeB) * MAN_ADVANTAGE_PER_PLAYER
}
```

`manAdvantage` is signed from Team A's point of view: positive when Team A
has more players, negative when Team B does, zero when even. It is added to
Team A's rating wherever the two teams are compared.

The implied win chance for the larger team at equal strength:

| Handicap | Larger team's win chance |
|---|---|
| 3 | 59% |
| 5 | 65% |
| 7 | 71% |

Start at 5 and adjust after a few uneven games. The existing depth bonus
still adds 0.5 to the larger side on top, which moves 65% to about 66%.
That is accepted rather than removing or reworking the depth bonus.

### Alternatives rejected

- **Raise the depth bonus.** Wrong lever: it was added for squad fatigue,
  it is capped, and raising it changes the displayed rating of every
  7-a-side line-up, historic ones included.
- **Score teams by total instead of average.** Over-weights the extra body
  (six players read as 20% stronger than five) and changes the 0 to 100
  rating scale everywhere.

## Changes

### `lib/utils.ts`

- Add `MAN_ADVANTAGE_PER_PLAYER` and `manAdvantage` as above.
- `winProbability(scoreA, scoreB, advantageA = 0)` adds `advantageA` to
  Team A's score before the sigmoid. The existing "both zero returns 0.5"
  guard is unchanged. Even teams pass 0, so no existing caller changes
  behaviour.
- `ewptScore` is untouched. Team ratings shown on cards, saved with the
  line-up and written to results stay exactly as they are.

### `lib/autoPick.ts`

- **Handicap-adjusted diff.** Each split's `diff` becomes
  `|scoreA + manAdvantage(a.length, b.length) - scoreB|`. For even teams
  this is the existing value. For uneven teams the search now aims for the
  shorter side to be ahead by the handicap, so the closest suggestions put
  the stronger players on the team that is a player short.
- **Search both sizes for an odd squad.** Instead of a coin flip deciding
  which side gets the extra player, generate candidate splits for both
  `ceil(n/2)` and `floor(n/2)` in Team A and score them together. The
  tightest handicap-adjusted splits win, whichever side they put the extra
  player on. This also stops a pinned goalkeeper or guest pair skewing the
  choice. The one random draw is kept as a tie-break: the order the two
  sizes are tried is shuffled, so identical-strength pools still share the
  extra player between sides over many games. RNG consumption per call is
  unchanged, so seeded tests keep their sequences.
- On the sampling path (more than 20 players) the sample count applies per
  size, so an odd large squad tries twice as many shuffles.
- `AutoPickSuggestion.diff` and `bestDiff` are the handicap-adjusted values.
  Only tests read them.

### `components/NextMatchCard.tsx`

- The win-probability bar under the builder teams passes
  `manAdvantage(localTeamA.length, localTeamB.length)` to `winProbability`,
  so the percentages and the copy from `winCopy` reflect the extra player.
  This applies after manual swaps too, since sizes do not change on a swap.
- The uneven note under the teams becomes:
  "Uneven teams · Team B is a player short, which the odds below allow for"
  (naming whichever side is shorter). It stays muted, as now.
- Saved ratings (`teamARating`, `teamBRating`) remain the raw `ewptScore`.

### `components/LineupLab.tsx`

- The landing-page demo passes the same `manAdvantage` to `winProbability`
  so its bar agrees with the real builder if the sides are uneven.

## Testing

- `lib/__tests__/utils.manAdvantage.test.ts`: `manAdvantage` sign and
  magnitude; `winProbability` with an advantage shifts towards the larger
  side; zero advantage matches the two-argument call.
- `lib/__tests__/autoPick.test.ts`:
  - Odd squad with mixed strengths: in the top suggestion the shorter team
    has the higher raw `ewptScore`.
  - `diff` equals the handicap-adjusted gap for an uneven split.
  - A pool where one side is forced ahead (single goalkeeper pinned to Team
    A, identical outfielders): the extra player goes to Team B on every
    run, regardless of RNG.
  - Existing distribution tests (identical players, odd n) still pass via
    the tie-break shuffle.
  - Existing even-squad tests unchanged.
- `components/__tests__/NextMatchCard.unevenTeams.test.tsx`: the note names
  the shorter side with the new wording.

## Out of scope

- Changing `ewptScore`, the depth bonus or the rating scale.
- Any admin control over the handicap value. It is a code constant.
- A feature flag. This changes how an existing admin-only tool picks, and
  adds no new data or views.
