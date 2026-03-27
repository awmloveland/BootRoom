# Next.js 15 + React 19 Upgrade Design

**Date:** 2026-03-26
**Status:** Approved

---

## Overview

Upgrade BootRoom from Next.js 14.2.x + React 18 to Next.js 15 + React 19 using a careful, methodical two-PR strategy. No staging environment is available, so local verification is the primary quality gate before each merge.

---

## Constraints

- No staging/preview environment — all verification is local
- Risk tolerance: careful and methodical
- Deploy target: Vercel (manual deploy via GitHub Actions)
- React 18 → 19 is decoupled from Next.js 14 → 15 to allow safe rollback at each step

---

## Phase 0 — Audit (before any code changes)

Run the official Next.js upgrade codemod in dry-run mode:

```
npx @next/codemod@canary upgrade latest --dry-run
```

This produces an inventory of every file that needs changes without modifying anything. Use the output as the checklist for PR 1. Expected findings:

- Dynamic route pages/layouts with `params` (e.g. `app/league/[id]/page.tsx`) — need `await params`
- Route handlers and server components calling `cookies()` or `headers()` — need `await`
- `eslint-config-next` version mismatch

---

## PR 1 — Next.js 15 (React 18 stays)

### Package changes

| Package | From | To |
|---|---|---|
| `next` | `^14.2.35` | `^15.x` |
| `eslint-config-next` | `14.2.29` | `15.x` (match next) |
| `@supabase/ssr` | `^0.9.0` | `^0.6+` (first version with full Next.js 15 cookie API support; use latest `^0.x` at time of upgrade) |

React, react-dom, and all Radix UI packages remain unchanged.

### Code changes

1. **Async `params`**: All dynamic route pages and layouts must `await params` before destructuring. Affects all files under `app/league/[id]/`, `app/[leagueId]/`, and similar patterns.
2. **Async `cookies()`/`headers()`**: Any server component or route handler calling `cookies()` from `next/headers` must `await` the call.
3. **`next.config.js`**: Review for deprecated options (currently empty — likely no changes needed).
4. **`tsconfig.json` target**: Consider bumping `es2015` → `es2017` to avoid unnecessary async/await transpilation (optional but recommended).

### Verification checklist (local, before merging)

- [ ] `npm run build` — zero errors
- [ ] `npm test` — all tests pass
- [ ] `npm run dev` — manual walkthrough:
  - Sign in with a valid account
  - View a league (match history, player stats tabs)
  - Open league settings, change a detail
  - Toggle a feature flag on and off
  - Sign out
- [ ] Browser console — no React warnings or hydration errors

---

## PR 2 — React 19 (after PR 1 is merged and stable)

### Package changes

| Package | From | To |
|---|---|---|
| `react` | `^18` | `^19` |
| `react-dom` | `^18` | `^19` |
| `@types/react` | `^18` | `^19` |
| `@types/react-dom` | `^18` | `^19` |

All other packages unchanged.

### Code changes

React 19 removes several deprecated APIs. Check for:

1. **`defaultProps` on function components** — React 19 drops support. This codebase uses arrow function components without `defaultProps` so likely not affected.
2. **`children` prop types** — `@types/react` 19 makes `children` explicit (not implicit on every component). Any component that renders `children` without declaring it in its props type will get a TypeScript error.
3. **`ReactDOM.render`** — removed in React 19. The App Router uses `createRoot` internally; no direct usage expected.

### Verification checklist (local, before merging)

- [ ] `npm run build` — zero TypeScript and build errors
- [ ] `npm test` — all tests pass
- [ ] `npm run dev` — same manual walkthrough as PR 1
- [ ] Browser console — no React warnings or hydration errors

---

## Rollback strategy

Each PR is independently reversible:
- If PR 1 causes issues after merge: revert the PR in GitHub, redeploy previous build
- If PR 2 causes issues: same — revert PR 2, PR 1 state remains intact

---

## Out of scope

- Adding new automated integration or e2e tests
- Enabling Turbopack
- Upgrading Tailwind CSS
- Any feature work
