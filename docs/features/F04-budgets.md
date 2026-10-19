# F04 Budgets

16 Oct 2026 · @Himanshu

A Budget is a monthly spending limit for one expense category. Its limit applies from a chosen month onward and carries forward until it is changed, so past months keep the limits they had. For any month, the Budgets page shows each budgeted category's spending, how much of the limit it uses, and a state: On track, Nearing limit at 80%, or Over budget at 100%. An overall figure covers the budgeted categories, with unbudgeted spending shown beside it. Every number comes from confirmed Transactions; pending changes appear only as annotations and never raise an alert.

| Item | Value |
| --- | --- |
| Milestone | M2. Before M5, writes are online only, with F03's stand-ins: Save disabled offline, and a failed save keeps the dialog open (D-241) |
| Plan | Free and Premium. A one-month override is Stretch (`budgets.monthOverride`) |
| Depends on | [F03](F03-transactions.md) (category spending), [F02](F02-onboarding-profile-settings.md) (month, locale), [P2](../platform/P2-data-access-and-security.md); P1 (write queue, from M5); F08, F09, F10, F11 read Budget figures |
| Decisions | D-33, D-40, D-46, D-110, D-111, D-171, D-185, D-213, D-241, D-246 to D-249, D-265, D-269 |

## 1. User stories

- As a user, I want to set a monthly limit for a category once, and have it apply every month until I change it.
- As a user, I want to change a limit from a chosen month without rewriting the months before it, or deliberately change past months too.
- As a user, I want to see at a glance which categories are on track, nearing their limit or over it.
- As a user, I want to see my spending in categories I have not budgeted, so the overall figure does not hide it.
- As a user, I want to stop budgeting a category from a month on and keep its history.
- As a user, I want to tap a Budget and see exactly the Transactions behind it.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| One Budget per expense category with a schedule of limit changes; set, change, stop and delete; the month view with per-category and overall utilization, states and unbudgeted spending; card and table views; drill-down to Transactions; pending annotations; offline writes | A one-month override (D-33, `budgets.monthOverride`) | Budgets for income or Goals; rollover of unused amounts and envelope budgeting (root 16); custom thresholds (D-33 fixed them); weekly or yearly Budgets; a total monthly Budget separate from categories (F4 lean); spending-pace projections; toasts when a Transaction crosses a threshold (F7 lean) |

## 3. Concepts and fields

**Budget** (private; one per expense category per user)

| Field | Meaning | Required | Rules | Example |
| --- | --- | --- | --- | --- |
| `id` | UUIDv7 | Yes | Client-generated (ID-1) | |
| `category` | An expense category (CAT-2) | Yes | Unique per user; never changes | `food` |
| `schedule` | Ordered limit changes, each `{ from, limitMinor }` | Yes, at least one | `from` is a month `YYYY-MM`, strictly increasing. `limitMinor` is 1 to the MON-5 maximum, or `null` for "stopped from this month" (BR-F04-04) | `[{ "from": "2026-09", "limitMinor": 600000 }, { "from": "2026-10", "limitMinor": 500000 }]` |
| `demo` | Loaded as demo data | System | F15 | `false` |
| `version`, `createdAt`, `updatedAt` | P2 | System | Every schedule change bumps `version` | |

**Month view** (computed, never stored), for month M:

| Value | Meaning |
| --- | --- |
| Limit (c, M) | The `limitMinor` of the last schedule entry with `from` ≤ M, if that entry is not `null`; otherwise category c has no Budget in M |
| Budgeted in M | The categories with a limit in M |
| Spent (c, M) | Category spending (TXN-5): Σ expense − Σ refund of category c with `occurred_on` in M, confirmed only. Subscription charges count, refunds reduce (D-33) |
| Remaining (c, M) | Limit − spent; negative means over |
| Utilization (c, M) | Spent ÷ limit, as integer tenths of a percent (BR-F04-08) |
| State (c, M) | `ok`, `warning` or `over` (BR-F04-09) |
| Overall (M) | Σ spent over budgeted categories ÷ Σ their limits, with the same states |
| Unbudgeted (M) | Total spending in M minus spending in budgeted categories, with the per-category list |

