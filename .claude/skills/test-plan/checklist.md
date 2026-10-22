# Things to consider when testing a Daybook change

Use the groups that apply to the change. For each case, ask whether the spec already states it. Cases the spec states are covered by its acceptance criteria. Cases it does not state are proposals.

## Money

- Amounts are integers in the minor unit. Check a currency with no decimals (JPY, exponent 0) and one with three (KWD, exponent 3) as well as two (MON-1, MON-2).
- The smallest amount (one minor unit), the largest allowed, and one above it (MON-5).
- Division rounds half away from zero, once, at the end (MON-7). Try an exact half for a positive and for a negative value.
- A sum above `Number.MAX_SAFE_INTEGER` throws instead of losing precision (MON-6).
- Percentages show one decimal, and a zero denominator shows "—" (MON-8).
- A request whose `currency` differs from the profile's gives 422 `currency_mismatch`.
- Display uses the profile's number locale, for example `1,00,000.00` for INR.

## Dates and time

- A Transaction at 00:30 local time on the 1st counts in that month, not the previous one. The golden dataset has rows that fall in a different month in UTC (TIME-3).
- A later timezone change never moves an existing `occurred_on` (TIME-2).
- The entry window: `occurred_on` from ten days before the recording date up to the recording date; one day outside it gives 422 `date_out_of_window`. The same for an instant more than five minutes ahead of the request clock (TIME-7).
- Week start of Monday, Sunday and Saturday (TIME-8).
- Subscription schedules on the 29th, 30th and 31st, and on 29 February (TIME-9).
- Period forms (month, quarter, year, range), inclusive ends, a partial period labeled "to date", and the previous period of equal length (PER-1, PER-3, PER-4).
- Nothing reads the real clock. The golden clock is 2026-11-02T12:00:00+05:30 (TST-3).

## Input

- Required fields missing; each length limit at the limit and one over, counted in code points (an emoji is one) (6.7).
- Whitespace is trimmed and text is NFC-normalized. Control characters are rejected, except line feeds in a note.
- Amount text parsed by the profile's number locale.
- An invalid URL parameter is dropped with a notice, never an error page (FIL-5).

## Screens and states

- Every state in the spec's state matrix: loading, empty, error, offline, pending, locked, read-only.
- Negative results show below zero in tables, bars and lines. A donut or heat map clamps to zero and adds the footnote (TXN-7).
- Every message in the spec's validation table, matched exactly.
- Focus moves into a dialog, stays in it, and returns when it closes.

## API and server

- Every error the spec's server surface lists: status, code, message and `fields`.
- No session gives 401. A call before onboarding gives 403 `profile_required` (BR-P2-12, BR-P2-13).
- A mutation without JSON gives 415, a body over 64 KB gives 413, a cross-origin request gives 403 `cross_origin` (API-2).
- Idempotency: the same key and body returns the stored response; the same key with a different body gives 422 `idempotency_key_reused`; two concurrent requests with one key run once (API-3, BR-P2-18, BR-P2-19).
- Versions: a stale `If-Match` gives 409 `version_conflict` with the current row; a missing one gives 400 (API-4, BR-P2-21).
- A create with an id that already exists for this user returns the existing row with 200; an id owned by another user gives 409 `id_conflict`; an id dated in the future gives 422 (API-5, BR-P2-20).
- Lists: cursors stay stable when rows are inserted; the default and maximum page size (API-7).
- Deleting a parent that still has children gives 409 `has_dependents`; a missing parent on create gives 422 `parent_missing`.

## Isolation and plan

- Another user's row gives 404 on read, update and delete, never 403.
- A request with no user context sees nothing (TST-1).
- A new private table is added to the isolation suite with its seven checks.
- Premium: a request without the entitlement gives 403 `premium_required` and names the capability; after a lapse nothing is deleted and locked items are read-only (CAP-4, SEC-4).
- A switched-off flag gives 403 `feature_off`.

## Offline (once the offline work exists)

- A write made offline shows a pending badge and an annotation, and syncs exactly once (OFF-5, OFF-6).
- Coalescing: a create then an edit becomes one create; a create then a delete removes both.
- A 401 pauses the queue; a conflict shows both versions; a rejected item shows its reason and can be retried, edited or discarded (OFF-7).
- A queued request from an older build is refused with `build_mismatch` and resumes after the update.
- Logging out with pending items warns first; a different user logging in wipes the caches and queue.
- Two tabs run one queue.

## Across features

- After a confirmed write, the queries the spec lists are invalidated: lists, dashboard, budgets, goals, analytics, insights, payees.
- The list totals, the dashboard and the report agree for the same month (TST-2).
- Each Goal's progress equals its contributions minus its withdrawals; category totals sum to spending.

## Accessibility

- The core flow works by keyboard alone, with labels and visible focus.
- axe reports no serious or critical violation on the page (NFR-4, NFR-6).
- Every chart has a "View as table", and an infinite list has a visible Load more button (NFR-5).

## Performance and security (when the spec states them)

- The budgets in section 11.1 of the root spec for the page or endpoint concerned.
- No secret, amount, payee or note reaches Sentry or a log (SEC-12).
