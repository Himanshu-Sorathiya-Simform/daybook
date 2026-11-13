# F04 Budgets

16 Oct 2026 · @Himanshu

A Budget is a monthly spending limit for one expense category. Its limit applies from a chosen month onward and carries forward until it is changed, so past months keep the limits they had. A one-month limit changes or removes the limit for a single month and leaves the rest alone. For any month, the Budgets page shows each budgeted category's spending, how much of the limit it uses, and a state: On track, Nearing limit at 80%, At limit at exactly 100%, or Over budget above it. An overview covers the budgeted categories, with unbudgeted spending beside it, and a panel shows a Budget's last 6 months, its limit history and where the money went. Every change previews each month it affects before it is saved, and can be undone. Every number comes from confirmed Transactions; pending changes appear only as annotations and never raise an alert.

| Item       | Value                                                                                                                                                                                                                                               |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M2. Before M5, writes are online only, with F03's stand-ins: Save disabled offline, and a failed save keeps the dialog open (D-241)                                                                                                                 |
| Plan       | Free and Premium, with no gating; one-month limits included (D-560)                                                                                                                                                                                 |
| Depends on | [F03](F03-transactions.md) (category spending, summary, drill-down), [F02](F02-onboarding-profile-settings.md) (month, locale), [P2](../platform/P2-data-access-and-security.md); P1 (write queue, from M5); F08, F09, F10, F11 read Budget figures |
| Decisions  | D-33, D-40, D-46, D-110, D-111, D-171, D-185, D-213, D-241, D-246 to D-249, D-265, D-269, D-560 to D-566                                                                                                                                            |

## 1. User stories

- As a user, I want to set a monthly limit for a category once, and have it apply every month until I change it.
- As a user, I want to change a limit from a chosen month without rewriting the months before it, or deliberately change past months too.
- As a user, I want to change or remove a limit for one month only, such as a festival month, without touching the others.
- As a user, I want to see what a change does to every month it touches before I save it, and undo it after.
- As a user, I want to see at a glance which categories are on track, nearing their limit, at it or over it.
- As a user, I want to see my spending in categories I have not budgeted, so the overall figure does not hide it.
- As a user, I want to stop budgeting a category from a month on and keep its history.
- As a user, I want to see a Budget's recent months, its limit history and the Transactions behind it.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Stretch (M8)                                          | Out                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| One Budget per expense category with a schedule of limit changes and one-month limits; add, change, stop and delete, from a month onward or for one month; the change preview; inline Undo; the month view with per-category and overall utilization, states and unbudgeted spending; the overview with state filters; the grouped list and the table; the panel with the last 6 months, limit history and top payees; drill-down to Transactions; pending annotations; offline writes | None. The one-month override moved into scope (D-560) | Budgets for income or Goals; rollover of unused amounts and envelope budgeting (root 16); custom thresholds (D-33 fixed them); weekly or yearly Budgets; a total monthly Budget separate from categories (F4 lean); spending-pace projections; toasts when a Transaction crosses a threshold (F7 lean) |

## 3. Concepts and fields

**Budget** (private; one per expense category per user)

| Field                               | Meaning                                                | Required          | Rules                                                                                                                                                                  | Example                                                                                      |
| ----------------------------------- | ------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `id`                                | UUIDv7                                                 | Yes               | Client-generated (ID-1)                                                                                                                                                |                                                                                              |
| `category`                          | An expense category (CAT-2)                            | Yes               | Unique per user; never changes                                                                                                                                         | `food`                                                                                       |
| `schedule`                          | Ordered limit changes, each `{ from, limitMinor }`     | Yes, at least one | `from` is a month `YYYY-MM`, strictly increasing. `limitMinor` is 1 to the MON-5 maximum, or `null` for "stopped from this month" (BR-F04-04). Normalized (BR-F04-05)  | `[{ "from": "2026-09", "limitMinor": 600000 }, { "from": "2026-10", "limitMinor": 500000 }]` |
| `overrides`                         | One-month limits, each `{ month, limitMinor }` (D-560) | Yes, may be empty | `month` is `YYYY-MM`, at most one per month, ordered by month. `limitMinor` is 1 to the MON-5 maximum, or `null` for "no limit this month only" (BR-F04-24, BR-F04-25) | `[{ "month": "2026-10", "limitMinor": 800000 }]`                                             |
| `demo`                              | Loaded as demo data                                    | System            | F15                                                                                                                                                                    | `false`                                                                                      |
| `version`, `createdAt`, `updatedAt` | P2                                                     | System            | Every change to `schedule` or `overrides` bumps `version`; a write that changes neither does not (BR-F04-36)                                                           |                                                                                              |

Both lists are stored as `jsonb` columns on the Budget's one row, so every write replaces the record under one `version` (D-563). The table also refuses any entry without exactly its two fields, a `YYYY-MM` month and a limit that is `null` or a whole number from 1 to 999,999,999,999, the largest MON-5 allows in any currency.

**Month view** (computed, never stored), for month M:

| Value              | Meaning                                                                                                                                                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Limit (c, M)       | M's one-month limit for category c if one exists (`null` means none); otherwise the `limitMinor` of the last schedule entry with `from` ≤ M, if that entry is not `null`; otherwise category c has no Budget in M (BR-F04-02) |
| Source (c, M)      | What decides the limit: `{ kind: "override", month, limitMinor }` or `{ kind: "schedule", from, limitMinor }`                                                                                                                 |
| Next (c, M)        | The first schedule entry with `from` after M, or `null`                                                                                                                                                                       |
| Budgeted in M      | The categories with a limit in M                                                                                                                                                                                              |
| Spent (c, M)       | Category spending (TXN-5): Σ expense − Σ refund of category c with `occurred_on` in M, confirmed only. Subscription charges count, refunds reduce (D-33)                                                                      |
| Remaining (c, M)   | Limit − spent; negative means over                                                                                                                                                                                            |
| Utilization (c, M) | Spent ÷ limit, as integer tenths of a percent (BR-F04-08)                                                                                                                                                                     |
| State (c, M)       | `ok`, `warning` or `over` (BR-F04-09)                                                                                                                                                                                         |
| Overall (M)        | Σ spent over budgeted categories ÷ Σ their limits, with the same states                                                                                                                                                       |
| Unbudgeted (M)     | Total spending in M minus spending in budgeted categories, with the per-category list                                                                                                                                         |
| Previous (M)       | The overall spent and limit of M − 1, its number of Budgets, and how many of them have the state `over` (BR-F04-34)                                                                                                           |

**States and their labels**

| State     | When                       | Label         |
| --------- | -------------------------- | ------------- |
| `ok`      | Utilization below 80.0%    | On track      |
| `warning` | From 80.0% to below 100.0% | Nearing limit |
| `over`    | Exactly 100.0%             | At limit      |
| `over`    | Above 100.0%               | Over budget   |

## 4. Business rules

**The schedule**