**States and their labels**

| State | When | Label |
| --- | --- | --- |
| `ok` | Utilization below 80.0% | On track |
| `warning` | From 80.0% to below 100.0% | Nearing limit |
| `over` | 100.0% or more | Over budget |

## 4. Business rules

**The schedule**

- **BR-F04-01** Each expense category has at most one Budget record (D-33).
    - **The insert:** a create runs `INSERT ... ON CONFLICT DO NOTHING`, with no conflict target, so neither the id nor the category can abort the transaction.
    - **No row inserted:** the handler re-reads in three steps:
        1. **Same id found** (a repeated create): 200 with the existing row (API-5).
        2. **Otherwise, a Budget for the category found:** 409 `budget_exists`, with that Budget in `details.current`.
        3. **Otherwise:** 409 `id_conflict` (P2, BR-P2-20).

    Two devices creating Food at once therefore always get one success and one `budget_exists`.
- **BR-F04-02** A limit for month M is the latest schedule entry from M or earlier (D-33). It carries forward to every later month until the next entry. Golden: food is 6,000.00 from 2026-09 and 5,000.00 from 2026-10, so September uses 6,000.00 and November inherits 5,000.00.
- **BR-F04-03** Setting a limit "from month M" replaces the schedule from M onward with one entry: every entry from M or later is removed, and `{ from: M, limitMinor }` is added (D-246). Months before M keep their limits.
- **BR-F04-04** Stopping a Budget "from month M" works the same way with `limitMinor: null`. M and every later month have no Budget for that category; earlier months keep theirs. Stopping from the first entry's month or earlier would leave no month at all, so it is refused (422) and the interface offers Delete instead (BR-F04-06).
- **BR-F04-05** After every change the schedule is normalized:
    - entries that repeat the previous entry's limit are removed;
    - a `null` entry that follows another `null`, or that comes first, is removed.

    The schedule therefore always starts with a limit and never holds two equal neighbours.
- **BR-F04-06** Delete removes the Budget and its whole schedule, so every month loses it. The confirmation says so: "Delete the Food Budget? Every month, including past ones, loses its Food limit."
- **BR-F04-07** A new change's `from` may be any month from 36 months before the current month to 12 months after it (D-247). The control defaults to the current month. The range limits new changes only: older entries already in a schedule (for example, from demo or seed data) stay valid.
    - **Retroactive changes:** a change whose `from` is before the current month changes past months. The dialog warns before saving, naming the affected months: "This also changes September and October 2026." It never blocks.
    - **Later entries:** a change that removes entries after `from` also says so: "This replaces the change to 7,000.00 from December 2026."

**Utilization and states**

- **BR-F04-08** Utilization is computed from integers as tenths of a percent, rounded half away from zero (MON-7, MON-8): `utilizationTenths = round(spentMinor × 1000 ÷ limitMinor)`. It is shown with one decimal. Negative spending (refunds above expenses) gives a negative utilization, shown as such (TXN-7). Its bar is empty.
- **BR-F04-09** The state compares the same rounded value (D-248): `warning` from 800 tenths, `over` from 1000. What the user reads and the state always agree: 79.95% shows 80.0% and is Nearing limit. Golden: September shopping at exactly 80.0% is Nearing limit; October shopping at exactly 100.0% is Over budget.
- **BR-F04-10** Overall utilization uses the budgeted categories only, against the sum of their limits (D-33). The overall card shows its state the same way but raises no alert; only categories alert (F10).
- **BR-F04-11** Unbudgeted spending is total spending minus budgeted spending, so the two always add up to the month's spending (TXN-5, golden invariant 1). It lists every category with non-zero spending and no limit in M.
- **BR-F04-12** Pending changes never move a figure or a state (TXN-6, D-40). A pending Transaction in a budgeted category adds an annotation to its card: "+300.00 pending". A pending schedule change shows "Limit changing to 7,000.00 · Pending sync" until it is confirmed.
- **BR-F04-13** Alerts (D-33) are the card states plus F10's Budget-threshold insights, both computed from confirmed figures. Budgets never show toasts.

**The page**

