# H2H "All Time" Tag — Design Spec

**Date:** 2026-04-17

## Goal

Add an "All Time" tag to the Head to Head card header in the stats sidebar (desktop) and mobile stats drawer, matching the exact size, styling, and positioning of the tag in the "Your Stats" card.

## Context

`StatsSidebar.tsx` contains all sidebar widgets. `TeamABWidget` (Head to Head) uses `WidgetShell`, which renders a plain title-only header. `YourStatsWidget` (Your Stats) renders its own custom header with a `flex items-center justify-between` layout and an "All Time" badge on the right.

The mobile stats drawer renders the same `StatsSidebar` children — no separate change needed there.

## Design

### Change 1 — Extend `WidgetShell`

Add an optional `headerRight?: React.ReactNode` prop to `WidgetShell`. When provided, the header becomes a flex row (`flex items-center justify-between`), with the title on the left and `headerRight` on the right. Existing title text classes are preserved. When `headerRight` is absent, behaviour is unchanged.

### Change 2 — Pass "All Time" badge from `TeamABWidget`

Pass the badge as `headerRight` when rendering `<WidgetShell title="Head to Head" ...>`:

```tsx
headerRight={
  <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-sky-400 bg-sky-400/[0.08] border border-sky-400/25 rounded px-[5px] py-px">
    All Time
  </span>
}
```

This is identical to the badge in `YourStatsWidget`.

## Scope

- One file: `components/StatsSidebar.tsx`
- No new components, no migrations, no API changes

## Success Criteria

- "All Time" tag appears in the Head to Head card header on desktop sidebar and mobile drawer
- Tag is visually identical (font, colour, border, padding) to the tag in "Your Stats"
- No other widgets are affected