- **BR-F04-01** Each expense category has at most one Budget record (D-33).
    - **The insert:** a create runs `INSERT ... ON CONFLICT DO NOTHING`, with no conflict target, so neither the id nor the category can abort the transaction.
    - **No row inserted:** the handler re-reads in three steps:
        1. **Same id found** (a repeated create): 200 with the existing row (API-5).
        2. **Otherwise, a Budget for the category found:** 409 `budget_exists`, with that Budget in `details.current`.
        3. **Otherwise:** 409 `id_conflict` (P2, BR-P2-20).

    Two devices creating Food at once therefore always get one success and one `budget_exists`. A restoring create (BR-F04-33) follows the same steps.

- **BR-F04-02** A limit for month M is M's one-month limit if it has one (BR-F04-24); otherwise the latest schedule entry from M or earlier (D-33). A schedule limit carries forward to every later month until the next entry. Golden: food is 6,000.00 from 2026-09 and 5,000.00 from 2026-10, so September uses 6,000.00 and November inherits 5,000.00.
- **BR-F04-03** Setting a limit "from month M" replaces the schedule from M onward with one entry: every entry from M or later is removed, and `{ from: M, limitMinor }` is added (D-246). Months before M keep their limits. One-month limits are not touched: any at or after M stay and keep deciding their month (D-560).
- **BR-F04-04** Stopping a Budget "from month M" works the same way with `limitMinor: null`. M and every later month have no Budget for that category, except months with a one-month limit; earlier months keep theirs. Stopping from the first entry's month or earlier would leave no month at all, so it is refused (422) and the interface offers Delete instead (BR-F04-06, BR-F04-21). Stopping for one month only is a one-month limit of `null` (BR-F04-24).
- **BR-F04-05** After every change the schedule is normalized:
    - entries that repeat the previous entry's limit are removed;
    - a `null` entry that follows another `null`, or that comes first, is removed.

    The schedule therefore always starts with a limit and never holds two equal neighbors.

- **BR-F04-06** Delete removes the Budget, its whole schedule and its one-month limits, so every month loses it.
    - **The confirmation:** titled "Delete the Food Budget?", it says "Every month, including past ones, loses its Food limit."
    - **A longer history:** when the Budget has more than one change, it adds "Its limit history (2 changes since September 2026) goes too. To keep it, stop the Budget from a month instead." The count is the schedule entries plus the one-month limits; the month is the first entry's.
    - **Buttons:** Cancel and Delete Budget.

- **BR-F04-07** A new schedule change or one-month limit may name any month from 36 months before the current month to 12 months after it (D-247). The page shows only months in the same range (D-566). The month control defaults to the current month. The range limits new changes only: older entries already in a schedule (for example, from demo or seed data, or put back by Undo) stay valid. What a change does to past months and later entries is shown before saving (BR-F04-26, BR-F04-27); it is never blocked for that.

**Utilization and states**

- **BR-F04-08** Utilization is computed from integers as tenths of a percent, rounded half away from zero (MON-7, MON-8): `utilizationTenths = round(spentMinor × 1000 ÷ limitMinor)`. It is shown with one decimal. Negative spending (refunds above expenses) gives a negative utilization, shown as such (TXN-7). Its bar is empty.
- **BR-F04-09** The state compares the same rounded value (D-248): `warning` from 800 tenths, `over` from 1000. What the user reads and the state always agree: 79.95% shows 80.0% and is Nearing limit.
    - **At limit:** at exactly 1000 tenths the label is "At limit". The state stays `over`: it sorts and counts with Over budget, and F10 treats it as over.
    - **Golden:** September shopping at exactly 80.0% is Nearing limit; October shopping at exactly 100.0% is At limit.
- **BR-F04-10** Overall utilization uses the budgeted categories only, against the sum of their limits (D-33). The overview shows its state the same way but raises no alert; only categories alert (F10).
- **BR-F04-11** Unbudgeted spending is total spending minus budgeted spending, so the two always add up to the month's spending (TXN-5, golden invariant 1). It lists every category with non-zero spending and no limit in M.
- **BR-F04-12** Pending changes never move a figure or a state (TXN-6, D-40). From M5:
    - a pending Transaction in a budgeted category adds an annotation to its row and to the overview: "+300.00 pending";
    - a pending Budget change keeps the confirmed figures, puts a Pending sync badge on its row and panel, and shows its text in place of the limit's source, for example "Limit changing to 7,000.00 from Dec 2026", "New Budget, 3,000.00 from Nov 2026" or "Stopping from Nov 2026";
    - a "Waiting to sync" section above the list lists each pending Budget change with its text, headed "2 changes".
- **BR-F04-13** Alerts (D-33) are the row states plus F10's Budget-threshold insights, both computed from confirmed figures. Budgets never show toasts.

**The page**

- **BR-F04-14** `/budgets?month=YYYY-MM` shows one month, defaulting to the current month. A `month` that is invalid or outside the range (BR-F04-07) is dropped with the FIL-5 notice. The header holds, in order:
    1. **The title** "Budgets", with "as of 14:05" beside it when offline (section 10).
    2. **The month control:** Previous month and Next month buttons, disabled at the ends of the range, around the month's name ("October 2026"; the current month reads "November 2026 · to date"). The name opens a month grid: the year with Previous year and Next year, twelve months with those outside the range disabled, each in-range month showing its overall utilization ("81.0%") or nothing when it has no Budget (BR-F04-35), the caption "Figures: overall use of the month's limits", and a This month button.
    3. **"Show Budgets as":** List or Table, remembered on the device (`daybook.budgets.view`).
    4. **Add a Budget.**

    Below 700 px, Add a Budget is an icon button and the month control moves to its own row with 44 px targets.

