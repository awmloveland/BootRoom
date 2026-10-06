# Result share: winners only, plus broken records

## Goal

Tighten the plain-text result share message:

1. Show only the winning team's line-up. The losing team adds length without adding anything to celebrate.
2. Call out Records tab records that change hands tonight, so the group chat hears about them.

No feature flag: this only changes share text.

## 1. Winning team only

- Win: the message lists the winners' block only (`🔵 Team A` or `🟣 Team B` plus names).
- Draw: there is no loser, so both teams stay.
- Everything else (headline, highlights, standings, in form, link) is unchanged.

## 2. Record lines

`findRecordBreaks(weeks, game)` in `lib/records.ts` returns ready-to-share lines.
`weeks` is the full league history including tonight; `game` describes tonight
(week, date, both teams, winner, goal difference). It runs `computeRecords` on
the games before tonight and on all games, and compares the two.

### Records checked

Most appearances, most wins, most points, longest winning streak, longest
unbeaten run, most consecutive appearances, most games as teammates, biggest
winning margin.

Left out: rate records (best win rate, best points per game, best duo), which
can change hands just by someone reaching the minimum games; longest wait for a
win (banter, not a celebration); next milestone (not a record); trophy cabinet
(the quarter celebration covers titles).

### When a line appears

Only holders who played tonight count (for most games as teammates, a pair who
were teammates tonight). No line when nobody held the record before tonight, so
a new league doesn't announce records every week.

- **Takes**: the record value went up and the holders are not just the same
  sole holder as before. Covers beating someone else's record and a joint
  holder pulling clear.
- **Equals**: the value is unchanged and a player from tonight has joined the
  holders.
- **Nothing**: a sole holder extends their own record, or nothing changed.

Biggest winning margin compares tonight's margin (wins only) with the previous
biggest: bigger takes it, the same equals it.

### Wording

```
👑 Sam takes the longest winning streak record (9)
👑 Sam equals the most wins record (41)
👑 Sam & Joe take the longest winning streak record (9)
👑 Sam & Joe take the most games as teammates record (60)
👑 Team A's 7-goal win is the biggest in league history
👑 Team A's 6-goal win equals the biggest winning margin
```

Record lines come first in the highlights, so they also show in the share step
preview after entering a result.

## 3. Wiring

`buildResultShareText` takes an optional `recordLines: string[]`. The two
callers (`MatchCard` share button, `ResultModal` share step) compute them with
`findRecordBreaks`. Keeping the call outside `utils.ts` avoids a circular import
(`records.ts` already imports from `utils.ts`).

"Before tonight" is `weeks` minus the game with tonight's date and week number,
which works whatever order `weeks` is in.

### Bug fix

The "💔 X's unbeaten run is over" line used `weeks.slice(0, -1)`, assuming
tonight is last. `MatchCard` passes weeks newest first, so re-sharing from the
card dropped the oldest game instead and the line never showed. It now uses the
same date and week filter.

## Testing

- `lib/__tests__/records.test.ts`: takes, equals, joint holder pulling clear,
  sole holder extending (no line), no prior holder (no line), record held by
  someone not playing tonight (no line), teammates pair, biggest margin taken
  and equalled.
- `lib/__tests__/utils.winCopy.test.ts`: losing team left out on a win, both
  teams kept on a draw, record lines placed in the highlights, unbeaten-run
  line with newest-first weeks.
