# Team Building Review — Implementation Tracker

_Umbrella design spec: [../2026-04-21-team-building-review-design.md](../2026-04-21-team-building-review-design.md)_

Thirteen active items (plus ten deferred) from the 2026-04-21 team-building review. Grouped into **three implementation phases**, each delivered as its own PR.

---

## Implementation phases

| Phase | Items | Theme | Phase prompt |
|---|---|---|---|
| **1** | 2.1 + 1.3 + 1.1 + 1.2 + 1.4 + 1.5 + 1.6 | Fairness & foundations — all behavioural fixes + GK consolidation | [phase-1-prompt.md](phase-1-prompt.md) |
| **2** | 2.3 + 2.4 + 2.2 + 2.5 | Readability refactor — no behavioural change | [phase-2-prompt.md](phase-2-prompt.md) |
| **3** | 2.6 + 2.7 | Testing & identity discipline | [phase-3-prompt.md](phase-3-prompt.md) |

Phases land in order. Each phase prompt checks its prerequisites (greps against the previous phase's artefacts) at the start and stops if the prior work isn't in place.

---

## Workflow to implement a phase

1. Skim the umbrella spec for context (optional).
2. Paste the phase prompt as the opening message in a fresh Claude Code session.
3. The session references each per-item spec as it proceeds through the phase's steps.
4. Review the resulting PR against the phase prompt's scope.
5. Update the Status column below when each item lands.

## Workflow to implement a single item in isolation

If you need to implement an item outside its phase (unusual — bundled PRs are more efficient), use the per-item prompt directly.

---

## Behavioural fixes (Phase 1)

| # | Title | Spec | Prompt | Status |
|---|---|---|---|---|
| 1.1 | Form denominator for short-history players | [spec](1.1-form-denominator-spec.md) | [prompt](1.1-form-denominator-prompt.md) | Ready |
| 1.2 | Drop ewptScore's form component; redistribute to avgWpr | [spec](1.2-ewpt-form-component-spec.md) | [prompt](1.2-ewpt-form-component-prompt.md) | Ready |
| 1.3 | Exclude GK mentality from variety bonus | [spec](1.3-variety-bonus-gk-exclusion-spec.md) | [prompt](1.3-variety-bonus-gk-exclusion-prompt.md) | Ready |
| 1.4 | Randomise odd-player allocation | [spec](1.4-odd-player-allocation-spec.md) | [prompt](1.4-odd-player-allocation-prompt.md) | Ready |
| 1.5 | Extend count-balance filter to guests | [spec](1.5-unknown-count-balance-spec.md) | [prompt](1.5-unknown-count-balance-prompt.md) | Ready |
| 1.6 | Reframe tolerance pool in win-probability terms | [spec](1.6-win-prob-tolerance-spec.md) | [prompt](1.6-win-prob-tolerance-prompt.md) | Ready |

## Code-quality improvements (Phases 1 – 3)

| # | Title | Phase | Spec | Prompt | Status |
|---|---|---|---|---|---|
| 2.1 | Collapse dual goalkeeper representation | 1 | [spec](2.1-goalkeeper-representation-spec.md) | [prompt](2.1-goalkeeper-representation-prompt.md) | Ready |
| 2.2 | Hoist magic numbers to named constants | 2 | [spec](2.2-named-constants-spec.md) | [prompt](2.2-named-constants-prompt.md) | Ready |
| 2.3 | Refactor pair-pinning with a placement helper | 2 | [spec](2.3-pair-pinning-helper-spec.md) | [prompt](2.3-pair-pinning-helper-prompt.md) | Ready |
| 2.4 | Replace O(n²) searchPool filter with a Set | 2 | [spec](2.4-set-based-exclusion-spec.md) | [prompt](2.4-set-based-exclusion-prompt.md) | Ready |
| 2.5 | Unify the count-balance filter guard | 2 | [spec](2.5-unified-filter-guard-spec.md) | [prompt](2.5-unified-filter-guard-prompt.md) | Ready |
| 2.6 | Optional seedable RNG for autoPick | 3 | [spec](2.6-seedable-rng-spec.md) | [prompt](2.6-seedable-rng-prompt.md) | Ready |
| 2.7 | Synthetic player ID at the resolution boundary | 3 | [spec](2.7-synthetic-player-id-spec.md) | [prompt](2.7-synthetic-player-id-prompt.md) | Ready |

## Deferred

Ten items identified during the review but parked rather than scheduled — see [3-deferred-notes.md](3-deferred-notes.md). Each has a revisit trigger and effort estimate.