- **BR-F04-14** `/budgets?month=YYYY-MM` shows one month, defaulting to the current month. An invalid `month` is dropped with the FIL-5 notice. The month picker steps month by month and has "This month".
- **BR-F04-15** The page has four parts, top to bottom:
    1. **Overall card:** budgeted spent of budgeted limit, utilization, state, then "Not budgeted: 18,000.00" and "Total spending: 31,168.00".
    2. **Budget cards** for the categories budgeted in M, sorted by state (Over budget, then Nearing limit, then On track), then by utilization, highest first.
    3. **Not budgeted:** every category with spending in M and no limit in M, by spending, highest first. A category with no Budget record offers Add a Budget; one with a record offers Change limit.
    4. **Not active this month:** every Budget record with no limit in M, by category, each with Change limit and Delete. A record whose first limit comes after M reads "Starts October 2026"; one stopped by an earlier entry reads "Stopped from May 2026".
- **BR-F04-16** A Budget card shows:
    - the category's icon, label and color (CAT-4);
    - "6,220.00 of 5,000.00";
    - the utilization and the remaining amount, for example "124.4% · Over by 1,220.00" or "84.2% · 950.00 left";
    - a bar filled to the utilization, capped at 100%, with the overflow marked;
    - the state label, never conveyed by color alone;
    - any pending annotation;
    - the limit's source, for example "5,000.00 from Oct 2026", and the next change if it starts after M;
    - actions: Change limit, Stop budgeting, Delete, and the menu item "View Transactions".
- **BR-F04-17** Selecting a card, or View Transactions, opens `/transactions?from=<first day of M>&to=<last day of M>&cat=<c>` (D-111), whose header Out equals the card's spent.
- **BR-F04-18** A Table toggle shows the same month as a TanStack Table (D-171), sortable by every column:
    - columns: Category, Limit, Spent, Remaining, Utilization, State;
    - a total row for budgeted categories;
    - a row per unbudgeted category.

    It is also the accessible alternative to the cards (NFR-5). The choice is remembered on the device.

**The dialogs**

- **BR-F04-19** Add a Budget asks for three fields:
    - **Category:** every expense category with no limit in M.
    - **Limit:** typed with F03's amount rules (BR-F03-04).
    - **Apply from:** a month (BR-F04-07).

    For a category with no Budget record it sends `POST /api/budgets`. For a category with a record (one that starts later or is stopped), it changes that record's schedule with `PATCH`.
- **BR-F04-20** Change limit asks for the new limit and Apply from (default: the current month), with the BR-F04-07 warnings.
- **BR-F04-21** Stop budgeting asks for "Stop from" (default: the current month) and says "Earlier months keep their limits." A month at or before the first entry turns the action into Delete (BR-F04-04, BR-F04-06).

**Writes**

- **BR-F04-22** Every Budget write takes the profile lock first (D-213, SRV-7). Requests that send a limit carry `currency`. Budgets are offline-writable from M5 (D-46). Their queued items replay one by one, each with the version the previous one returned (D-269). They are never merged, except that a create and a later delete of the same queued Budget cancel out (D-265).
- **BR-F04-23** `PATCH` and `DELETE` need `If-Match`. A version conflict opens the conflict view (OFF-7), showing both schedules.

**Stretch: one-month override**

- **BR-F04-24** With `budgets.monthOverride` on, Change limit offers "Only this month". An override sets, or removes, the limit for exactly one month and leaves the schedule untouched; the card shows "Override for December 2026". A month's limit is its override if one exists, else the schedule's. Overrides are deleted with their Budget.

## 5. Calculations

