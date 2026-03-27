# Next.js 15 + React 19 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade BootRoom from Next.js 14.2.x + React 18 to Next.js 15 + React 19 in two sequential PRs, with full local verification before each merge.

**Architecture:** Two independent PRs — PR 1 upgrades only Next.js (keeping React 18), PR 2 upgrades only React. This gives a clean rollback point after each step. The codebase is already forward-compatible: all dynamic route params use `Promise<{...}>` + `await`, and all `cookies()` calls already use `await`.

**Tech Stack:** Next.js 15, React 19, TypeScript 5, `@supabase/ssr`, Tailwind CSS 3, Vercel

---

## Pre-flight: what you need open

Before you start, have two things ready:
1. A terminal (command line window) open in the project folder
2. A browser pointing to `http://localhost:3000` once the dev server is running

Every step that says "run" means type the command into the terminal and press Enter.

---

## Phase 0 — Audit (no code changes)

### Task 1: Run the codemod in dry-run mode

This scans the codebase for Next.js 15 incompatibilities without changing anything.

**Files:** No files are modified in this task.

- [ ] **Step 1: Run the codemod audit**

```bash
npx @next/codemod@canary upgrade latest --dry-run
```

Expected output: A list of files the codemod would change (or "No files need updating" if all is fine). Do not press `y` to apply — this is dry-run only.

- [ ] **Step 2: Read the output**

If any files are listed, open each one and check whether the issue is `params` or `cookies()`. In this codebase both are already handled, so the list should be empty or minimal.

Note any files listed here: ______________________________

- [ ] **Step 3: Confirm you're ready to proceed**

If the codemod listed zero files needing changes, move on to Task 2. If it listed files, stop and check with your developer before continuing.

---

## Phase 1 — PR 1: Next.js 15 (React 18 stays)

### Task 2: Bump Next.js and related packages

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Next.js 15 and update eslint-config-next to match**

```bash
npm install next@^15 eslint-config-next@^15
```

Expected: npm prints a summary of updated packages. `next` should now show version `15.x.x`.

- [ ] **Step 2: Verify the installed version**

```bash
npx next --version
```

Expected output: `Next.js v15.x.x` (any 15.x is fine)

- [ ] **Step 3: Update @supabase/ssr to latest**

```bash
npm install @supabase/ssr@latest
```

Expected: npm prints a summary. The new version should be `0.6.x` or higher.

- [ ] **Step 4: Confirm package.json reflects the changes**

Open `package.json` and check:
- `"next"` should be `"^15.x.x"` (or similar)
- `"eslint-config-next"` should be `"15.x.x"`
- `"@supabase/ssr"` should be `"^0.6.x"` or higher

### Task 3: Verify the build passes

**Files:** No code changes — this is a verification-only task.

- [ ] **Step 1: Run the production build**

```bash
npm run build
```

Expected: Output ends with `✓ Compiled successfully` or similar green success message. This takes 1–2 minutes. If you see red error messages, stop and note the error text.

- [ ] **Step 2: Run the test suite**

```bash
npm test
```

Expected: All tests pass (`Tests: X passed, X total`). No red failures.

### Task 4: Manual smoke test

**Files:** No code changes — this is a manual walkthrough.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait until you see `▲ Next.js 15.x.x` and `✓ Ready in Xms` in the terminal output.

- [ ] **Step 2: Open the app**

Go to `http://localhost:3000` in your browser.

- [ ] **Step 3: Sign in**

Sign in with a valid account. Confirm the sign-in flow completes and you land on the home screen.

- [ ] **Step 4: Open a league**

Click into a league. Confirm:
- Match history tab loads and shows matches
- Players tab loads and shows the player table

- [ ] **Step 5: Open league settings**

Navigate to the settings page for a league you admin. Confirm:
- Details tab loads
- Members tab loads and shows members

- [ ] **Step 6: Toggle a feature flag**

In Settings → Features, toggle any feature on or off. Confirm the toggle saves without an error.

- [ ] **Step 7: Check the browser console**

In your browser, open DevTools (press F12 or right-click → Inspect). Click the Console tab. Confirm there are no red error messages or orange warning messages related to React or Next.js.

- [ ] **Step 8: Stop the dev server**

Press `Ctrl + C` in the terminal to stop the dev server.

### Task 5: Commit and open PR 1

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Stage the changed files**

