<!--
PR title format: `type: message`  (same as commits)
Types: feat, fix, refactor, perf, test, docs, chore, ci, build
Example: `feat: add monthly budget carry-forward`

Keep PRs small: one concern each.
Delete any section or checklist group that doesn't apply, and tick only what you actually did.
Comments like this one don't show up in the PR description.
-->

## Summary

<!-- What does this PR do, and why? 1-3 sentences. Lead with the "why". -->

## Context

- Milestone: <!-- M0-M8 -->
- Feature spec: <!-- e.g. docs/features/F03-transactions.md. "None" is fine. -->
- Related decision: <!-- e.g. docs/02-decisions.md, section or ID. "None" is fine. -->

## What changed

<!-- Bullet the meaningful changes. Call out anything non-obvious: new tables, new routes, new env vars, changed query shapes. -->

-

## Screenshots / recordings

<!-- Required for any UI change. Include mobile width and dark theme where relevant. Delete for non-UI PRs. -->

| Before | After |
| ------ | ----- |
|        |       |

## How I tested

<!-- Steps to reproduce the check, so future-you can repeat it. Name the user state used (Free / Premium, empty / seeded data, offline). -->

1.
2.

**Expected result:**

## Self-review checklist

<!-- No human reviewer here, so this list is the review. SonarQube Cloud adds a code-quality check when it reports on the PR. -->

### Always

- [ ] I read my own diff; no debug code, stray `console.log`, commented-out code or unused files
- [ ] `pnpm lint`, `format:check`, `typecheck`, `test:run`, `build` and `docs:check` pass locally, and CI is green
- [ ] Playwright tests pass when the PR touches a flow they cover (they run locally; CI does not run them)
- [ ] If SonarQube Cloud reports on this PR, its quality gate passes; any new issues are fixed or explained below
- [ ] No secrets or real personal data committed; new env vars are in `.env.example`
- [ ] New or changed behaviour has tests at the right level (unit, MSW-backed integration, or Playwright)

### Money, time and calculations

<!-- Delete this group if nothing here touches amounts, dates, totals or charts. -->

- [ ] Money and time handling follow the conventions in `docs/01-root-spec.md` (no ad-hoc float maths; dates respect the user's timezone and week start)
- [ ] Aggregation runs in SQL on the server, not in the client
- [ ] Dashboard, list totals, charts and reports still agree with each other
- [ ] The golden dataset test (`docs/03-golden-dataset.md`) passes, or I updated the expected values and explained why below
- [ ] Edge cases covered: refunds, Goal contributions and withdrawals, month boundaries, empty states

### Data access and security

<!-- Delete this group if there are no database, API or auth changes. -->

- [ ] Every new table has row-level security enabled, with policies and a test proving user A cannot read or write user B's data
- [ ] Migration is generated with Drizzle, with RLS, policies and grants added by hand; I checked it, `db:verify` passes, and it is safe on existing data
- [ ] Route handlers validate input with Zod and check the session; no user ID is trusted from the request body
- [ ] Premium and Free limits (active Goals, quarterly reports, heat maps, and so on) are enforced on the **server**, not only hidden in the UI
- [ ] Lapsed-Premium behaviour is preserved: nothing deleted, extra Goals read-only, upgrade prompt shown

### Offline and PWA

<!-- Delete this group if the PR doesn't touch writes, caching, the service worker or the queue. -->

- [ ] New write endpoints are idempotent so a replayed queued write is applied exactly once
- [ ] Offline behaviour tested: queued while offline, synced on reconnect, conflict and rejection states visible in the sync panel
- [ ] TanStack Query persistence and cache keys updated if data shapes changed; old persisted data won't crash the app
- [ ] Service worker or precache changes checked in a production build, not only in `dev`

### UI, accessibility and performance

<!-- Delete this group for non-UI PRs. -->

- [ ] Committed filters live in the URL; Zustand holds UI state only
- [ ] Works at mobile width, in light and dark themes, and with keyboard only (focus order, visible focus, no traps)
- [ ] Interactive elements use React Aria Components or equivalent accessible semantics; charts have a text alternative or data table
- [ ] Loading, empty and error states are handled
- [ ] No new heavy dependency without a reason; large components and ECharts code are lazy-loaded where it makes sense
- [ ] No regression against the performance budgets in the spec

### Payments (Stripe, test mode)

<!-- Delete this group unless the PR touches billing or entitlements. -->

- [ ] Test-mode keys only; webhook signatures verified and handling is idempotent
- [ ] Entitlement changes (purchase, lapse, return) tested end to end, including the Customer Portal path

### Docs and observability

- [ ] Specs updated if behaviour changed (`docs/features/Fxx-*.md`, `docs/01-root-spec.md`, or `docs/02-decisions.md` for new decisions)
- [ ] New failure paths report to Sentry with useful context, and nothing sensitive is logged

## Migrations and rollout

<!-- Delete if there are no migrations, backfills or new setup. -->

- **Migrations or backfills:**
- **New env vars or external setup:**
- **Rollback plan:**

## Notes

<!-- Trade-offs made, SonarQube findings accepted and why, golden dataset changes, follow-ups deliberately left out. -->