Formulas: section 3 and BR-F04-08 to BR-F04-11. Every figure below is from [03-golden-dataset.md](../03-golden-dataset.md#budgets).

| Month | Category | Limit | Spent | Utilization | State |
| --- | --- | --- | --- | --- | --- |
| September | food | 6,000.00 | 5,050.00 | 84.2% | Nearing limit |
| September | shopping | 3,000.00 | 2,400.00 | 80.0% | Nearing limit (exact boundary) |
| September | entertainment | 1,000.00 | 649.00 | 64.9% | On track |
| October | food | 5,000.00 | 6,220.00 | 124.4% | Over budget |
| October | shopping | 3,000.00 | 3,000.00 | 100.0% | Over budget (exact boundary) |
| October | entertainment | 1,000.00 | 2,148.00 | 214.8% | Over budget |
| October | transportation | 2,000.00 | 1,800.00 | 90.0% | Nearing limit |
| November | food | 5,000.00 | 420.00, "+300.00 pending" | 8.4% | On track |

| Month | Overall | Unbudgeted | Total spending |
| --- | --- | --- | --- |
| September | 8,099.00 of 10,000.00, 81.0% | 19,950.00 (housing, health, transportation) | 28,049.00 |
| October | 13,168.00 of 11,000.00, 119.7% | 18,000.00 (housing) | 31,168.00 |
| November | 420.00 of 11,000.00, 3.8% | 18,000.00 (housing) | 18,420.00 |

**Rounding at the boundary.**
- A limit of 3,000.00 with 2,398.50 spent gives `round(239850 × 1000 ÷ 300000)` = `round(799.5)` = 800, so it reads 80.0% and is Nearing limit.
- With 2,398.49 spent: 799.497 rounds to 799, so it reads 79.9% and is On track.

**A retroactive change.** On golden, set food to 7,000.00 from 2026-09:
- The schedule becomes `[{ 2026-09, 7,000.00 }]`, since the October entry is replaced.
- September reads 72.1% (On track); October reads 88.9% (Nearing limit).
- The dialog warned: "This also changes September and October 2026. This replaces the change to 5,000.00 from October 2026."

**Stopping.** Stop entertainment from 2026-11:
- November has no entertainment Budget.
- September and October keep 1,000.00.
- November overall reads 420.00 of 10,000.00, 4.2%.

## 6. Screens and states

**`/budgets?month=YYYY-MM`.** BR-F04-14 to BR-F04-18. Dialogs: BR-F04-19 to BR-F04-21.

| State | What the user sees |
| --- | --- |
| Loading | Skeleton overall card and three skeleton Budget cards |
| Empty | No Budgets in M: "No Budgets for September 2026. Budgets apply from the month you choose." with Add a Budget. The Not budgeted list still shows. With no spending either: only the message and the button |
| Error | "Budgets could not be loaded." with Retry |
| Offline | The cached current month with "as of"; other months: "You're offline. This month isn't saved on this device." From M5, writes queue (D-46); before M5, Save is disabled |
| Pending | Annotations and "Pending sync" badges (BR-F04-12) |
| Locked (Premium) | n/a; the Stretch override is a flag, not Premium |
| Read-only | Demo Budgets are editable like any other; none are read-only |

## 7. Flows

**7.1 Add a Budget**

1. On `/budgets`, the user selects Add a Budget, picks Shopping, types 3,000 and keeps "Apply from: November 2026".
2. `POST /api/budgets`; the card appears.
3. **409 `budget_exists`** (another device created it): "A Shopping Budget already exists. We opened it so you can change it." and the existing Budget opens in Change limit.
4. **422:** field messages.

**7.2 Change a limit from a past month**

1. The user changes Food to 7,000 and picks September 2026.
2. The dialog shows the retroactive warning and the replaced entry (BR-F04-07); the user confirms.
3. `PATCH` with `If-Match`. **409:** the conflict view shows both schedules (BR-F04-23).
4. **Success:** September and October re-render with the new limit.

**7.3 Stop budgeting**

1. The user stops Entertainment from November 2026.
2. `PATCH { from: "2026-11", limitMinor: null }`.
3. The November card disappears; Entertainment moves to Not budgeted if it has spending.

**7.4 Delete.** The user confirms BR-F04-06's text. `DELETE` with `If-Match`; every month loses the Budget.

**7.5 Drill down.** Selecting the October Food card opens `/transactions?from=2026-10-01&to=2026-10-31&cat=food`, whose header shows Out 6,220.00 (golden check B).

**7.6 Offline change (from M5)**

1. Offline, the user changes Food to 7,000 from November.
2. The card keeps 5,000.00 and shows "Limit changing to 7,000.00 · Pending sync".
3. On reconnect the change replays exactly once.
4. **409:** the conflict view. **404** (deleted elsewhere): rejected, with "This Budget was deleted on another device."

## 8. Validation and messages

| Field or action | Rule | Message shown |
| --- | --- | --- |
| Category | Required | Choose a category. |
| Category | `budget_exists` | A Shopping Budget already exists. We opened it so you can change it. |
| Limit | Amount rules (F03, BR-F03-04) | F03's amount messages |
| Apply from | Within 36 months back and 12 ahead | Choose a month from Nov 2023 to Nov 2027. |
| Stop from | At or before the first entry | This would remove every month. Delete the Budget instead. |
| Retroactive change | Warning, not an error | This also changes September and October 2026. |
| Replaced entries | Warning, not an error | This replaces the change to 7,000.00 from December 2026. |
| Delete | Confirmation | Delete the Food Budget? Every month, including past ones, loses its Food limit. |
| Any write | `version_conflict` | This Budget was changed on another device. (Conflict view) |
| Any write | `not_found` | This Budget was deleted on another device. |
| Month link | Invalid `month` | Some filters in this link weren't valid and were removed. |

## 9. Plan gating

None for the core. The Stretch override checks `budgets.monthOverride`; with it off, an override request returns 403 `feature_off`.

## 10. Offline behavior

- **Readable:** the current month's Budgets, persisted (root 7.3), shown with "as of".
- **Writable:** create, change, stop and delete queue (D-46, P1). The card shows pending annotations; states and figures stay confirmed-only (BR-F04-12).
- **Replay outcomes:** 409 `version_conflict` opens the conflict view. `budget_exists` is rejected with Edit, which opens the existing Budget. 404 on a change is rejected; a 404 on a delete counts as done (D-239).

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency and versioning |
| --- | --- | --- | --- | --- | --- |
| `/api/budgets` | GET | `month` (default: the current month) | The month view (section 15) | 400, 401, 403 `profile_required` | Read |
| `/api/budgets` | POST | `{ id, category, from, limitMinor, currency }` | 201 with the Budget; 200 with the existing row for a repeated id (API-5) | 401, 403, 409 `budget_exists`, 409 `id_conflict`, 422 `validation_failed`, `currency_mismatch` | `Idempotency-Key` required |
| `/api/budgets/[id]` | PATCH | `{ from, limitMinor, currency }`; `limitMinor` may be `null`, and `currency` is required when it is not | 200 with the Budget | 401, 403, 404, 409 `version_conflict`, 422 | `Idempotency-Key` and `If-Match` required |
| `/api/budgets/[id]` | DELETE | `{}` | 204 | 401, 403, 404, 409 `version_conflict` | `Idempotency-Key` and `If-Match` required |

**Error code added by this spec**

| Status | Code | Default message | Write queue does |
| --- | --- | --- | --- |
| 409 | `budget_exists` | A Budget for this category already exists. | Reject, with Edit opening the existing Budget |

**Shared functions.**
- `budgetMonth(tx, ctx, month)` returns the month view, in one statement.
- `budgetMonths(tx, ctx, months)` returns several months' views, in one statement, for F09's Budget vs actual.

F08's widget, F09's chart, F10's threshold detector and F11's report all call them, so their figures cannot disagree.

## 12. Cross-feature effects

- **A confirmed Budget write** invalidates the Budgets month views, the whole dashboard prefix (F08, D-295), Analytics (F09), Insights (F10) and the demo status (F15).
- **A confirmed Transaction write** invalidates the Budgets view for its months (F03, section 12).
- **F08** shows the top 5 Budgets by utilization; **F09** charts budget against actual (Premium); **F10** raises the 80% and 100% insights; **F11** reports budget against actual.
- **F01 reset and F15 removal** delete Budgets.

## 13. Edge cases

- **A Budget that starts after M:** listed under Not active this month as "Starts December 2026", and not counted in M.
- **Stopped, then restarted:** stopped from November and set again from February gives `[…, { 2026-11, null }, { 2027-02, 4,000.00 }]`. December and January have no Budget.
- **Refunds exceed expenses in a budgeted category:** spent is negative, so utilization is negative and the state is On track. The overall figure falls by that amount.
- **A Subscription charge** in a budgeted category counts like any expense (D-33).
- **Two devices create a Food Budget offline:** the second replay gets `budget_exists`, and its sync item offers Edit on the existing Budget.
- **Editing while another device stops the Budget:** the second write gets 409 with the stopped schedule.
- **A month with no spending and no Budgets:** only the empty message and Add a Budget.
- **Currency after reset:** Reset deletes Budgets (F01), so no limit outlives a currency change.

## 14. Acceptance criteria

- **AC-F04-01** (integration) `budgetMonth` on the golden dataset returns every limit, spent, utilization and state in section 5, including the exact 80.0% and 100.0% boundaries, for September, October and November.
- **AC-F04-02** (integration) Overall, unbudgeted and total spending match section 5. Budgeted plus unbudgeted equals total spending for every month.
- **AC-F04-03** (integration) Setting food to 7,000.00 from 2026-09 gives 72.1% in September and 88.9% in October, and removes the October entry.
- **AC-F04-04** (integration) Stopping entertainment from 2026-11 leaves September and October unchanged and gives November overall 4.2%. Stopping it from 2026-09, its first month, returns 422.
- **AC-F04-05** (unit) Normalization: setting 5,000.00 from 2026-11 on a schedule already at 5,000.00 adds no entry; a leading `null` is removed.
- **AC-F04-06** (unit) Utilization tenths: 239850 of 300000 gives 800 (`warning`); 239849 gives 799 (`ok`); a negative spent gives a negative value and `ok`.
- **AC-F04-07** (client integration, M5) With P1 pending, November food shows 8.4%, "+300.00 pending" and On track, and no insight fires.
- **AC-F04-08** (integration) A second create for `food` returns 409 `budget_exists` with the existing Budget, whether it arrives after the first or at the same moment.
- **AC-F04-09** (integration) A `PATCH` with a stale `If-Match` returns 409 with the current schedule.
- **AC-F04-10** (E2E) Selecting the October Food card opens a Transactions list whose header Out is 6,220.00.
- **AC-F04-11** (integration) `from` 37 months back, or 13 months ahead, returns 422.
- **AC-F04-12** (accessibility) The cards and the table pass axe with no serious or critical violations. Each state is announced in text, and the dialogs work by keyboard alone.
- **AC-F04-13** (integration) For golden September:
    - transportation appears under Not budgeted (450.00) with Change limit, and under Not active this month as "Starts October 2026";
    - Add a Budget for transportation sends `PATCH`, not `POST`.

## 15. Illustrations

Illustrative, `GET /api/budgets?month=2026-10` on golden:

```json
{
  "month": "2026-10",
  "currency": "INR",
  "overall": { "limitMinor": 1100000, "spentMinor": 1316800, "utilizationTenths": 1197, "state": "over" },
  "totalSpentMinor": 3116800,
  "unbudgetedMinor": 1800000,
  "unbudgeted": [{ "category": "housing", "spentMinor": 1800000 }],
  "budgets": [
    {
      "id": "0192…",
      "category": "food",
      "limitMinor": 500000,
      "spentMinor": 622000,
      "remainingMinor": -122000,
      "utilizationTenths": 1244,
      "state": "over",
      "schedule": [{ "from": "2026-09", "limitMinor": 600000 }, { "from": "2026-10", "limitMinor": 500000 }],
      "version": 2,
      "demo": false
    }
  ],
  "inactive": []
}
```

Illustrative, an `inactive` entry, from golden September, where transportation starts in October:

```json
{ "id": "0192…", "category": "transportation", "status": "starts", "from": "2026-10", "schedule": [{ "from": "2026-10", "limitMinor": 200000 }], "version": 1, "demo": false }
```

Illustrative, a Budget card:

```text
[food icon] Food                                   Over budget
6,220.00 of 5,000.00          124.4% · Over by 1,220.00
[██████████████████████████████|▓▓▓▓▓▓]
5,000.00 from Oct 2026                 [Change limit] [⋯]
```