```bash
git add package.json package-lock.json
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: upgrade Next.js to v15 and @supabase/ssr to latest"
```

- [ ] **Step 3: Push the branch**

```bash
git push -u origin awmloveland/upgrade-nextjs-15
```

- [ ] **Step 4: Open a pull request**

Go to GitHub and open a PR from `awmloveland/upgrade-nextjs-15` → `main`. Title: `feat: upgrade Next.js to v15`. Merge it once you're happy with the Vercel preview build (if available) or after the smoke test above.

---

## Phase 2 — PR 2: React 19

Start this phase only after PR 1 is merged and deployed without issues.

### Task 6: Create a new branch for React 19

**Files:** No file changes — branch setup only.

- [ ] **Step 1: Make sure you're on main and up to date**

```bash
git checkout main && git pull
```

Expected: Terminal confirms you're on `main` and it's up to date.

- [ ] **Step 2: Create the React 19 branch**

```bash
git checkout -b awmloveland/upgrade-react-19
```

Expected: Terminal says `Switched to a new branch 'awmloveland/upgrade-react-19'`

### Task 7: Bump React and its type definitions

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install React 19 and its type definitions**

```bash
npm install react@^19 react-dom@^19 @types/react@^19 @types/react-dom@^19
```

Expected: npm prints a summary. `react` and `react-dom` should now show version `19.x.x`.

- [ ] **Step 2: Verify the installed version**

```bash
node -e "const r = require('react'); console.log(r.version)"
```

Expected output: `19.x.x`

### Task 8: Verify the build passes

**Files:** No code changes — verification only.

- [ ] **Step 1: Run the TypeScript type check**

```bash
npx tsc --noEmit
```

Expected: No output (silence = success). If you see red error messages, note the file names and line numbers — the most likely issue is a component props type error related to `children`.

**If you get a TypeScript error about `children`:** Open the file it mentions. Find the component's props interface (the block that starts with `interface SomethingProps {`). Add `children?: React.ReactNode` to it if it's missing. Then re-run the command.

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

Expected: Build completes with no red errors.

- [ ] **Step 3: Run the test suite**

```bash
npm test
```

Expected: All tests pass.

### Task 9: Manual smoke test

**Files:** No code changes — manual walkthrough.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Wait until `✓ Ready` appears in the terminal.

- [ ] **Step 2: Sign in and walk through the app**

Repeat the same checklist from Task 4:
- Sign in
- Open a league (match history, players tabs)
- Open league settings (details, members, features)
- Toggle a feature flag
- Check browser console for any red errors

- [ ] **Step 3: Look specifically for React 19 warnings**

React 19 logs deprecation notices as console warnings. In the browser DevTools Console, look for any orange warnings mentioning `deprecated` or `React`. Note them if present — they are not blockers but should be tracked.

- [ ] **Step 4: Stop the dev server**

Press `Ctrl + C`.

### Task 10: Commit and open PR 2

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Stage the changed files**

```bash
git add package.json package-lock.json
```

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: upgrade React to v19"
```

- [ ] **Step 3: Push the branch**

```bash
git push -u origin awmloveland/upgrade-react-19
```

- [ ] **Step 4: Open a pull request**

Go to GitHub and open a PR from `awmloveland/upgrade-react-19` → `main`. Title: `feat: upgrade React to v19`. Merge it once the build is green.

---

## Rollback instructions (if something goes wrong after merging)

**If PR 1 causes production issues:**
1. Go to the PR on GitHub
2. Click "Revert" to create a revert PR
3. Merge the revert PR
4. Redeploy via the GitHub Actions "Deploy to Production" workflow

**If PR 2 causes production issues:**
1. Same steps — revert PR 2 only
2. The codebase returns to Next.js 15 + React 18, which is stable

---

## Summary of what changes

| Phase | Package | Before | After |
|---|---|---|---|
| PR 1 | `next` | `^14.2.35` | `^15.x` |
| PR 1 | `eslint-config-next` | `14.2.29` | `^15.x` |
| PR 1 | `@supabase/ssr` | `^0.9.0` | latest |
| PR 2 | `react` | `^18` | `^19` |
| PR 2 | `react-dom` | `^18` | `^19` |
| PR 2 | `@types/react` | `^18` | `^19` |
| PR 2 | `@types/react-dom` | `^18` | `^19` |

No application code changes are expected — the codebase is already forward-compatible with both upgrades.