- **BR-F04-15** Below the header, top to bottom:
    1. **The overview**, when M has at least one Budget:
        - "Budgeted spending in October", the budgeted spent as a large figure, then "of 11,000.00 · 119.7% · Over by 2,168.00" (or "1,500.00 left") and any pending annotation;
        - the overall bar (BR-F04-16), captioned "Black tick: the 11,000.00 limit.", with "The bar stops at 160%." added when spent is above 160% of the limit, and, in the current month, "Blue: day 2 of 30";
        - beside it, four state counts, Over budget, At limit, Nearing limit and On track, each a toggle that filters the list (BR-F04-31);
        - then "Not budgeted 18,000.00" and "Total spending 31,168.00".
    2. **The Undo notice**, when one applies and is not shown in the panel (BR-F04-29).
    3. **The list,** in groups, each with a header and a figure:
        - **"Needs attention · 4":** Over budget, At limit and Nearing limit rows. Its figure is "2,368.00 over in total" (October: the sum of each row's amount over its limit) when any row is over its limit, otherwise the sum left ("1,550.00 left" in September).
        - **"On track · 1":** On track rows, with the sum left ("351.00 left" in September).
        - **"Not budgeted · 1":** every category with spending in M and no limit in M, by spending, highest first, captioned "No limit in October", with its spending (section 5 lists both months) and an action: Add a Budget for a category with no Budget record, Change limit for one with a record. The group's figure is the unbudgeted total.
        - **"Not active this month · 1":** collapsed until pressed. Every Budget record with no limit in M, by category label, captioned as BR-F04-34 says, with Change limit and Delete.

    Rows in the first two groups sort by state (Over budget and At limit first, then Nearing limit, then On track), then by utilization, highest first.

- **BR-F04-16** A Budget row shows:
    - the category's icon, label and color (CAT-4), and a Pending sync badge when one applies (BR-F04-12);
    - a headline in the state's color: "Over by 1,220.00", or "950.00 left";
    - a bar: filled to the utilization within the first 62.5% of its width, the overflow past the limit drawn in the over color up to 160%, a tick at the limit, and, in the current month, a marker at today's share of the month;
    - "6,220.00 of 5,000.00 · 124.4% · Over budget", the state as text, never by color alone;
    - any pending annotation;
    - the limit's source: "5,000.00 from Oct 2026", or "One-month limit for Oct 2026", followed by the next schedule entry when there is one: ", then 7,000.00 from Dec 2026" or ", then stops from Dec 2026".
- **BR-F04-17** Selecting a row (pointer, Enter or Space) selects it and shows it in the panel (BR-F04-30); selecting it again clears the selection. The panel's "See 4 Transactions" opens `/transactions?from=<first day of M>&to=<last day of M>&cat=<c>` (D-111), whose header Out equals the row's spent.
- **BR-F04-18** The Table view shows the same month as a TanStack Table (D-171):
    - **Columns:** Category, Limit, Spent, Remaining, Utilization, State; sorted by pressing a heading (Category and State ascending first, the figures descending first; pressing again reverses), with `aria-sort`;
    - **Caption:** "October 2026. Select a column heading to sort.";
    - **Rows:** each budgeted category, a "Budgeted total" row with the overall state, and a row per unbudgeted category with "—" for Limit, Remaining and Utilization and the State "Not budgeted";
    - **Selection:** a row selects its category like a list row.

    It is also the accessible alternative to the bars (NFR-5). In a month with no Budget, the list shows instead.

**The dialogs**

- **BR-F04-19** Add a Budget asks for:
    - **Category:** a radio group of tiles for every expense category with no limit in M, each showing "450.00 in Sep" when it has spending in M.
    - **Monthly limit:** typed with F03's amount rules (BR-F03-04).
    - **For how long** (BR-F04-20), only when the chosen category has a Budget record. A category without one always applies from a month (D-560).
    - **Apply from** or **Month:** a month (BR-F04-28).

    For a category with no Budget record it sends `POST /api/budgets`. For a category with a record (one that starts later, is stopped, or has a `null` one-month limit in M), it sends `PATCH`.

- **BR-F04-20** Change limit, titled "Change the Food limit", asks for:
    - **New limit:** filled in with the limit in force in the viewed month, else in the current month, else the latest limit in the schedule. Its hint reads "Spent 6,220.00 in October and 5,050.00 in September." for the viewed month and the one before.
    - **For how long:** "From a month onward" ("Carries on until you change it") or "One month only" ("December 2026 goes back to 5,000.00", or "December 2026 has no Budget again"), naming the month after the chosen one and the limit it has, its own one-month limit included.
    - **Apply from**, or **Month** for one month only (BR-F04-28).
- **BR-F04-21** Stop budgeting, titled "Stop budgeting Food", asks For how long (as BR-F04-20) and "Stop from", or "Month" for one month only. From a month onward at or before the first entry, the dialog shows "This would remove every month. Delete the Budget instead." and its button becomes "Delete Budget instead", which opens the Delete confirmation (BR-F04-04, BR-F04-06).

**Writes**

- **BR-F04-22** Every Budget write takes the profile lock first (D-213, SRV-7). Requests that send a limit carry `currency`, so a restoring write always does; a mismatch is 422 `currency_mismatch`. Budgets are offline-writable from M5 (D-46). Their queued items replay one by one, each with the version the previous one returned (D-269). They are never merged, except that a create and a later delete of the same queued Budget cancel out (D-265).
- **BR-F04-23** `PATCH` and `DELETE` need `If-Match`. A version conflict opens the conflict view (OFF-7), showing both schedules and both sets of one-month limits.

**One-month limits** (D-560)

- **BR-F04-24** A one-month limit sets (an amount) or removes (`null`) the limit for exactly one month, and leaves the schedule untouched. A month's limit is its one-month limit if one exists, else the schedule's (BR-F04-02). It is made with "One month only" in Change limit (BR-F04-20) or Stop budgeting (BR-F04-21), on a Budget record only: one-month limits alone never make a Budget, and a Budget always keeps at least one schedule entry with a limit. They are deleted with their Budget.
- **BR-F04-25** One-month limits are normalized when one is set: setting one equal to what the schedule gives that month removes any one-month limit for the month instead of storing it, so when it is set, a `null` one-month limit lands only in a month the schedule budgets. A schedule change never adds, changes or removes a one-month limit (BR-F04-03), so a later schedule may equal a kept one-month limit, or stop a month whose one-month limit is `null`; both stay as they are. Remove in the limit history (BR-F04-30) sends `DELETE /api/budgets/[id]/overrides/[month]`.

**What changes** (D-564)

- **BR-F04-26** Once a category, a valid limit (unless stopping) and a month are set, the dialog shows "What changes" above its notes. The months it lists:
    - **From a month onward:** M to the current month, or M alone when M is later, captioned "3 months, then every month after" (or "November 2026 and every month after").
    - **One month only:** M − 1, M and M + 1, each only when inside the range (BR-F04-07), with M emphasized; M − 1 reads "Unchanged", and M + 1 reads "Back to the schedule", or "Unchanged" when it has its own one-month limit.

    Each month shows its old limit struck through, its new limit, and the new state: "72.1% · On track", "No Food spending · On track", "Nothing spent yet" (a later month with no spending), "Moves to Not budgeted" (no new limit, with spending) or "No Budget". When the state changes, the old one shows first: "84.2% Nearing limit → 72.1% · On track". A month whose limit does not change reads "Keeps its one-month limit".

    - **Up to 4 months:** one card per month, then a card "Dec 2026 onward" with the new limit and "Carries on until you change it".
    - **5 months or more:** a strip with one column per month (spending against the new limit, a tick at the old limit), captioned "One column per month: spending against the new limit. Black tick: the old limit."; then a table "Months that change" whose rows group consecutive months with the same old limit, new limit and spending ("Nov 2023 to Aug 2026", "34 months"), 6 groups at first with "Show 3 more"; then "Dec 2026 onward" with the new limit, "carries on until you change it".

    The spending comes from the history endpoint (BR-F04-35) and the months, groups and notes from one shared function, `previewChange`, so the page and its tests agree. There is no preview endpoint.

- **BR-F04-27** Below the preview, the dialog lists notes, never errors, in this order:
    1. Stop from a month onward: "Earlier months keep their limits.", adding "November's spending moves to Not budgeted." when M has spending.
    2. One month only: "Only October 2026 changes. The limits for other months stay as they are."
    3. A change from a month onward that changes the limit of months before the current month (months that keep a one-month limit do not count): "This also changes September and October 2026."
    4. A change on a Budget record that gives months with no limit a limit: "Food gets a Budget in 2 months that had none."
    5. Later schedule entries it replaces: "This replaces the change to 7,000.00 from December 2026." (or "the stop from December 2026"); several: "This replaces 2 later changes: 7,000.00 from Dec 2026, the stop from Mar 2027."
    6. One-month limits at or after M that stay: "October 2026 keeps its one-month limit." or "October and December 2026 keep their one-month limits."

    When the change would leave the Budget exactly as it is, the dialog says "Food already has this limit from November 2026. Nothing changes." (or "in November 2026") and its button is disabled. The button names the change: "Add Budget from November", "Change from November", "Change November only", "Add for November only", "Stop from November" or "Stop November only".

**The month field**

- **BR-F04-28** The month field offers chips: "This month (November)", "Next month (December)", the viewed month as "August (viewing)" when it is neither, and "Other month", which opens the month grid (BR-F04-14, without figures) captioned "From Nov 2023 to Nov 2027.". A month picked in the grid shows as its own selected chip. A month name carries its year only when it is not the current year ("Next month (January 2027)").

**Undo** (D-562)

- **BR-F04-29** After each confirmed write, an inline notice with Undo confirms it, never a toast:
    - **Texts:** "Food Budget added: 3,000.00 from November 2026.", "Food limit is now 7,000.00 from September 2026.", "Food limit is 8,000.00 for October 2026 only.", "Entertainment Budget stops from November 2026. Earlier months keep their limits.", "Entertainment has no limit for October 2026 only.", "One-month limit for October 2026 removed." and "Food Budget deleted.".
    - **Where:** in the panel when the changed Budget is selected, otherwise above the list with a Dismiss button. After a delete it is always above the list.
    - **How long:** until Undo, Dismiss, the next write, or a change of month.
    - **What Undo sends:**
        - after a create sent as `POST`, `DELETE` with the version it returned; an Add sent as `PATCH` (BR-F04-19) counts as a change;
        - after a schedule change, a one-month limit or a removal, a restoring `PATCH` (BR-F04-33) with the previous schedule and one-month limits and `If-Match` set to the version the change returned;
        - after a delete, a restoring `POST` with the previous schedule and one-month limits and a new id.

        A 409 opens the conflict view (BR-F04-23). Undo shows no notice of its own.

**The panel** (D-249)

- **BR-F04-30** From 1180 px the panel is docked beside the list. Below that it is a drawer over a scrim, 420 px wide (the full width below 700 px), opened by a selection and closed by Close details, the scrim or Escape. It is hidden in the error, offline-other-month and new-user states (section 6).
    - **With no selection (docked only), a summary:** "This month" and the month; "Compared with September", three rows each with a note:
        - "Budgeted spending" 13,168.00, "5,069.00 more than September";
        - "Limits" 11,000.00, "1,000.00 more than September · 4 Budgets, 3 in September" (the Budget counts only when they differ);
        - "Over or at limit" 3, "0 in September".

        Equal values read "Same as September". Then a box "How limits work": "A limit carries forward to every later month until you change it. Past months keep the limits they had.", "For a one-off, like a festival month, change the limit for one month only." and "Nearing limit starts at 80.0%. Over budget starts at 100.0%."; and the hint "Select a Budget to see its last 6 months and limit history. Up and down arrows move."

    - **With a selection:**
        1. A label (Budget, Not budgeted, or Not active this month), Close details, and the category.
        2. For a Budget: the spent as a large figure "of 5,000.00", "124.4% · Over by 1,220.00 · Over budget", any pending annotation, and the source as in BR-F04-16. Otherwise "2,148.00 spent in October, no limit", or the Not active caption.
        3. The Undo notice, when it is about this Budget.
        4. **"Last 6 months"** ending at M: a bar per month with a dashed line at that month's limit and the spending above it in the over color, captioned "Dashed line: the limit in force that month. Red: spent above it." when any month has a limit; "View as table" switches to a table of Month, Limit ("No Budget" when none), Spent and Used, and "View as chart" back.
        5. **"Limit history"**, for a Budget record, newest first: each schedule entry ("5,000.00 from Oct 2026", "Stopped from Nov 2026") and each one-month limit ("8,000.00 in Oct 2026 only", "No limit in Oct 2026 only", with "One month" and Remove). The item that decides M's limit is bold, with "In force in October". A pending change shows first (M5). The list ends with "No Budget before Sep 2026".
        6. **"Where it went in October"**, when M has spending: the top 3 payees by net spending, each with its avatar and amount, then "See 4 Transactions" (BR-F04-17). The data is F03's `GET /api/transactions/summary` with `by=payee`, `cat`, `from` and `to`; its `count` gives the number.
        7. **Actions:** for a Budget, Change limit, Stop and Delete; for Not budgeted, Add a Budget or Change limit as BR-F04-15 says; for Not active, Change limit and Delete. A hint below reads "L to change limit · Up and down arrows move · Esc to close" ("L to change limit" only for a Budget).
- **BR-F04-31** Pressing a state count filters the list to that state, with At limit and Over budget kept apart. A chip "Showing Over budget" with a remove button and a "Show all" link appear above the list, and the Not budgeted and Not active groups hide. With no rows: "No Budgets are over budget in October 2026." (or "are at their limit", "are nearing their limit", "are on track") with Show all Budgets. Pressing the count again, or changing the month, clears the filter.
- **BR-F04-32** Keyboard on the page, outside text fields and dialogs and without modifier keys:
    - Up and Down move the selection through the visible rows in list order and focus the row;
    - Escape clears the selection and closes the month grid;
    - L opens Change limit for a selected row with a Budget record;
    - N opens a new Transaction (F03).

**Server**

- **BR-F04-33** A restoring write puts a Budget back exactly as it was (D-561):
    - `PATCH { schedule, overrides, currency }` replaces both lists; `POST { id, category, schedule, overrides, currency }` creates a Budget with them.
    - The schedule must hold at least one entry with a limit, else 422. Months are valid `YYYY-MM` from 2000-01 to 2099-12 and are not range-checked (BR-F04-07), since they put back months that existed. Limits follow MON-5. One-month limits name distinct months.
    - The server applies BR-F04-05 to the schedule and stores the one-month limits as sent, in month order (section 3), so a restored Budget equals the one it replaces.
- **BR-F04-34** The month view (D-565) gives:
    - each budgeted row its `source` and `next` (section 3);
    - each unbudgeted category its `budgetId`, or `null` with no Budget record;
    - each Not active record a `status`: `starts` with `from`, the first entry's month ("Starts October 2026"); `stopped` with `from`, the stopping entry's month, and `restartsFrom`, the next entry with a limit or `null` ("Stopped from November 2026", or "Stopped from November 2026, starts again February 2027"); or `skipped`, a `null` one-month limit in M ("No limit for October 2026 only");
    - `previous`: `{ month, limitMinor, spentMinor, budgetCount, overCount }` for M − 1, where `overCount` counts the rows with the state `over`, At limit included. With no Budget in M − 1, every figure is 0.
- **BR-F04-35** Two reads serve the panel and the month grid (D-565):
    - **History:** `GET /api/budgets/history?category=c&to=YYYY-MM&months=n` returns n months ending at `to`, oldest first, each `{ month, limitMinor, spentMinor }`, with `limitMinor` `null` in a month with no limit. `months` is 1 to 49 (default 6), enough for any preview (BR-F04-26). `to` must be in the range (BR-F04-07); `category` must be an expense category, with or without a Budget record. Months before any Transaction return `spentMinor` 0.
    - **Year summary:** `GET /api/budgets/summary?year=YYYY` returns the 12 months of the year, each `{ month, utilizationTenths }`, the overall utilization or `null` in a month with no Budget. `year` must hold at least one month of the range. Months outside the range are still computed; the grid disables them.

    Both read through `budgetMonths`, so their figures match the month view.

- **BR-F04-36** A write that leaves the schedule and one-month limits as they were returns 200 with the Budget and does not bump `version`. Checks of the body itself (its shape, `currency` and month range) come first; the `If-Match` check comes before any rule that reads the stored Budget, so a stale version is 409 even for a write that would change nothing, or a stop that would remove every month.

## 5. Calculations

Formulas: section 3 and BR-F04-08 to BR-F04-11. Every figure below is from [03-golden-dataset.md](../03-golden-dataset.md#budgets).

| Month     | Category       | Limit    | Spent                     | Utilization | State                               |
| --------- | -------------- | -------- | ------------------------- | ----------- | ----------------------------------- |
| September | food           | 6,000.00 | 5,050.00                  | 84.2%       | Nearing limit                       |
| September | shopping       | 3,000.00 | 2,400.00                  | 80.0%       | Nearing limit (exact boundary)      |
| September | entertainment  | 1,000.00 | 649.00                    | 64.9%       | On track                            |
| October   | food           | 5,000.00 | 6,220.00                  | 124.4%      | Over budget                         |
| October   | shopping       | 3,000.00 | 3,000.00                  | 100.0%      | `over`, labeled At limit (boundary) |
| October   | entertainment  | 1,000.00 | 2,148.00                  | 214.8%      | Over budget                         |
| October   | transportation | 2,000.00 | 1,800.00                  | 90.0%       | Nearing limit                       |
| November  | food           | 5,000.00 | 420.00, "+300.00 pending" | 8.4%        | On track                            |

| Month     | Overall                        | Unbudgeted                                  | Total spending | Previous month                                      |
| --------- | ------------------------------ | ------------------------------------------- | -------------- | --------------------------------------------------- |
| September | 8,099.00 of 10,000.00, 81.0%   | 19,950.00 (housing, health, transportation) | 28,049.00      | August: 0.00 of 0.00, 0 Budgets, 0 over             |
| October   | 13,168.00 of 11,000.00, 119.7% | 18,000.00 (housing)                         | 31,168.00      | September: 8,099.00 of 10,000.00, 3 Budgets, 0 over |
| November  | 420.00 of 11,000.00, 3.8%      | 18,000.00 (housing)                         | 18,420.00      | October: 13,168.00 of 11,000.00, 4 Budgets, 3 over  |

**The October page.**

- Needs attention · 4: entertainment 214.8%, food 124.4%, shopping 100.0% (At limit), transportation 90.0%, with "2,368.00 over in total" (1,148.00 + 1,220.00).
- Not budgeted · 1: housing 18,000.00, with Add a Budget.
- The overview reads "of 11,000.00 · 119.7% · Over by 2,168.00"; the counts are Over budget 2, At limit 1, Nearing limit 1, On track 0.
- The summary panel: "5,069.00 more than September", "1,000.00 more than September · 4 Budgets, 3 in September", and Over or at limit 3, "0 in September".
- Food's panel: "Where it went in October" lists BigBasket 2,900.00, Zomato 2,300.00 and Swiggy 1,020.00, then "See 4 Transactions". Its source reads "5,000.00 from Oct 2026"; in September it reads "6,000.00 from Sep 2026, then 5,000.00 from Oct 2026".

**The September page.** Needs attention · 2 (food, shopping) with "1,550.00 left"; On track · 1 (entertainment) with "351.00 left"; Not budgeted · 3: housing 18,000.00 and health 1,500.00 with Add a Budget, transportation 450.00 with Change limit; Not active this month · 1: transportation, "Starts October 2026".

**Rounding at the boundary.**

- A limit of 3,000.00 with 2,398.50 spent gives `round(239850 × 1000 ÷ 300000)` = `round(799.5)` = 800, so it reads 80.0% and is Nearing limit.
- With 2,398.49 spent: 799.497 rounds to 799, so it reads 79.9% and is On track.

**A retroactive change.** On golden, set food to 7,000.00 from 2026-09:

- The schedule becomes `[{ 2026-09, 7,000.00 }]`, since the October entry is replaced.
- The preview lists 3 cards: September 6,000.00 → 7,000.00, "84.2% Nearing limit → 72.1% · On track"; October 5,000.00 → 7,000.00, "124.4% Over budget → 88.9% · Nearing limit"; November 5,000.00 → 7,000.00, "6.0% · On track"; then "Dec 2026 onward" at 7,000.00.
- The notes: "This also changes September and October 2026." and "This replaces the change to 5,000.00 from October 2026."

**A long change.** Set shopping to 4,000.00 from 2023-11, the earliest month:

- The preview covers 37 months, November 2023 to November 2026, as a strip and 4 groups: "Nov 2023 to Aug 2026", 34 months, No Budget → 4,000.00, "No Shopping spending · On track"; September 2026, 3,000.00 → 4,000.00, "80.0% Nearing limit → 60.0% · On track"; October 2026, "100.0% At limit → 75.0% · On track"; November 2026, "No Shopping spending · On track".
- The notes: "This also changes November 2023 to October 2026.", "Shopping gets a Budget in 34 months that had none." and "This replaces the change to 3,000.00 from September 2026."

**Stopping.** Stop entertainment from 2026-11:

- November has no entertainment Budget.
- September and October keep 1,000.00.
- November overall reads 420.00 of 10,000.00, 4.2%.

**One-month limits.**

- **Raised for one month:** set food to 8,000.00 for 2026-10 only. October food reads 6,220.00 of 8,000.00, 77.8%, On track, with the source "One-month limit for Oct 2026"; October overall is 13,168.00 of 14,000.00, 94.1%, Nearing limit. September and November are unchanged, and the schedule too.
- **Kept by a later schedule change:** with that one-month limit, set food to 7,000.00 from 2026-09. September reads 72.1%, October keeps 8,000.00 at 77.8%, November reads 6.0%; the preview's October card reads "Keeps its one-month limit", and the note "October 2026 keeps its one-month limit." shows.
- **Removed for one month:** stop entertainment for 2026-10 only. October's overall is 11,020.00 of 10,000.00, 110.2%, Over budget; unbudgeted is 20,148.00 (housing, entertainment); entertainment is Not active, "No limit for October 2026 only".
- **Equal to the schedule:** setting food to 5,000.00 for 2026-11 only stores nothing, and the dialog says "Food already has this limit in November 2026. Nothing changes."

**History and year summary.**

- Food, `to=2026-11`, 6 months: June, July and August with no limit and 0.00; September 6,000.00 and 5,050.00; October 5,000.00 and 6,220.00; November 5,000.00 and 420.00.
- Transportation, `to=2026-10`, 2 months: September with no limit and 450.00; October 2,000.00 and 1,800.00.
- 2026: January to August `null`; September 810; October 1197; November 38; December 0 (the limits carry forward and nothing is spent).

## 6. Screens and states

**`/budgets?month=YYYY-MM`.** BR-F04-14 to BR-F04-18 and BR-F04-30 to BR-F04-31. Dialogs: BR-F04-19 to BR-F04-21 and BR-F04-28 to BR-F04-29.

| State            | What the user sees                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading          | A skeleton overview, three skeleton rows, and a skeleton panel                                                                                                                                                                             |
| Empty            | No Budget in M: "No Budgets for September 2026." and "Budgets apply from the month you choose." with Add a Budget, in place of the overview. The Not budgeted and Not active groups still show                                             |
| New user         | No Budget record and no spending in M: only that message and Add a Budget; no panel                                                                                                                                                        |
| Filtered empty   | BR-F04-31                                                                                                                                                                                                                                  |
| Error            | "Budgets could not be loaded." and "Check your connection, then try again. Your Budgets are safe." with Retry; no panel                                                                                                                    |
| Offline          | The cached current month with "as of 14:05". Other months: "You're offline. This month isn't saved on this device." and "Only November 2026 is kept for offline use." with "Go to November"; no panel. Before M5, Save is disabled (D-241) |
| Save fails       | Before M5: the dialog stays open with "The Budget could not be saved. Check your connection and try again. Your changes are still here."; a delete: "The Budget could not be deleted. Check your connection and try again."                |
| Pending          | From M5: BR-F04-12                                                                                                                                                                                                                         |
| Locked (Premium) | None: Budgets have no gating (section 9)                                                                                                                                                                                                   |
| Read-only        | None: demo Budgets are editable like any other                                                                                                                                                                                             |

Below 700 px the dialogs open as sheets with 44 px targets.

## 7. Flows

**7.1 Add a Budget**

1. On `/budgets`, the user selects Add a Budget, picks Health, types 1,500 and keeps "This month (November)".
2. The preview shows November; the button reads "Add Budget from November".
3. `POST /api/budgets`; the row appears with "Health Budget added: 1,500.00 from November 2026." and Undo.
4. **409 `budget_exists`** (another device created it): "A Health Budget already exists. We opened it so you can change it." and the existing Budget opens in Change limit.
5. **422:** field messages.

**7.2 Change a limit from a past month**

1. The user changes Food to 7,000 and picks September 2026 from Other month.
2. The preview and notes show the three months and the replaced entry (section 5); the user selects "Change from September".
3. `PATCH` with `If-Match`. **409:** the conflict view shows both schedules (BR-F04-23).
4. **Success:** September and October re-render with the new limit, with "Food limit is now 7,000.00 from September 2026." and Undo.

**7.3 One month only**

1. On October, the user selects Food, then Change limit, types 8,000, chooses One month only and keeps "October (viewing)". The option reads "November goes back to 5,000.00".
2. The preview shows September (Unchanged), October (5,000.00 → 8,000.00, "124.4% Over budget → 77.8% · On track") and November (Back to the schedule).
3. `PATCH { month: "2026-10", limitMinor: 800000, currency, scope: "month" }`; the panel shows "Food limit is 8,000.00 for October 2026 only." with Undo, and the limit history gains "8,000.00 in Oct 2026 only".
4. Remove on that history item sends `DELETE /api/budgets/[id]/overrides/2026-10`.

**7.4 Stop budgeting**

1. The user stops Entertainment from November 2026.
2. `PATCH { from: "2026-11", limitMinor: null }`.
3. The November row disappears; Entertainment moves to Not budgeted if it has spending, and to Not active.

**7.5 Delete.** The user confirms BR-F04-06's text. `DELETE` with `If-Match`; every month loses the Budget. "Food Budget deleted." shows above the list with Undo, which re-creates it with its schedule and one-month limits under a new id.

**7.6 Drill down.** On October, the user selects Food, then "See 4 Transactions" in the panel, which opens `/transactions?from=2026-10-01&to=2026-10-31&cat=food`, whose header shows Out 6,220.00 (golden check B).

**7.7 Offline change (from M5)**

1. Offline, the user changes Food to 7,000 from December.
2. The row keeps 5,000.00 and shows "Limit changing to 7,000.00 from Dec 2026" with Pending sync.
3. On reconnect the change replays exactly once.
4. **409:** the conflict view. **404** (deleted elsewhere): rejected, with "This Budget was deleted on another device."

## 8. Validation and messages

| Field or action   | Rule                                | Message shown                                                                                    |
| ----------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Category          | Required                            | Choose a category.                                                                               |
| Category          | `budget_exists`                     | A Shopping Budget already exists. We opened it so you can change it.                             |
| Limit             | Required                            | Enter a limit.                                                                                   |
| Limit             | Other amount rules (F03, BR-F03-04) | F03's amount messages                                                                            |
| Apply from, Month | Within 36 months back and 12 ahead  | Choose a month from Nov 2023 to Nov 2027.                                                        |
| Stop from         | At or before the first entry        | This would remove every month. Delete the Budget instead.                                        |
| Any change        | Changes nothing                     | Food already has this limit from November 2026. Nothing changes.                                 |
| Notes             | Warnings, not errors                | BR-F04-27                                                                                        |
| Delete            | Confirmation                        | Delete the Food Budget? Every month, including past ones, loses its Food limit.                  |
| Save              | Network failure before M5           | The Budget could not be saved. Check your connection and try again. Your changes are still here. |
| Delete            | Network failure before M5           | The Budget could not be deleted. Check your connection and try again.                            |
| Any write         | `version_conflict`                  | This Budget was changed on another device. (Conflict view)                                       |
| Any write         | `not_found`                         | This Budget was deleted on another device.                                                       |
| Page              | Load failure                        | Budgets could not be loaded. Check your connection, then try again. Your Budgets are safe.       |
| Month link        | Invalid or out-of-range `month`     | Some filters in this link weren't valid and were removed.                                        |
| Filtered list     | No rows in the chosen state         | No Budgets are over budget in October 2026.                                                      |

## 9. Plan gating

None. Every Budget feature, one-month limits included, is on both plans (D-560); the `budgets.monthOverride` flag is removed.

## 10. Offline behavior

- **Readable:** the current month's Budgets, persisted (root 7.3), shown with "as of". The history and year summary are not kept: offline, Last 6 months and the month grid show no figures, and the preview shows each month's old and new limit without spending or states.
- **Writable:** create, change, one-month limits, stop, delete and restoring writes queue (D-46, P1). The row shows pending annotations; states and figures stay confirmed-only (BR-F04-12). Undo of a change not yet sent removes it from the queue; once sent, Undo queues a restoring write (BR-F04-33).
- **Replay outcomes:** 409 `version_conflict` opens the conflict view. `budget_exists` is rejected with Edit, which opens the existing Budget. 404 on a change is rejected; a 404 on a delete counts as done (D-239).

## 11. Server surface

| Endpoint                              | Method | Input                                                                                                                                                                                                                                                                          | Output                                                                   | Errors                                                                                         | Idempotency and versioning                |
| ------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `/api/budgets`                        | GET    | `month` (default: the current month; within the range, BR-F04-07)                                                                                                                                                                                                              | The month view (section 15)                                              | 400, 401, 403 `profile_required`                                                               | Read                                      |
| `/api/budgets`                        | POST   | `{ id, category, from, limitMinor, currency }`, or a restoring `{ id, category, schedule, overrides, currency }` (BR-F04-33)                                                                                                                                                   | 201 with the Budget; 200 with the existing row for a repeated id (API-5) | 401, 403, 409 `budget_exists`, 409 `id_conflict`, 422 `validation_failed`, `currency_mismatch` | `Idempotency-Key` required                |
| `/api/budgets/[id]`                   | PATCH  | One of: `{ from, limitMinor, currency }` (from a month onward); `{ month, limitMinor, currency, scope: "month" }` (one month); `{ schedule, overrides, currency }` (restoring). `limitMinor` may be `null`; `currency` is required whenever the body holds a limit (BR-F04-22) | 200 with the Budget                                                      | 401, 403, 404, 409 `version_conflict`, 422                                                     | `Idempotency-Key` and `If-Match` required |
| `/api/budgets/[id]`                   | DELETE | `{}`                                                                                                                                                                                                                                                                           | 204                                                                      | 401, 403, 404, 409 `version_conflict`                                                          | `Idempotency-Key` and `If-Match` required |
| `/api/budgets/[id]/overrides/[month]` | DELETE | `{}`                                                                                                                                                                                                                                                                           | 200 with the Budget                                                      | 401, 403, 404 (also when the month has no one-month limit), 409 `version_conflict`             | `Idempotency-Key` and `If-Match` required |
| `/api/budgets/history`                | GET    | `category`, `to`, `months` (BR-F04-35)                                                                                                                                                                                                                                         | `{ category, currency, months: [{ month, limitMinor, spentMinor }] }`    | 400, 401, 403 `profile_required`                                                               | Read                                      |
| `/api/budgets/summary`                | GET    | `year` (BR-F04-35)                                                                                                                                                                                                                                                             | `{ year, months: [{ month, utilizationTenths }] }`                       | 400, 401, 403 `profile_required`                                                               | Read                                      |

**Error code added by this spec**

| Status | Code            | Default message                            | Write queue does                              |
| ------ | --------------- | ------------------------------------------ | --------------------------------------------- |
| 409    | `budget_exists` | A Budget for this category already exists. | Reject, with Edit opening the existing Budget |

**Shared functions.**

- `budgetMonth(tx, ctx, month)` returns the month view, in one statement.
- `budgetMonths(tx, ctx, months)` returns several months' views, in one statement, for F09's Budget vs actual, the history and the year summary.
- `previewChange({ rules, change, spending, current })`, in `src/lib/budgets`, returns the months, groups and notes of BR-F04-26 and BR-F04-27.

F08's widget, F09's chart, F10's threshold detector and F11's report all call the first two, so their figures cannot disagree.

## 12. Cross-feature effects

- **A confirmed Budget write** invalidates the Budgets month views, history and year summary, the whole dashboard prefix (F08, D-295), Analytics (F09), Insights (F10) and the demo status (F15).
- **A confirmed Transaction write** invalidates the Budgets views, history and year summary for its months (F03, section 12).
- **F08** shows the top 5 Budgets by utilization; **F09** charts budget against actual (Premium); **F10** raises the 80% and 100% insights; **F11** reports budget against actual. One-month limits count wherever a month's limit does.
- **F01 reset and F15 removal** delete Budgets.
- **F02's currency lock** counts Budgets: with any Budget, the currency is no longer editable.

## 13. Edge cases

- **A Budget that starts after M:** listed under Not active this month as "Starts December 2026", and not counted in M.
- **Stopped, then restarted:** stopped from November and set again from February gives `[…, { 2026-11, null }, { 2027-02, 4,000.00 }]`. December and January have no Budget; November reads "Stopped from November 2026, starts again February 2027".
- **A one-month limit in a stopped month:** setting 1,500.00 for December only while stopped from November gives December a Budget and leaves November and January without one.
- **A one-month limit before the first entry:** allowed on a Budget record; that month gets a Budget, and the limit history lists it above "No Budget before".
- **A schedule change that matches a one-month limit:** the one-month limit stays (BR-F04-25); Remove in the limit history clears it.
- **Refunds exceed expenses in a budgeted category:** spent is negative, so utilization is negative and the state is On track. The overall figure falls by that amount.
- **A Subscription charge** in a budgeted category counts like any expense (D-33).
- **Two devices create a Food Budget offline:** the second replay gets `budget_exists`, and its sync item offers Edit on the existing Budget.
- **Editing while another device stops the Budget:** the second write gets 409 with the stopped schedule.
- **Undo after another device changed the Budget:** the restoring `PATCH` gets 409 and opens the conflict view.
- **Undo after a delete:** the Budget comes back under a new id, so links to the old id answer 404.
- **A month with no spending and no Budgets:** only the empty message and Add a Budget.
- **Currency after reset:** Reset deletes Budgets (F01), so no limit outlives a currency change.

## 14. Acceptance criteria

- **AC-F04-01** (integration) `budgetMonth` on the golden dataset returns every limit, spent, utilization and state in section 5, including the exact 80.0% and 100.0% boundaries, for September, October and November, with each row's `source` and `next`.
- **AC-F04-02** (integration) Overall, unbudgeted and total spending match section 5. Budgeted plus unbudgeted equals total spending for every month.
- **AC-F04-03** (integration) Setting food to 7,000.00 from 2026-09 gives 72.1% in September and 88.9% in October, and removes the October entry.
- **AC-F04-04** (integration) Stopping entertainment from 2026-11 leaves September and October unchanged and gives November overall 4.2%. Stopping it from 2026-09, its first month, returns 422.
- **AC-F04-05** (unit) Normalization: setting 5,000.00 from 2026-11 on a schedule already at 5,000.00 adds no entry; a leading `null` is removed.
- **AC-F04-06** (unit) Utilization tenths: 239850 of 300000 gives 800 (`warning`); 239849 gives 799 (`ok`); a negative spent gives a negative value and `ok`.
- **AC-F04-07** (client integration, M5) With P1 pending, November food shows 8.4%, "+300.00 pending" and On track, and no insight fires.
- **AC-F04-08** (integration) A second create for `food` returns 409 `budget_exists` with the existing Budget, whether it arrives after the first or at the same moment.
- **AC-F04-09** (integration) A `PATCH` with a stale `If-Match` returns 409 with the current schedule and one-month limits.
- **AC-F04-10** (E2E) Selecting the October Food row, then "See 4 Transactions", opens a Transactions list whose header Out is 6,220.00.
- **AC-F04-11** (integration) A change or one-month limit 37 months back, or 13 months ahead, returns 422; `GET /api/budgets` with such a `month` returns 400, and with 2023-11 or 2027-11 returns 200.
- **AC-F04-12** (accessibility) The list, the table, the panel and the dialogs pass axe with no serious or critical violations. Each state is announced in text, and the page and dialogs work by keyboard alone.
- **AC-F04-13** (integration) For golden September:
    - transportation appears under Not budgeted (450.00) with its `budgetId`, and under Not active this month with `status: "starts"` and `from: "2026-10"`;
    - Add a Budget for transportation sends `PATCH`, not `POST`.
- **AC-F04-14** (integration) Setting food to 8,000.00 for 2026-10 only gives October food 77.8% On track with an `override` source and October overall 94.1% Nearing limit, and leaves the schedule, September and November unchanged.
- **AC-F04-15** (integration) Stopping entertainment for 2026-10 only gives October overall 110.2% Over budget, unbudgeted 20,148.00 (housing, entertainment), and entertainment as Not active with `status: "skipped"`.
- **AC-F04-16** (unit) One-month normalization: 5,000.00 for 2026-11 on golden food stores nothing; with 8,000.00 for 2026-10 stored, setting 7,000.00 from 2026-09 keeps it, giving 72.1%, 77.8% and 6.0% for September to November.
- **AC-F04-17** (integration) `DELETE /api/budgets/[id]/overrides/2026-10` removes that one-month limit and returns the Budget with a new version; a month without one returns 404; a stale `If-Match` returns 409.
- **AC-F04-18** (integration) A restoring `PATCH` puts back golden food's schedule and one-month limits exactly; a restoring `POST` with a new id re-creates a deleted Budget whose month views equal the originals; a restoring write whose schedule has no limit returns 422.
- **AC-F04-19** (integration) October's `previous` is September: 8,099.00 of 10,000.00, 3 Budgets, 0 over. November's is October: 13,168.00 of 11,000.00, 4 Budgets, 3 over.
- **AC-F04-20** (integration) The history returns section 5's food and transportation months, and for health, which has no Budget record, `to=2026-10` with 2 months gives September with no limit and 1,500.00, and October with no limit and 0.00; `months=50`, `months=0`, a `to` outside the range or an income category returns 400.
- **AC-F04-21** (integration) The 2026 year summary returns section 5's values; `year=2022` returns 400.
- **AC-F04-22** (unit) `previewChange` returns section 5's retroactive and long changes: their months, groups, state texts and notes.
- **AC-F04-23** (unit) Labels: 1000 tenths reads At limit, 1001 Over budget, 999 Nearing limit; At limit counts in `overCount`.
- **AC-F04-24** (integration) A `PATCH` that changes nothing returns 200 and keeps `version`; the same `PATCH` with a stale `If-Match` returns 409.
- **AC-F04-25** (client integration, MSW) Undo after a create sends `DELETE` with version 1; after a change, a restoring `PATCH` with the version the change returned; after a delete, a restoring `POST` with a new id. A 409 opens the conflict view.
- **AC-F04-26** (client integration) The state counts filter the list and show BR-F04-31's chip and empty text; changing the month clears the filter.
- **AC-F04-27** (integration) With golden food's schedule changed to `[{ 2026-09, 6,000.00 }, { 2026-11, null }, { 2027-02, 4,000.00 }]`, December 2026 lists food as Not active with `status: "stopped"`, `from: "2026-11"` and `restartsFrom: "2027-02"`.
- **AC-F04-28** (integration) A restoring write with an entry from 2001-01 is accepted; one whose one-month limits repeat a month returns 422; any write whose `currency` differs from the profile's returns 422 `currency_mismatch`.

## 15. Illustrations

Illustrative, `GET /api/budgets?month=2026-10` on golden (one Budget row shown):

```json
{
	"month": "2026-10",
	"currency": "INR",
	"overall": {
		"limitMinor": 1100000,
		"spentMinor": 1316800,
		"utilizationTenths": 1197,
		"state": "over"
	},
	"totalSpentMinor": 3116800,
	"unbudgetedMinor": 1800000,
	"unbudgeted": [
		{ "category": "housing", "spentMinor": 1800000, "budgetId": null }
	],
	"budgets": [
		{
			"id": "0192…",
			"category": "food",
			"limitMinor": 500000,
			"spentMinor": 622000,
			"remainingMinor": -122000,
			"utilizationTenths": 1244,
			"state": "over",
			"source": {
				"kind": "schedule",
				"from": "2026-10",
				"limitMinor": 500000
			},
			"next": null,
			"schedule": [
				{ "from": "2026-09", "limitMinor": 600000 },
				{ "from": "2026-10", "limitMinor": 500000 }
			],
			"overrides": [],
			"version": 2,
			"demo": false
		}
	],
	"inactive": [],
	"previous": {
		"month": "2026-09",
		"limitMinor": 1000000,
		"spentMinor": 809900,
		"budgetCount": 3,
		"overCount": 0
	}
}
```

Illustrative, an `inactive` entry, from golden September, where transportation starts in October:

```json
{
	"id": "0192…",
	"category": "transportation",
	"status": "starts",
	"from": "2026-10",
	"schedule": [{ "from": "2026-10", "limitMinor": 200000 }],
	"overrides": [],
	"version": 1,
	"demo": false
}
```

Illustrative, a one-month `PATCH` body and the row it gives in October:

```json
{ "month": "2026-10", "limitMinor": 800000, "currency": "INR", "scope": "month" }
```

```json
{
	"category": "food",
	"limitMinor": 800000,
	"spentMinor": 622000,
	"utilizationTenths": 778,
	"state": "ok",
	"source": { "kind": "override", "month": "2026-10", "limitMinor": 800000 }
}
```

Illustrative, a Budget row:

```text
[food icon] Food                                    Over by 1,220.00
[██████████████████████████████|▓▓▓▓▓▓▓▓]
6,220.00 of 5,000.00 · 124.4% · Over budget       5,000.00 from Oct 2026
```
