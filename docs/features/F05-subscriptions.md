# F05 Subscriptions

16 Oct 2026 · @Himanshu

A Subscription is any recurring bill the user tracks: streaming, rent, insurance, a loan EMI, a gym. It has an amount, a cadence and a start date. Daybook writes each due charge into Transactions as an expense, up to today, through catch-up. Spending and Budgets therefore include it exactly once. Future renewals are never stored; they are computed from the schedule.

The Subscriptions page shows the monthly cost, what this month has charged and still has to come, the next 30 days, and every Subscription grouped by when it is next due, as a list, a calendar or a table. A docked panel shows the selected Subscription's charges. A Subscription can be changed, paused, have one charge skipped, be cancelled, resumed or deleted. Every change takes effect after the day it was made (a resume from that day itself), even when it syncs days later or after another device has already added charges. Stripe is not involved: anything Stripe bills is Premium (NAM-1, D-27).

| Item       | Value                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Milestone  | M2. Before M5, writes are online only: Save is disabled offline with "You are offline. Connect to save.", a failed save keeps the dialog open, and the app calls the boot endpoint on each start and each return online, then refreshes what it changed (root 5.2, steps 5 and 6). From M5 the write queue (P1) adds offline writes, replayed (boot step 4) before the call (D-181, D-241) |
| Plan       | Free and Premium; no capability codes                                                                                                                                                                                                                                                                                                                                                      |
| Depends on | [F03](F03-transactions.md) (charges are Transactions), [F02](F02-onboarding-profile-settings.md) (time zone, today, week start), [P2](../platform/P2-data-access-and-security.md) (catch-up check, locks, request clock); P1 (write queue and boot sequence); F08, F10, F11, F13 read Subscriptions                                                                                        |
| Decisions  | D-26, D-27, D-70 to D-72, D-90 to D-96, D-181, D-213, D-219, D-224, D-236, D-239, D-241, D-244, D-250 to D-257, D-265, D-267, D-269, D-270, D-347, D-580, D-589 to D-612, D-617 to D-619                                                                                                                                                                                                   |

## 1. User stories

- As a user, I want to add a recurring bill once and have its charges appear in my Transactions on their due dates, without entering them every month.
- As a user adding a Subscription I have paid for years, I want to choose whether its past charges are added too, and be warned when they are already in Transactions.
- As a user, I want to see what my Subscriptions cost a month and a year, what this month has charged and still has to come, and what renews in the next 30 days.
- As a user, I want a calendar of every charge, past and coming, and a table I can sort.
- As a user whose price went up, I want the new price on charges after today while earlier ones keep theirs.
- As a user, I want to skip one charge, pause for a while, cancel from a date, or resume, without the app recreating what I removed.
- As a user, I want to undo a change I just made.
- As a user, I want to delete a Subscription and keep the charges that really happened.
- As a user who changed a Subscription offline, I want it to take effect from when I changed it, even if another device added charges before mine synced.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                                                                                                                                      | Stretch (M8)                            | Out                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create, edit, pause, skip, cancel, resume and delete; cadences of every 1 to 52 weeks or 1 to 24 months, with four presets (D-90); past-charge backfill on create; catch-up and the boot endpoint; charges as Transactions with tombstones; reconciling charges after a change; costs; this month's charges; upcoming renewals; next due dates; the list, calendar and table; the panel; inline Undo; charge drill-down; offline writes | Push reminders for renewals (D-144, P1) | Free trials (D-94); cadences in days, such as every 10 days (D-90); recurring income (D-72); scheduled future price changes; price history (costs use current amounts); restoring a skipped charge after its date has passed (add a manual expense instead); Undo after a delete (D-590); Stripe for Subscriptions (D-27); email or calendar reminders |

## 3. Concepts and fields

**Subscription** (private)

| Field                               | Meaning                                                    | Required | Rules                                                                                                                                                                                                                 | Example                           |
| ----------------------------------- | ---------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `id`                                | UUIDv7                                                     | Yes      | Client-generated (ID-1)                                                                                                                                                                                               |                                   |
| `name`                              | What it is                                                 | Yes      | 1 to 60 characters (root 6.7); the default payee of its charges (TXN-4); duplicates allowed                                                                                                                           | `Netflix`                         |
| `amountMinor`                       | The price of one charge                                    | Yes      | MON-5                                                                                                                                                                                                                 | `64900`                           |
| `cadence`                           | How often                                                  | Yes      | `{ unit, every }`: `unit` is `week` or `month`; `every` is 1 to 52 for weeks, 1 to 24 for months (D-90). Presets: weekly `{ week, 1 }`, monthly `{ month, 1 }`, every 3 months `{ month, 3 }`, yearly `{ month, 12 }` | `{ "unit": "month", "every": 1 }` |
| `startDate`                         | The date of the first charge; the schedule repeats from it | Yes      | From 10 years before to 1 year after the recording date (create) or the change date (edit) (D-257)                                                                                                                    | `2026-09-05`                      |
| `category`                          | An expense category (CAT-2)                                | Yes      | Copied to each new charge                                                                                                                                                                                             | `entertainment`                   |
| `note`                              | Optional text                                              | No       | Up to 500; not copied to charges                                                                                                                                                                                      |                                   |
| `endDate`                           | The last date a charge may fall on                         | No       | `null` while it runs; from `startDate` to 10 years after the change date                                                                                                                                              |                                   |
| `pause`                             | A stretch of due dates that are never charged              | No       | `{ from, until }` or `null`. Due dates d with `from ≤ d < until` are never charged (D-94, BR-F05-28)                                                                                                                  | `null`                            |
| `chargesFrom`                       | The first date catch-up may charge                         | System   | BR-F05-03, BR-F05-11, BR-F05-13, BR-F05-29                                                                                                                                                                            | `2026-09-05`                      |
| `lastChangeOn`                      | The change date of the last applied change                 | System   | The recording date on create; C after each change except a note-only one, a skip and an undone skip (D-267, D-596)                                                                                                    | `2026-09-05`                      |
| `demo`                              | Loaded as demo data                                        | System   | F15; its charges inherit it (D-234)                                                                                                                                                                                   | `false`                           |
| `version`, `createdAt`, `updatedAt` | P2                                                         | System   | `createdAt` is client-set on create, from 90 days before to 5 minutes after `ctx.now` (D-267)                                                                                                                         |                                   |

**`changedAt` and the change date C.** Every write after the create carries `changedAt`: the client instant when the user made the change. It must lie from 90 days before to 5 minutes after `ctx.now` (D-267). The change date C is computed in the profile time zone:

1. Take the later of `changedAt`'s date and `lastChangeOn`.
2. Never let it pass today.

A queued change therefore never reaches back past a change applied before it, and a skewed device clock cannot rewrite old history. Several changes queued on one device keep their own dates, because each sets `lastChangeOn` to its own C.

**Tombstone** (private, a child of a Subscription): `(subscriptionId, dueOn)`, shown to the user as a skipped charge. It is written when a charge is deleted (BR-F05-07) or when a future charge is skipped (BR-F05-26). Catch-up never charges a tombstoned date (D-93). A future one can be removed again until its date (BR-F05-27). The rest are deleted only together with their Subscription.

**Charge.** An expense Transaction with source `subscription`, `subscriptionId` and `dueOn` (F03). Its `edited` flag turns true the first time the user edits it (F03, BR-F03-16) and never turns back.

- **Repricing:** the server updates a charge only to reprice an unedited one (BR-F05-10, BR-F05-11), or, on request, to give unedited past charges a new name and category (BR-F05-30). That bumps `version` like any update, so an edit queued before it meets 409 and the conflict view.
- **Removal:** the server deletes a charge only by BR-F05-11, BR-F05-12, BR-F05-14, BR-F05-29 and BR-F05-34, and never an edited one.

**Derived values** (never stored)

| Value              | Meaning                                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Due dates          | `startDate` plus k periods, k = 0, 1, 2, … (BR-F05-01)                                                                                                                                  |
| Chargeable dates   | Due dates from `chargesFrom` to `endDate` (or without an end) that are not paused                                                                                                       |
| Next due           | The earliest chargeable date on or after today with no charge and no tombstone (BR-F05-19)                                                                                              |
| Status             | First match of: `ended` (`endDate` on or before today), `upcoming` (`startDate` after today), `paused` (a `pause` whose `until` is after today), `ending` (`endDate` set), `active`     |
| Yearly cost        | `amountMinor` × 52 ÷ `every` for weeks, × 12 ÷ `every` for months; for the presets × 52, 12, 4 or 1 (BR-F05-16)                                                                         |
| Monthly equivalent | Yearly cost ÷ 12, rounded half away from zero, for display                                                                                                                              |
| This month         | Charged: Out for `src=subscription` in the current month. Still to come: the current month's remaining chargeable dates with no charge and no tombstone, at current amounts (BR-F05-18) |

## 4. Business rules

**Schedules (TIME-9, D-90)**

- **BR-F05-01** Due date k is always computed from `startDate`, never from the previous due date. It uses `src/lib/subscriptions`, which the server and the browser both use:
    - **every N weeks:** `startDate` + 7 × N × k days;
    - **every N months:** `startDate` + N × k months.

    The presets are every 1 week, every 1 month, every 3 months and every 12 months. Month arithmetic keeps the start's day of month and clamps it to each month's length, through date-fns `addMonths` from the start.

    | Start      | Cadence        | First due dates                                            |
    | ---------- | -------------- | ---------------------------------------------------------- |
    | 2026-01-31 | monthly        | 2026-01-31, 2026-02-28, 2026-03-31, 2026-04-30             |
    | 2028-02-29 | yearly         | 2028-02-29, 2029-02-28, 2030-02-28, 2031-02-28, 2032-02-29 |
    | 2026-11-30 | every 3 months | 2026-11-30, 2027-02-28, 2027-05-30, 2027-08-30             |
    | 2026-10-12 | yearly         | 2026-10-12, 2027-10-12                                     |
    | 2026-01-31 | every 2 months | 2026-01-31, 2026-03-31, 2026-05-31, 2026-07-31             |
    | 2026-08-31 | every 5 months | 2026-08-31, 2027-01-31, 2027-06-30, 2027-11-30             |
    | 2026-10-01 | every 2 weeks  | 2026-10-01, 2026-10-15, 2026-10-29, 2026-11-12             |

**Charges and catch-up (JOB-1, JOB-2)**

- **BR-F05-02** Catching a Subscription up through date D creates one charge for each chargeable date d where d is on or before D, d is on or before today, and (Subscription, d) has neither a charge nor a tombstone. Paused dates are never chargeable (BR-F05-28). Each charge has:
    - **The basics:** type `expense`, and the Subscription's current amount, category and name (as payee).
    - **Dates:** `dueOn` and `occurredOn` are d, and `occurredAt` is 00:00 on d in the profile time zone (TIME-6). Where midnight does not exist on a daylight-saving day, it moves forward by the gap (F03, BR-F03-06).
    - **System fields:** source `subscription`, `edited` false, the Subscription's `demo` flag, `createdAt` and `updatedAt` both `ctx.now`, and a server-generated UUIDv7 id.

    The dates are computed with `src/lib/subscriptions` and inserted in one statement with `ON CONFLICT DO NOTHING` and no target, against the unique key on user, Subscription and due date (D-598), so catch-up is idempotent.

- **BR-F05-03** On create, `chargesFrom` depends on the past-charges choice (D-91, D-250):
    - **"Yes, add … past charges":** `startDate`;
    - **"No, start with the next one" (the default):** the later of `startDate` and the recording date. The recording date is `createdAt`'s date in the profile time zone, never later than today.

    `lastChangeOn` is the recording date. Golden: each Subscription was created on its start date without backfill, so `chargesFrom` equals `startDate` and the first charge falls on the start date.

- **BR-F05-04** The past-charges choice appears only on create, and only when `startDate` has due dates before the recording date. It is a pair of choices under "Netflix started 14 months before today. Add the charges from before?" (days below 60 days, else months as days ÷ 30.44, rounded; "1 day" for one; "This Subscription" while the name is empty):
    - **"No, start with the next one"** (chosen by default), described "First charge: Thu 5 Nov 2026. Pick this if the past payments are already in Transactions, or you don't need them.";
    - **"Yes, add 14 past charges, 9,086.00"**, described "One expense on each due date, from 5 Sep 2025 to 5 Oct 2026. They count in those months' spending, Budgets and reports." (one date: "Yes, add 1 past charge, 649.00", described "One expense on 5 Oct 2026. They count in those months' spending, Budgets and reports."). The total is left out while the amount is not valid.

    The count and total are computed in the browser from the schedule. When expenses whose payee equals the name, ignoring case, already fall from the start date up to yesterday, a note follows: "You already have 2 Netflix expenses in that period, on 5 Sep, 5 Oct. Adding past charges would count them twice." For one: "You already have 1 Netflix expense in that period, on 5 Sep. Adding past charges would count it twice." It names up to three dates, oldest first, then "and more", and shows under either choice while the name is not empty. The browser reads them as BR-F05-48 says.

- **BR-F05-05** Catch-up runs at three moments (JOB-1). Each run locks the profile, then each Subscription it covers with `FOR UPDATE` in id order (SRV-7, JOB-2). The lock and the read of the Subscription, its charges and its tombstones are two statements, so a run sees what the writer it waited for committed (D-605).
    - **Lazy:** once a day before reads and writes (P2, BR-P2-14), for every Subscription, through today. It is skipped while the device's queue holds pending or in-flight Subscription items (D-244).
    - **Boot:** `POST /api/sync/catch-up` (BR-F05-06), for every Subscription, through today.
    - **On change:** inside the create's or change's own transaction, for that Subscription only (BR-F05-08).
- **BR-F05-06** The boot endpoint (D-256):
    - **Skipped:** when the request carries `Daybook-Queue: pending` or the `daybook_queue` cookie (P1), it returns `{ skipped: true, chargesCreated: 0, pricesUpdated }` without doing anything else. `pricesUpdated` still reports the wrapper's daily pass, which runs whatever the header. Queued Subscription changes always land first (D-181, D-244).
    - **Otherwise,** it runs one write transaction:
        1. `UPDATE app.profile SET last_catch_up_on = greatest(last_catch_up_on, <today>)` for the user. This takes the profile lock (SRV-7).
        2. Lock every Subscription of the user with `FOR UPDATE`, in id order.
        3. Catch each one up through today.

        The global daily pass is not part of it: the route wrapper runs it before any request when it is due (P2, BR-P2-27). `pricesUpdated` is true when this request's pass wrote prices.

    - **Contract:** it needs a profile, is exempt from `Idempotency-Key` (API-3) and declares `catchUp: false`.
    - **Response:** `{ skipped, chargesCreated, pricesUpdated }`. The client invalidates affected queries when `chargesCreated` is above zero or `pricesUpdated` is true (root 5.2). When an earlier lazy check already did the work (for example, the first page was rendered on the server), the endpoint returns zeros.
- **BR-F05-07** Deleting a single charge writes its tombstone in the same transaction, under the Subscription lock (F03, BR-F03-17; D-93, D-236), so the charge is never recreated. The tombstone raises the Subscription's version, not `lastChangeOn` (D-607). Golden: the Cult Gym charge for 2026-10-10 is a tombstone, and October's charges total 20,148.00.

**Changes: one order for every change (D-250)**

- **BR-F05-08** Every change runs in one write transaction, in this order:
    1. **Lock and check:** take the profile lock, then lock the Subscription with `SELECT ... FOR UPDATE` and compare `If-Match` (SRV-7). A mismatch returns 409 before anything is written.
    2. **Close the old period:** catch the Subscription up through C, with its values from before the change. The change date itself always belongs to the old values. When the change sets an end date or moves it earlier, this step stops at the earlier of C and the new end date, so it never creates a charge that step 3 would delete. When the change extends a pause over C (only Undo of Resume now does, BR-F05-34), it stops the day before C, and C follows the new values.
    3. **Apply:** apply the change and its charge rule (BR-F05-09 to BR-F05-14, BR-F05-29 to BR-F05-32), then set `lastChangeOn` to C (BR-F05-09 excepted).
    4. **Open the new period:** catch it up through today with its new values. A delete skips this step.

    Charges through C follow the old values, and charges after C follow the new ones, whatever other devices did in between. The response carries `changeDate`, the counts `chargesCreated`, `chargesUpdated` and `chargesDeleted`, and `months`: every month whose charges changed, so the client can invalidate exactly those months.

- **BR-F05-09** A change to `note` alone changes no charge and does not move `lastChangeOn`.

**Value and schedule changes (D-92, D-250)**

- **BR-F05-10** A change to `amountMinor`, `name` or `category` applies to charges due after C (D-92: future charges only). A charge that already holds the new values is left as it is: its `version` does not rise and `chargesUpdated` does not count it.
    - **The update:** step 3 reprices the unedited charges due after C in place, in one statement: `UPDATE ... SET amount, category, payee, version = version + 1, updated_at = <ctx.now> WHERE subscription_id = $1 AND due_on > C AND NOT edited` (P2, BR-P2-21 and BR-P2-43). Ids stay the same, so tombstones, queued edits and caches keep pointing at the right rows.
    - **Kept as they were:** edited charges, and charges through C, unless the user asks for past names and categories to change too (BR-F05-30).
    - **Example:** a change made offline on 4 November reprices the 5 November charge, even if another device created it before the change synced.
- **BR-F05-11** A change to `startDate` or `cadence` does two things:
    - **`chargesFrom`:** it becomes the new `startDate` if that is after C, and otherwise the day after C. The change date always keeps the old schedule.
    - **Unedited charges due after C:** those on a due date of the new schedule, from the new `chargesFrom`, are kept and repriced if values changed too. The rest are deleted.
    - **Tombstones after C** that are not due dates of the new schedule are deleted; those through C stay.

    Step 4 creates the new schedule's other charges. Charges through C, and edited charges, stay. When the new schedule's first charge falls less than one period after the last charge, the dialog offers to skip it (BR-F05-31).
    - **An upcoming Subscription:** created on 2 November to start 5 December, then moved on 3 November to 1 December, gets `chargesFrom` 1 December.

**End dates, cancel and resume (D-94, D-251)**

- **BR-F05-12** Cancelling sets `endDate`; the Cancel dialog (BR-F05-41) offers today, the next due date, a later date, or a date from `startDate` to yesterday. An upcoming Subscription offers Delete instead of Cancel. Whenever `endDate` is set or moved earlier, step 3 deletes the unedited linked charges due after it.
    - **Edited charges stay,** still linked.
    - **The count:** when it is above zero, the dialog states it: "This also deletes 1 charge dated after 30 Sep 2026: 5 Oct, 649.00."
    - **Tombstones are kept,** so a skipped date stays skipped if the end date moves again.
    - **A future end date:** charges continue until then, and the status is `ending`, shown as "Ends 31 Dec 2026".
- **BR-F05-13** Moving `endDate` later, or clearing it, depends on where the dates fall:
    - **The new end date is on or before C:** the Subscription ran longer than recorded. Step 4 creates its chargeable dates, from `chargesFrom`, through the new end date, except tombstoned ones.
    - **Cleared, or moved after C, while the stored end date is before C** (a resume): `chargesFrom` becomes the later of its current value and C. The months while it was cancelled are never charged; C itself is charged if it is a due date. The Resume dialog says: "Charges restart from today. Months while it was cancelled aren't added." With `backfillGap` (BR-F05-32), the months while it was cancelled are charged instead.
    - **The stored end date is on or after C:** the Subscription is still running, so nothing else changes.

**Delete (D-96, D-252)**

- **BR-F05-14** A delete works like a cancel with end date C, followed by removal. It runs BR-F05-08 steps 1 and 2, then:
    1. Delete the unedited linked charges due after C. These exist only when the delete was made offline and catch-up ran elsewhere in between.
    2. Delete its tombstones.
    3. Delete the Subscription.

    Its remaining charges, edited ones included, stay as ordinary expenses. They keep source `subscription` and `dueOn`, and their `subscriptionId` becomes null (`ON DELETE SET NULL (subscription_id)`, P2, BR-P2-06). A delete has no Undo (D-590); the dialog (BR-F05-44) offers to cancel instead. The undo of a create is a different delete (BR-F05-34).

**After a late sync**

- **BR-F05-15** A change that syncs late can delete more charges than its dialog showed, because charges were added in between. The queued item stores the deletion count its dialog showed (0 when it showed none). When the response's `chargesDeleted` is larger, the client shows a toast after the item syncs: "Netflix: 2 more charges were removed when this change synced." Updates and creations never raise a toast, since they follow the change the user made.

**Costs (D-90, D-253)**

- **BR-F05-16** Each Subscription's yearly cost is its amount × 52 ÷ `every` for a weekly unit, or × 12 ÷ `every` for a monthly one; for the presets that is × 52, 12, 4 or 1. Shown alone, it is rounded half away from zero (MON-7). Its monthly equivalent is the yearly cost ÷ 12, computed from the unrounded yearly cost and rounded once, for display only.
- **BR-F05-17** The page totals count every Subscription that has a next due date, paused ones included.
    - **Yearly cost:** Σ unrounded yearly costs, rounded once.
    - **Monthly cost:** Σ unrounded yearly costs ÷ 12, rounded once (MON-7).

    Costs use current amounts; there is no price history. Golden: 243,287.00 a year and 20,273.92 a month.

- **BR-F05-18** "This month" has two parts:
    - **Charged:** the Out figure of the Transactions summary for `src=subscription` and the current month (FIL-2). It therefore includes charges of deleted Subscriptions and matches the list exactly.
    - **Still to come:** the current month's chargeable dates on or after today with no charge and no tombstone, each at its Subscription's current amount.

    Golden November: charged 18,000.00 (#27), still to come 2,149.00 (Netflix 5 Nov, Cult Gym 10 Nov), 20,149.00 in all. October charged 20,148.00 (check E).

**Upcoming renewals (D-95, D-254)**

- **BR-F05-19** Next due is the earliest chargeable date on or after today with no charge and no tombstone. Paused dates are never chargeable, so a paused Subscription's next due is the first date after its pause. The search reaches 120 months ahead; a Subscription with no such date by then has none. Golden: Netflix 2026-11-05, Cult Gym 2026-11-10, Sunrise Apartments 2026-12-01 (1 November is already charged), Amazon Prime 2027-10-12.
- **BR-F05-20** The upcoming list holds every such date from today through today + 30 days, inclusive, so weekly Subscriptions appear up to five times. It is sorted by date, then name (compared in lower case by code unit, then by id), each entry with the current amount, and shows a count and a total. Ended Subscriptions add nothing. Golden: Netflix 5 Nov, Cult Gym 10 Nov, Sunrise Apartments 1 Dec, 3 charges, total 20,149.00. F10's renewals insight uses the same function with 7 days: Netflix only.

**The page and dialogs** (D-593)

- **BR-F05-21** `/subscriptions` shows, top to bottom:
    1. **The header:** the title "Subscriptions", with "as of 14:05" beside it when offline (section 10); "Show Subscriptions as" with List, Calendar and Table, remembered on the device (`daybook.subscriptions.view`); and Add a Subscription. Below 768 px, the phone layout (D-512), Table is not offered (a stored Table shows the list), and Add a Subscription is an icon button.
    2. **The summary**, when there is at least one Subscription:
        - "Monthly cost", the monthly total as a large figure, then "243,287.00 a year · 4 Subscriptions" ("1 Subscription" for one; the count is the Subscriptions with a next due date, BR-F05-17);
        - beside it (below it on narrow screens): the month's name and "20,149.00 in all"; a bar split between charged and still to come; "Charged 18,000.00" and "Still to come 2,149.00" (BR-F05-18);
        - then "Next 30 days · 3 charges" ("1 charge" for one) with the upcoming total, 20,149.00 (BR-F05-20).
    3. **The Undo notice**, when one applies and is not shown in the panel (BR-F05-33).
    4. **The view:** the list (BR-F05-37), the calendar (BR-F05-38) or the table (BR-F05-39).

    The panel (BR-F05-40) is docked beside them from 1180 px.

    Pending items carry "Pending sync" (OFF-6).

    **Deep link:** `/subscriptions?open=<id>` selects that Subscription and shows it in the panel, opening the drawer below 1180 px (D-593, refining D-347). The view stays as it is. In the list, an ended one is selected with the Ended group expanded and showing all its rows, so its row is on the page; in the calendar or the table, which show no Ended group, it shows in the panel only. An unknown id selects nothing, and the parameter is removed either way.

- **BR-F05-22** A row in the list shows:
    - **from 768 px, a date column:** the next due date, "Thu 5 Nov" in the current year or "12 Oct 2027" otherwise, over a relative line: "today", "tomorrow", "in 3 days" up to 45 days, then "in 2 months" (days ÷ 30.44, rounded) and "in a year" from 12 months; "resumes" for a paused one. An ended one reads "Ended" over its end date, "30 Sep 2026", and one with no next due "No more charges" over "Ends 31 Dec";
    - the name, the category's dot and label, and its badges: "Starts 5 Dec" when upcoming, "Ends 31 Dec 2026" when ending, "Paused until 5 Jan" when paused (the next due date), or "Paused" when it has none, as when its end date falls inside the pause, and "Pending sync" from M5;
    - a caption "2 charges in the next 30 days, 240.00" when it has more than one in that window;
    - the amount with its cadence: "649.00 a month", "120.00 a week", "240.00 every 2 weeks", "6,200.00 every 3 months" or "1,499.00 a year", and for every cadence other than monthly "≈ 124.92 a month". Below 768 px, the next due date sits under the amount instead of the monthly equivalent;
    - an ended row's Resume button, then an actions menu "Actions for Netflix", from 768 px. It offers, in order and as the status allows:
        - Resume (ended);
        - Edit;
        - "Skip the 5 Nov charge" and Pause (active or ending, with a next due date);
        - Resume now and Change pause (paused);
        - Cancel Subscription (active or paused);
        - Change end date and Keep it going (ending, which opens Resume);
        - View charges;
        - Delete, after a separator, in the danger style.
- **BR-F05-23** View charges opens `/transactions?sub=<id>` (root 6.9, D-255).
- **BR-F05-24** The Subscription dialog, "Add a Subscription" or "Edit Netflix", is a bottom sheet on phones (D-400). It asks for, in this order:
    - **Name,** with the placeholder "Netflix, rent, insurance…", focused when Add opens. On Add it is a combobox of "Payees you've paid": F03's payees that have a `lastExpense` (BR-F03-44, D-451), matched as F03's payee field does (BR-F03-45: the first 5 of those payees while empty, up to 8 matches while typing) from the list on the device only, without the server search (BR-F03-61) or the "Use … as a new payee" option. Each option shows its avatar, its last expense's category and the payee's row count, every type included ("Entertainment · 3 times", "· 1 time"). Choosing one fills the category and amount of its `lastExpense`, with the hint "Filled from your last Netflix expense: Entertainment, 649.00." (D-594), which goes once the name, category or amount changes;
    - **Amount** (F03's amount rules);
    - **How often,** beside Amount from 768 px: Weekly, Monthly (the default on Add), Every 3 months, Yearly or Custom. Custom shows "Every" with a number of up to two digits (other characters are dropped as typed) and "Unit", weeks or months, starting at 2 months, or the stored values on Edit, with the hint "Every 2 months, every 6 months, every 2 weeks…", which its error replaces as soon as the number is out of range. A custom choice equal to a preset is stored as that preset;
    - **Category:** the expense categories as tiles, none chosen on Add;
    - **"Started on"**, a date picker from 10 years back to 1 year ahead (D-257), starting at today on Add, with the help text "The date of the first charge. Daybook repeats from this date.";
    - **The schedule line**, once the start date and a custom number are valid (the costs are left out while the amount is not): "Every month on the 5th · 7,788.00 a year" (with "≈ 124.92 a month" for cadences other than monthly), then "Next charges: Thu 5 Nov, Sat 5 Dec, Tue 5 Jan.": the first three chargeable dates on or after today on Add, whichever past-charges choice is picked, and after C on Edit, from the Subscription as the change leaves it (its end date, pause and skips, the double-charge skip included). For a future start on Add it reads "Starts Sat 5 Dec, …". The schedule reads "Every Thursday", "Every 2 weeks on Thursday", "Every year on 12 Oct", "Every month on the 5th" or "Every 3 months on the 30th, or the last day in shorter months"; the clamp words follow a start on the 29th to the 31st with a month unit whose months are not a multiple of 12, and a 29 February start whose months are a multiple of 12 reads ", or 28 Feb in other years" instead ("Every year on 29 Feb, or 28 Feb in other years", "Every 24 months on the 29th, or 28 Feb in other years");
    - on Add, the past-charges choice (BR-F05-04);
    - **Note,** behind "Add a note", or open on Edit when the Subscription has one, with F03's note rules;
    - on Edit, "What changes" (below).

    **On Edit,** each changed field shows "Was 649.00" (or "Was Netflix", "Was Monthly", "Was Every 2 weeks", "Was Entertainment", "Was 5 Sep 2026") as its hint, in place of the field's own help text, and a "What changes" section appears once a field other than the note changes and every field is valid:
    - a strip of charges around today: the last two charges through C as they stay, then "Today", then the old next charge struck through as "moves" when the schedule no longer has it, the date BR-F05-31 offers to skip (struck as "skipped" while ticked, or "second charge" as a warning while not), and the next two other charges at the new values. The strip is named "Charges around today", and "Today" is hidden from screen readers;
    - "Past charges stay as they are. The new schedule applies from tomorrow." for a start or cadence change;
    - for a value change: "Charges up to today keep their amount. Later ones use the new amount.", or with the name or category too "Charges up to today keep their amount, name and category. Later ones use the new ones.", or for the name or category alone "Charges up to today keep their name and category. Later ones use the new ones." (or "their name", "their category", "the new one");
    - the double-charge choice (BR-F05-31), or "20 Oct has passed, so nothing is charged until Fri 20 Nov." when the new schedule's first date after the last charge has already passed;
    - "Also change the 2 past charges" (BR-F05-30) when the name or category changes and such charges exist;
    - for an amount or cadence change on a Subscription with a next due date, "Monthly cost 20,273.92 → 21,773.92 · Yearly 243,287.00 → 261,287.00" (golden Sunrise Apartments raised to 19,500.00).

    A note-only change shows "Only the note changes. Charges stay as they are." Saving with nothing changed closes the dialog. The buttons are Cancel and "Add Subscription" or "Save changes". A failed save keeps the dialog open with "The Subscription could not be saved. Check your connection and try again. Your changes are still here."

- **BR-F05-25** Every Subscription write takes the profile lock (D-213). Requests that send an amount carry `currency`. Writes are offline-writable from M5 (D-46). Queued Subscription items replay one by one: they are never merged, except that a create and a later delete of the same queued Subscription cancel out (D-265). Each later item uses the version the previous one returned (D-269). No charge is ever generated on the device.

**Skipped charges** (D-93, D-596)

- **BR-F05-26** "Skip this one", in the panel's next-charge box, and "Skip the 5 Nov charge", in the row menu, skip the next due date: `POST /api/subscriptions/[id]/skips` with `{ dueOn, changedAt }` writes its tombstone, under BR-F05-08's locks. `dueOn` must be a chargeable due date after C; otherwise 422 with "Only an upcoming charge can be skipped." Online, C is today, so the date is still to come. A skip that syncs late may find the date already charged by another device: an unedited charge there is deleted with the tombstone written, as a charge delete does (BR-F03-17); an edited one makes it 422 "This charge was edited, so it stays. Delete it in Transactions to skip it." A date that is already skipped answers 200 with the Subscription unchanged. The skip bumps `version` and leaves `lastChangeOn` alone. Golden: skipping Netflix's 5 November charge moves its next due to 5 December and the next 30 days to 19,500.00.
- **BR-F05-27** A skipped date after today shows "You skipped it." with "Undo skip" in the panel. `DELETE /api/subscriptions/[id]/skips/[dueOn]` removes the tombstone while `dueOn` is after C, then catches up through today, so a date that passed before a late sync is charged; with `dueOn` on or before C it is 422 "This charge date has passed, so it can't be brought back." A date with no tombstone answers 200 with the Subscription unchanged, whatever its date, and the check comes before the one for a passed date (D-612). It bumps `version` and leaves `lastChangeOn` alone. A skip whose date has passed stays for good, like a deleted charge.

**Pause** (D-94, D-595)

- **BR-F05-28** A pause leaves out every due date d with `from ≤ d < until`.
    - **Charges:** catch-up never charges a paused date, and next due, the upcoming list and the month's still to come leave them out (BR-F05-18 to BR-F05-20).
    - **Costs:** a paused Subscription with a due date after its pause has that date as its next due, so it still counts in the monthly and yearly cost. One whose end date falls inside the pause has none, and counts no more.
    - **Status:** `paused` while `until` is after today, checked after `upcoming` and before `ending`. A pause always starts on the next due date (BR-F05-29), so no charge falls between today and a pause that has not started. After that the stored pause stays and keeps its dates uncharged, and the status follows the other rules.
    - **Skipped dates** inside a pause stay skipped.
- **BR-F05-29** A pause is set through `PATCH` with `pause`, and follows BR-F05-08:
    - **A new pause:** `from` must be the first chargeable due date after C with no tombstone (the next due date when sent online), and `until` after `from` and no more than 24 months after today.
    - **A pause in force** (stored `from` on or before C and `until` on or after C) keeps its `from` and may move `until` to any date on or after C. Resume now sends `until` = C, so C itself is charged when it is a due date; Change pause sends the new `until`. Before a pause starts, or on its first day when nothing has been paused yet, Resume now sends `pause: null` (D-600); Change pause then sends a new pause.
    - **Clearing or replacing a started pause:** when a write sets `pause` to `null`, or to one with a different `from`, while the stored pause's `from` is on or before C, `chargesFrom` becomes the later of its current value and the earlier of the stored `until` and C. Dates it paused are therefore never charged afterwards.
    - **Charges on paused dates:** step 3 deletes the unedited linked charges on dates the new pause covers, on or after C. They exist only after a late sync, or when Undo puts back a pause that Resume now had shortened (BR-F05-08 step 2).
    - **Refusals:** 422 with "Choose a date with a charge to pause from." for a bad `from`, "Choose a date after 5 Nov." for an `until` not after `from`, and "Choose a date up to 2 Nov 2028." past the limit.

**More change options** (D-92, D-594)

- **BR-F05-30** `alsoPastCharges: true`, sent with a `name` or `category` change, also gives the unedited linked charges due on or before C the new payee and category, never a new amount. It bumps their `version` and leaves `edited` false. The Edit dialog offers it, off by default, as "Also change the 2 past charges", described "Name and category only. Past amounts never change." This narrows D-92 on request only.
- **BR-F05-31** When a start or cadence change makes the new schedule's first due date after C fall less than one new period after the last charge on or before C, the dialog offers "Skip 15 Nov, so it isn't charged twice", ticked by default, described "5 Nov was already charged, less than one month before it. The first charge on the new date is 15 Dec." (the new period reads "one week", "one month" or "one year" for 1 week, 1 month or 12 months, else "5 weeks" or "3 months"; the second sentence is left out when no date follows) Ticked, the `PATCH` carries `skipDueOn` with that date, and step 3 writes its tombstone; it must be a due date of the new schedule after C, else 422.
- **BR-F05-32** `backfillGap: true`, sent with `endDate: null` or a later end date while the stored end date is before C, sets `chargesFrom` to the earlier of its value and the day after the stored end date, never before `startDate` (D-597). Step 4 then charges the due dates between the old end date and today, except tombstoned and paused ones, even after an earlier resume had moved `chargesFrom` past them. The Resume dialog's "It never actually stopped" and the Undo of a cancel send it (D-591). Without a stored end date before C it changes nothing.
- **BR-F05-46** A field sent with its stored value is no change, and is not judged by the windows or the pause and end date rules again. A `PATCH` in which every field equals the stored one and no skip option acts answers 200 with the Subscription as it is: no new version, no move of `lastChangeOn`, no catch-up, and every count 0 (D-604).
- **BR-F05-47** `skipDueOn` must be a due date of the new schedule after C (BR-F05-31). An unedited charge already on it is deleted with the tombstone written; an edited one makes it 422 "This charge was edited, so it stays. Delete it in Transactions to skip it."; a date that is already skipped writes nothing. `unskipDueOn` with no tombstone changes nothing, whatever its date; one with a tombstone on or before C is refused (BR-F05-34, D-604, D-612).

**Undo** (D-589, D-590, D-591, D-597)

- **BR-F05-33** After each confirmed write other than a delete, an inline notice with Undo confirms it, never a toast:
    - **Texts:**
        - Add: "Netflix added. Next charge Thu 5 Nov." or "Netflix added with 14 past charges. Next charge Thu 5 Nov.";
        - Edit: "Netflix saved. Next charge Thu 5 Nov.";
        - Cancel: "Netflix cancelled. 1 charge deleted.", "Netflix cancelled. Earlier charges stay." or "Netflix ends on 31 Dec 2026.";
        - Resume: "Netflix resumed. 1 missed charge added. Next charge Thu 5 Nov." or without the middle sentence;
        - Pause: "Netflix paused. Charges resume on 5 Jan 2027.";
        - Resume now: "Netflix resumed. Next charge Sat 5 Dec.";
        - Skip: "Skipped the 5 Nov Netflix charge.";
        - Undo skip: "The 5 Nov Netflix charge is back.".

        "Next charge …" is left out when there is none.

    - **A delete** shows "Netflix deleted. Its charges stay in Transactions." (or "Netflix deleted." with no charges) above the list, with Dismiss and no Undo (D-590).
    - **Where:** in the panel when the changed Subscription is selected, otherwise above the list with Dismiss. After a delete it is always above the list.
    - **Selection:** after a confirmed write other than a delete, the changed Subscription becomes the selection when the panel is docked or a Subscription is already selected, so its notice shows in the panel. A delete clears the selection.
    - **A failed Undo:** nothing changes, and the notice reads "The Subscription could not be saved. Check your connection and try again.", "This Subscription was deleted on another device." or, for a 422, "This change can't be undone any more.", with Dismiss.
    - **How long:** until Undo, Dismiss, the next write, or midnight in the profile time zone (D-597), so an Undo always has the same change date as its write. An answer that arrives after the notice has ended or been replaced changes nothing on the page. While Undo is on its way its buttons rest.
- **BR-F05-34** What Undo sends, with `If-Match` set to the version the write returned:
    - **After an Add:** `DELETE` with `{ changedAt, undo: "create" }`, allowed only at version 1 (D-589). It runs BR-F05-08 step 1, then deletes every unedited linked charge, whatever its date, catch-up's later ones included; the edited ones stay as unlinked expenses; then the tombstones and the Subscription. A Subscription changed since gets 409.
    - **After an Edit, Pause, Resume now or Resume:** a `PATCH` with the previous values of every field the write changed. It adds `unskipDueOn` when the write skipped a date (BR-F05-31; a date with no tombstone changes nothing, and a tombstone on or before C is 422, D-612), `alsoPastCharges: true` when it renamed past charges, and `pause` with its stored `from` when undoing Resume now (BR-F05-29). Undoing a Resume puts the old end date back, which deletes the charges the resume added (BR-F05-12).
    - **After a Cancel:** a `PATCH` with the previous `endDate` and `backfillGap: true` (D-591), so charges the cancel deleted come back. Each comes back as a new row at the current amount.
    - **After a skip:** `DELETE` of that skip; after an Undo skip, the skip again.
    - **After a delete:** none (D-590).

    A 409 opens the conflict view: F03's (BR-F03-24, BR-F03-78), titled "This Subscription changed on another device", with Keep mine resending against the saved version and Keep theirs dropping the change. For the undo of an Add, which needs version 1, the two actions are "Delete anyway", a plain delete at the saved version whose charges stay (BR-F05-14), and "Keep it". Undo shows no notice of its own.

**Reads** (D-592, D-594)

- **BR-F05-35** Each item of `GET /api/subscriptions` carries its stored fields and:
    - `skips`: every tombstoned date, past and future, oldest first. The browser splits them at today (D-592);
    - `nextDueOn`, `status`, `yearlyMinor`, `monthlyMinor`;
    - `chargeCount` and `paidMinor`: the number and sum of its linked charges, for the panel and the delete dialog.
- **BR-F05-36** `GET /api/subscriptions/months?from=YYYY-MM&to=YYYY-MM` returns each month from `from` to `to` as `{ month, chargedMinor, expectedMinor }`:
    - `chargedMinor` is BR-F05-18's charged figure for that month;
    - `expectedMinor` is the month's chargeable dates on or after today with no charge and no tombstone, at current amounts: 0 for a past month.

    `from` must not be after `to`, the span is at most 24 months, and both lie within 120 months of the current month (D-596); otherwise 400, a window miss with "Choose months from Nov 2016 to Nov 2036.". Golden: October 20,148.00 and 0; November 18,000.00 and 2,149.00; December 0 and 20,149.00.

- **BR-F05-48** The page reads whole sets of charges through F03's list (D-617): each read asks for 100 rows with `group=none` and follows `nextCursor` until it is null, in one query, and fails as a whole when any page fails.
    - **A month's charges,** for the calendar: `src=subscription` with `from` and `to` on the month's first and last days.
    - **One Subscription's charges,** for the panel's timeline and the Edit, Cancel and Resume previews: `sub=<id>`.
    - **Possible duplicates,** for Add (BR-F05-04): `q=<name>`, `type=expense`, `from` the start date and `to` yesterday, keeping the rows whose payee equals the name as `lower()` compares (D-497). Only a name F03 accepts as a text search is read: 3 characters or more and not a number (BR-F03-34, BR-F03-35); for any other name no note shows.
    - **A failed read:** the calendar and the panel's timeline show "Charges could not be loaded." with Retry in place of what needs them; the Edit, Cancel and Resume dialogs show it in place of their preview, and their save button rests until the charges load, so a deletion count is never left out. A failed duplicates read shows no note.

- **BR-F05-49** The words and figures the page writes follow the profile's formats, as Transactions and Budgets do (D-618):
    - **Dates** use F02's formats (BR-F02-19) in the profile's `dateLocale`. This spec's examples such as "Thu 5 Nov" and "30 Sep 2026" show `en-GB`: `en-IN` writes "Thu, 5 Nov" and "30 Sept 2026", `en-US` "Thu, Nov 5", and the weekday in "Every Thursday" is the locale's own word. A date with a weekday is written so only in the current year; another year reads "12 Oct 2027". Dates in the server's own messages (section 8) keep their fixed form.
    - **Amounts** use the profile's number format with the currency's symbol, as Budgets' do: "₹649.00 a month" in `en-IN`, "₹2,43,287.00 a year".
    - **A passed due date:** a due date that has passed since the list was read, because the page stayed open past midnight, reads "yesterday" or "3 days ago" in its relative line until the list reloads, and its row stays in Within 7 days (D-619).

**The page in detail** (D-593, D-594)

- **BR-F05-37** The list groups Subscriptions that are not ended by next due date, each group with a header:
    - **"Within 7 days · 1"** (next due through today + 7) and **"Within 30 days · 2"** (through today + 30), each with the sum of its rows' charges in the next 30 days, so the two figures add up to the Next 30 days total. Golden: 649.00 and 19,500.00;
    - **"Later · 1"** and **"No more charges · 1"** (no next due), without a figure;
    - **"Ended · 8"**, collapsed until pressed, newest end date first, showing 5 and then "Show all 8" or "Show fewer".

    Rows sort by next due, then name as BR-F05-20 compares names (in lower case by code unit, then by id). No more charges sorts by name the same way, and Ended by end date, newest first, then name; while expanded, its header shows "Newest first". With no running Subscription: "No running Subscriptions. Resume one below, or add a new one."

- **BR-F05-38** The calendar shows one month:
    - **A month row** above it: 13 months, from 3 before the current one (5 below 768 px, from 1 before), with Earlier months and Later months moving by 3. Each month shows its short name, the year when it differs from the current one, and charged plus expected (BR-F05-36) in whole units, rounded half away from zero. Past months carry a check mark, the current month a bar of its charged share. Each is named like "October 2026, charged 20,148.00", "November 2026, charged 18,000.00 of 20,149.00" or "December 2026, expected 20,149.00".
    - **The title:** "November 2026" with "18,000.00 charged · 2,149.00 to come", "20,148.00 charged" for a past month, or "20,149.00 expected, at today's prices" for a later one.
    - **The items of a month,** computed in the browser from the list and the month's charges (BR-F05-48):
        - charged: every charge in the month, deleted Subscriptions' included;
        - skipped: tombstoned due dates from `chargesFrom` to the end date;
        - paused: paused due dates from today on, within the same range;
        - due: chargeable dates from today on with no charge and no tombstone.

        They sort by date, then amount, largest first. Day and week totals count charged and due items.

    - **From 768 px, a grid:** weeks from the profile's week start (F02), a "Week" column of totals ("—" for none), days outside the month dimmed, showing only their date ("1 Dec" for a first day) and no items, and today marked. Each item is named like "Netflix, 649.00, due" (or charged, skipped, paused). The week total counts the month's own days. A day shows up to two items; with more, the first and "+2 more · 20,149" open a popover named by the day: "Thu 5 Nov" with the day's total (charged and due), then each item with its name, "Entertainment · due" and its amount, and "Select one to open it in the panel." Escape or a press outside closes the popover and nothing else. A legend reads "Filled dot: charged", "Ring: due", "Struck: skipped or paused" and "Dashed ring: pending sync".
    - **Below 768 px, day by day:** each week a heading with its days ("2 to 8 Nov") and total; a week with no item reads "Nothing due · Show days"; a week of one day reads "1 Nov"; a week whose items are all skipped or paused shows them, with no total; three or more empty days in a row collapse to one line ("Mon 3 to Wed 5"); today always shows, even in a week with no item, and reads "Today". A due item's caption is its relative date ("in 3 days"); the others read "Charged", "Skipped" or "Paused". Showing the current month, it opens scrolled to today.
    - **Selecting an item** selects its Subscription and marks that date in the panel's timeline. A charge of a deleted Subscription shows the toast "This charge belongs to a deleted Subscription. It stays in Transactions as an ordinary expense."
- **BR-F05-39** The table (from 768 px), a TanStack Table like Budgets' (D-570):
    - **Columns:** Name, Category, Price ("649.00 a month"), Per month, Share (a bar and "3.2%" of the yearly total), Per year, Next due and Status (Active, Ending, Starts soon, Paused). Next due reads "5 Nov", or "12 Oct 2027" outside the current year. Sorted by Per month, largest first, at first; text columns and Next due sort ascending first, figures descending first, with `aria-sort`. Share sorts as Per month and Status by its label. A Subscription with no next due date shows its Per month and Per year, "—" as Share and Next due, and sorts last in either direction.
    - **Caption:** "Ended Subscriptions aren't in the table or the totals. Select a column heading to sort."
    - **Rows:** every Subscription that is not ended, then "Total · 4" with the monthly and yearly totals; the count and the totals cover only the Subscriptions with a next due date, as BR-F05-21's summary does (BR-F05-17). Selecting a row selects the Subscription.
- **BR-F05-40** From 1180 px the panel is docked; below, it is a drawer over a scrim, opened by a selection and closed by Close details, the scrim or Escape. It is hidden while loading, on error and when there is no Subscription.
    - **With no selection (docked only):**
        - "Your Subscriptions" and "Monthly cost by category": each category's monthly equivalent and its share, largest first, with a bar;
        - a box "How charges work": "Daybook adds each charge to Transactions as an expense on its due date. Future charges aren't added until they're due.", "Deleting a charge in Transactions skips it. Daybook won't add it again." and "Cancelling or deleting a Subscription keeps the charges that already happened.";
        - the hint "Select a Subscription to see its charges. Up and down arrows move."
    - **With a selection:**
        1. "Subscription", Close details, the name, category and badges.
        2. The amount, large, with its cadence words, then "Every month on the 5th, since 5 Sep 2026 · 7,788.00 a year" (and "≈ … a month" for cadences other than monthly).
        3. The Undo notice, when it is about this Subscription.
        4. A box by status:
            - "Next charge Thu 5 Nov, in 3 days." with "Skip this one" (and " Ends 31 Dec 2026." when ending);
            - "Paused. Resumes Tue 5 Jan 2027." with Resume now and Change, or "Paused." when it has no next due date;
            - "Starts Sat 5 Dec, in 33 days.";
            - "Ended 30 Sep 2026." with Resume;
            - "No more charges. Ends 31 Dec 2026." with Resume.
        5. **"Charges":** a timeline from the Subscription's charges (BR-F05-48) and `skips`, newest at the top. It holds the coming dates up to the second due one, then the past charges and past skipped dates, newest first; 7 show, then "Show all 9" or "Show fewer". Each line has its date with the year ("5 Nov 2026") and amount ("Skipped" or "Paused" in place of the amount) and a caption:
            - "Next. Added to Transactions on the day." for the next one, "After that" for the one after;
            - "Charged" or "Charged · edited";
            - "You deleted this charge. Daybook won't add it again." for a past skipped date;
            - "You skipped it." with Undo skip, for a future one;
            - "Not added while paused".

            With none: "No charges yet." Below, when there is a charge: "Paid so far 1,298.00 · 2 charges" ("1 charge" for one) and View charges (BR-F05-23).

        6. The note under "Note", or "Add a note", which opens Edit.
        7. **Actions:** Edit; Pause (active or ending, with a next due date); Resume (ended, or ending with no next due), else "Cancel Subscription", read "Change end" when ending (not for upcoming ones); Delete.
        8. The hint "E to edit · Up and down arrows move · Esc to close".
- **BR-F05-41** Cancel ("Cancel Netflix?") asks "When does it end?":
    - **"Now":** "Ends today, 2 Nov. No more charges." (the default);
    - **"After the next charge":** "Ends 5 Nov. One more 649.00.", when there is a next due date;
    - **"On a later date":** "Charges continue until then.", with a date from tomorrow to 10 years ahead, starting a month from today;
    - **"I cancelled it earlier":** "For when Daybook kept adding charges after you'd cancelled.", with a date from the start date to yesterday, starting at yesterday, when the start is before today.

    Below them: BR-F05-12's deletion line, naming up to three charges as "5 Oct, 649.00", joined by "; ", and then "and 2 more"; "Charges you've edited stay (1)." when edited charges lie after the date; a strip of the last charge kept ("kept"), up to two charges deleted ("deleted"), today, up to two charges still to come (the final one "last") and "5 Dec on" with "no charges", from the first due date after the end; and "Netflix moves to Ended. You can resume it later." or "Netflix shows "Ends 31 Dec 2026" until then, then moves to Ended." The buttons are "Keep Netflix" and "Cancel Netflix", or "Cancel and delete 1 charge" in the danger style. For an ending Subscription the menu reads "Change end date", and the dialog opens on "On a later date" with its stored end date.

- **BR-F05-42** Resume ("Resume Netflix?") opens with "Ended 30 Sep 2026, after the 5 Sep charge" (its latest charge; "Ended 30 Sep 2026" with none) or "Ends 31 Dec 2026". For an ended Subscription with missed dates (due dates after its end date through today, on or after `startDate`, with no charge, no tombstone and not paused: what BR-F05-32 would charge), it offers:
    - **"Restart from today":** "Charges restart from today. Months while it was cancelled aren't added." (the default, BR-F05-13);
    - **"It never actually stopped":** "Also adds the 1 missed charge: 5 Oct, 649.00." or "Also adds the 2 missed charges: 5 Oct, 5 Nov, 1,298.00." (up to three dates, then "…", then one total; the total at the amount the resume saves, since step 4 charges at the new values), sending `backfillGap` (BR-F05-32).

    Otherwise it says "Charges restart from today." or "The end date is cleared. Charges carry on after 31 Dec 2026." A strip shows the result: the last charge, up to two missed dates ("added" or "not added"), today, and the next two dates at the amount it saves, the first "next". Then "649.00 a month" with "Change the price too", which opens "New amount" with the hint "Was 649.00. Charges from today use it." ("Charges after today use it." for an ending one, whose change date keeps the old amount, BR-F05-08) and sends `amountMinor` in the same `PATCH`; F03's amount messages apply, "Enter an amount." when it is emptied. The buttons are "Not now" and "Resume Netflix".

- **BR-F05-43** Pause ("Pause Netflix") is offered when the next due date is before the 24-month limit (BR-F05-29). Its pausable dates are the chargeable due dates after C with no tombstone, with any stored pause left out, since the new one replaces it; the first is where a pause starts (BR-F05-29). It offers "Skip" with "The next charge", "2 charges", "3 charges" or "Until a date" (from the day after the first pausable date to the limit, starting at that date plus 2 months, at most the limit). A count pauses from the first pausable date to the pausable date after the last one it covers. A count is disabled when no such date follows on or before the end date, or when that date falls past the limit. Change pause on a pause not yet started offers the same, opening on "Until a date" with the stored `until`. Change pause on a pause in force offers only "Until a date", from C to the limit, with the stored `until`, and keeps its `from` (BR-F05-29). The default is "2 charges", else "The next charge", else "Until a date". It shows a strip of up to three paused charges ("paused") and the one that resumes ("resumes"), then "Nothing is added while it's paused. Charges resume on Tue 5 Jan 2027 at 649.00, without you doing anything." (the second sentence left out when no charge follows on or before the end date) and "Netflix still counts in your monthly cost while it's paused. Paused charges are left out of the next 30 days." The buttons are "Not now" and "Pause until 5 Jan".
- **BR-F05-44** Delete ("Delete Netflix?") says "Its 2 charges stay in Transactions as ordinary expenses." (or "Its 1 charge stays in Transactions as an ordinary expense.", or "It has no charges yet, so nothing changes in Transactions."), then "Daybook stops adding charges and forgets the schedule and skipped dates." For a Subscription that is neither upcoming nor ended, it adds "To keep it under Ended, cancel it instead.", where "cancel it instead" opens Cancel. The buttons are "Keep Netflix" and "Delete Netflix", in the danger style.
- **BR-F05-45** Keyboard on the page, outside text fields and dialogs and without modifier keys:
    - from 1180 px, Up and Down move the selection through the rows in the order shown (the list's groups with Ended only when expanded, or the table's sort) and focus the row; below 1180 px they only move focus, and while the drawer is open they do nothing, as Budgets do (D-571). With no row focused or selected, either starts at the first row. In the calendar they do nothing;
    - Escape clears the selection;
    - E opens Edit for the selected Subscription;
    - N opens a new Transaction (F03).

    Selecting a selected row again clears the selection in the docked panel.

## 5. Calculations

**Golden, as of 2 November** ([03-golden-dataset.md](../03-golden-dataset.md#subscriptions-as-of-2-november))

| Name               | Cadence | Next due   | Yearly cost    | Monthly equivalent                                           |
| ------------------ | ------- | ---------- | -------------- | ------------------------------------------------------------ |
| Netflix            | monthly | 2026-11-05 | 7,788.00       | 649.00                                                       |
| Cult Gym           | monthly | 2026-11-10 | 18,000.00      | 1,500.00                                                     |
| Sunrise Apartments | monthly | 2026-12-01 | 216,000.00     | 18,000.00                                                    |
| Amazon Prime       | yearly  | 2027-10-12 | 1,499.00       | 124.92                                                       |
| **Total**          |         |            | **243,287.00** | **20,273.92** (243,287.00 ÷ 12 = 20,273.9166…, rounded once) |

- **Upcoming, next 30 days:** 3 charges, 20,149.00.
- **Within 7 days:** Netflix only; Cult Gym on 10 November is just outside. The list's groups: Within 7 days 649.00, Within 30 days 19,500.00 (Cult Gym, Sunrise Apartments), Later (Amazon Prime).
- **This month:** charged 18,000.00, still to come 2,149.00, 20,149.00 in all.
- **Charges in October:** 20,148.00 (#12, #16, #20); the tombstoned Cult Gym charge is not one of them.
- **Catch-up on 2 November:** whichever catch-up runs first that day, boot or lazy, creates row 27 (Sunrise Apartments, due 1 November) and nothing else.
- **The panel for Netflix:** 5 Nov (Next), 5 Dec (After that), 5 Oct Charged, 5 Sep Charged; "Paid so far 1,298.00 · 2 charges". For Cult Gym: 10 Nov, 10 Dec, 10 Oct "You deleted this charge…", 10 Sep Charged; "Paid so far 1,500.00 · 1 charge".

**Custom cadences** (illustrative)

| Amount   | Cadence        | Yearly cost              | Monthly equivalent        |
| -------- | -------------- | ------------------------ | ------------------------- |
| 120.00   | weekly         | 6,240.00                 | 520.00                    |
| 120.00   | every 2 weeks  | 3,120.00                 | 260.00                    |
| 100.00   | every 3 weeks  | 1,733.33 (5,200.00 ÷ 3)  | 144.44 (1,733.333… ÷ 12)  |
| 1,840.00 | every 2 months | 11,040.00                | 920.00                    |
| 1,000.00 | every 7 months | 1,714.29 (12,000.00 ÷ 7) | 142.86 (1,714.2857… ÷ 12) |

**A price change that syncs late.** Netflix (monthly on the 5th, 649.00) is changed to 799.00 offline, with `changedAt` on 4 November. It syncs in a request at 6 November that carries `Daybook-Queue: pending`, so the lazy check is skipped (D-244).

- **One device:** C = 4 November.
    1. Step 2 catches up through 4 November at 649.00, which creates nothing.
    2. Step 3 updates nothing.
    3. Step 4 creates the 5 November charge at 799.00.
- **After another device's catch-up:** the laptop created the 5 November charge at 649.00 on 6 November. Step 3 reprices it in place to 799.00, same id, version 2.
- **The same change made on 5 November:** C = 5 November, so step 2 keeps (or creates) the 5 November charge at 649.00. Only later charges use 799.00.

**A schedule change that syncs late.** Offline, with `changedAt` on 2 November, the user moves golden Netflix's start from 2026-09-05 to 2026-09-08. The laptop creates the 5 November charge on 6 November, and the change syncs in a request at 9 November.

1. C = 2 November, and `chargesFrom` = 3 November, since the new start is before C.
2. The 5 November charge is not a due date of the new schedule, so step 3 deletes it.
3. Step 4 creates 8 November.

November has exactly one charge.

**A day moved later, and the double charge.** On 6 November, after the 5 November charge at 649.00, the user moves Netflix's start to 2026-09-15. C = 6 November and `chargesFrom` = 7 November. The new first date, 15 November, is less than a month after 5 November, so the dialog offers "Skip 15 Nov, so it isn't charged twice", ticked. Saved so, 15 November is tombstoned and the next charge is 15 December. Made instead on 2 November, moving the start to 2026-09-20: the last charge is 5 October, 20 October has passed, and the dialog says "20 Oct has passed, so nothing is charged until Fri 20 Nov."

**Several queued changes.** Offline, both with `changedAt` on 4 November, the user changes Netflix to 799.00 and then its category to Shopping. Both sync in requests at 9 November.

- **The first item:** C = 4 November; `lastChangeOn` becomes 4 November.
- **The second item:** uses the version the first returned (D-269), and its C is also 4 November.

The 5 November charge ends up with both changes.

**Backfill count.** A monthly Subscription started 2025-09-05 and created on 2026-11-02 with backfill has due dates 2025-09-05 to 2026-10-05: 14 dates. At 649.00 each, the dialog shows "Yes, add 14 past charges, 9,086.00". Undo deletes all 14 with the Subscription; had the user edited one of them first, that one stays as an unlinked expense.

**A skip.** On 2 November, "Skip this one" on golden Netflix tombstones 5 November. Next due becomes 5 December, the next 30 days hold Cult Gym and Sunrise Apartments, 19,500.00, and November's still to come is 1,500.00. Catch-up on 5 November creates nothing. Undo skip on 3 November brings 5 November back.

**A pause.** On 2 November, Pause golden Netflix for "2 charges": `{ from: 2026-11-05, until: 2027-01-05 }`. Its status is `paused`, the row reads "Paused until 5 Jan", next due is 5 January 2027, the monthly cost stays 20,273.92 and the next 30 days total 19,500.00. On 10 November, Resume now sets `until` to 10 November: 5 November is never charged, and next due is 5 December.

**Cancel in the past, and its Undo.** On 2 November the user cancels golden Netflix with "I cancelled it earlier", 30 September. #16 (5 October) is deleted. Undo sends `endDate: null` with `backfillGap`, so step 4 creates a new 5 October charge at 649.00 and next due is 5 November again. Resume with "Restart from today" instead leaves October empty.

## 6. Screens and states

**`/subscriptions`.** BR-F05-21 to BR-F05-23 and BR-F05-37 to BR-F05-40, BR-F05-45. Dialogs: BR-F05-24, Cancel (BR-F05-41), Resume (BR-F05-42), Pause (BR-F05-43) and Delete (BR-F05-44).

| State            | What the user sees                                                                                                                                                                   |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading          | A skeleton summary and four skeleton rows; no panel                                                                                                                                  |
| Empty            | "No Subscriptions yet." with "Add rent, streaming, insurance or any bill that repeats." and Add a Subscription; no view switch and no panel                                          |
| Error            | "Subscriptions could not be loaded." with "Check your connection, then try again. Your Subscriptions are safe." and Retry; no view switch and no panel                               |
| Offline          | Cached data with "as of". The upcoming list is recomputed on the device from cached schedules, including pending ones. Writes queue from M5                                          |
| Pending          | "Pending sync" on rows. A pending new Subscription is drawn dashed, its upcoming charges are left out of the totals, and the summary says "Hotstar not counted until it syncs." (M5) |
| Locked (Premium) | n/a                                                                                                                                                                                  |
| Read-only        | Ended Subscriptions offer Resume, Edit, View charges and Delete                                                                                                                      |

## 7. Flows

**7.1 Add a Subscription**

1. The user selects Add a Subscription and types "Net". "Payees you've paid" offers Netflix; choosing it fills Entertainment and 649.00. They keep Monthly and pick 5 Sep 2025.
2. The past-charges choice offers "Yes, add 14 past charges, 9,086.00" and notes the existing Netflix expenses. They keep "No, start with the next one".
3. `POST /api/subscriptions`. In one transaction:
    - `chargesFrom` and `lastChangeOn` become today;
    - the Subscription is inserted;
    - it is caught up through today, which creates no charge, since the next due date is 5 November.
4. The row appears under Within 7 days with "Thu 5 Nov", and the notice says "Netflix added. Next charge Thu 5 Nov." **422:** field messages.

**7.2 Boot catch-up.** On start and on each return online, after replaying the queue (from M5), the app calls `POST /api/sync/catch-up` (root 5.2, D-181).

- On 2 November, as the process's first request of the day, golden gets `{ skipped: false, chargesCreated: 1, pricesUpdated: true }` and refetches Transactions, the dashboard, Budgets and Subscriptions. If the first page was rendered on the server, its lazy check already created row 27, and the endpoint returns zeros.
- With Subscription items still waiting, it gets `{ skipped: true }` and calls again after the next successful replay.

**7.3 Price change.** On 2 November the user edits Sunrise Apartments to 19,500. What changes shows the value text and "Monthly cost 20,273.92 → 21,773.92 · Yearly 243,287.00 → 261,287.00", and the next charge, on 1 December, is 19,500.00.

**7.4 Cancel in the past**

1. On 2 November the user cancels Netflix with "I cancelled it earlier", 30 September.
2. The dialog says "This also deletes 1 charge dated after 30 Sep 2026: 5 Oct, 649.00." and the button reads "Cancel and delete 1 charge".
3. Confirm. #16 is deleted, Netflix moves to Ended as "Ended 30 Sep 2026", and the notice says "Netflix cancelled. 1 charge deleted." with Undo (section 5).

**7.5 Resume.** Resuming that Netflix on 2 November with "Restart from today" moves `chargesFrom` to 2 November. The next charge is 5 November, and October stays empty. With "It never actually stopped", the 5 October charge is created again. Had the user instead moved the end date to 15 October, the Subscription would have run longer than recorded, and step 4 would recreate the 5 October charge.

**7.6 Delete**

1. Delete Netflix. The dialog says its 2 charges stay and offers to cancel instead.
2. Confirm. #5 and #16 stay as ordinary expenses with source `subscription`, and `?src=subscription` still finds them. The notice "Netflix deleted. Its charges stay in Transactions." has Dismiss only.

**7.7 Skip one charge.** Deleting the Cult Gym 10 October charge in Transactions writes its tombstone (F03, flow 7.6). If its Subscription was repriced in between, the delete meets 409 and the conflict view; Keep mine deletes it and writes the tombstone. A future charge is skipped from the panel instead (section 5).

**7.8 Pause and resume now.** Section 5's pause: Pause, "2 charges", "Pause until 5 Jan". Later, Resume now in the panel.

## 8. Validation and messages

| Field or action                | Rule                                                 | Message shown                                                                                                          |
| ------------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Name                           | Required, 1 to 60                                    | Enter a name, like Netflix or Rent. / Use 60 characters or fewer.                                                      |
| Amount                         | F03's amount rules                                   | F03's amount messages                                                                                                  |
| How often                      | Required                                             | Choose how often it repeats.                                                                                           |
| Custom cadence                 | 1 to 52 weeks, or 1 to 24 months                     | Enter how many weeks, from 1 to 52. / Enter how many months, from 1 to 24.                                             |
| Category                       | Required, an expense category                        | Choose a category.                                                                                                     |
| Started on                     | Within 10 years before to 1 year after today         | Choose a date from 2 Nov 2016 to 2 Nov 2027.                                                                           |
| End date                       | On or after Started on, within 10 years of today     | The end date can't be before the start date. / Choose an end date up to 2 Nov 2036.                                    |
| `createdAt` or `changedAt`     | 90 days before to 5 minutes after `ctx.now`          | This change is too old to apply. Discard it and make it again. / The change time can't be in the future. (`changedAt`) |
| Skip                           | A chargeable due date after the change date          | Only an upcoming charge can be skipped. / This charge was edited, so it stays. Delete it in Transactions to skip it.   |
| Undo skip                      | Its date is after the change date                    | This charge date has passed, so it can't be brought back.                                                              |
| Pause from                     | A chargeable due date after the change date          | Choose a date with a charge to pause from.                                                                             |
| Pause until                    | After the pause's first date; up to 24 months ahead  | Choose a date after 5 Nov. / Choose a date up to 2 Nov 2028.                                                           |
| Double-charge skip             | A due date of the new schedule after the change date | Choose a date with a charge to skip.                                                                                   |
| Backfill                       | Information, not an error                            | Yes, add 14 past charges, 9,086.00                                                                                     |
| Backfill duplicates            | Information                                          | You already have 2 Netflix expenses in that period, on 5 Sep, 5 Oct. Adding past charges would count them twice.       |
| End date                       | Confirmation, when charges are deleted               | This also deletes 1 charge dated after 30 Sep 2026: 5 Oct, 649.00.                                                     |
| Price, name or category change | Information                                          | Charges up to today keep their amount. Later ones use the new amount. (and BR-F05-24's variants)                       |
| Schedule change                | Information                                          | Past charges stay as they are. The new schedule applies from tomorrow.                                                 |
| Note only                      | Information                                          | Only the note changes. Charges stay as they are.                                                                       |
| Resume                         | Information                                          | Charges restart from today. Months while it was cancelled aren't added.                                                |
| Delete                         | Confirmation                                         | Delete Netflix? Its 2 charges stay in Transactions as ordinary expenses.                                               |
| A late sync                    | Toast (BR-F05-15)                                    | Netflix: 2 more charges were removed when this change synced.                                                          |
| A save fails                   | Dialog stays open                                    | The Subscription could not be saved. Check your connection and try again. Your changes are still here.                 |
| A delete fails                 | Dialog stays open                                    | The Subscription could not be deleted. Check your connection and try again.                                            |
| Any write                      | `version_conflict`                                   | This Subscription changed on another device. (Conflict view)                                                           |
| Any write                      | `not_found`                                          | This Subscription was deleted on another device.                                                                       |
| Undo                           | 422                                                  | This change can't be undone any more.                                                                                  |

"Today" in these messages is the recording date for a create and the change date for an edit.

## 9. Plan gating

None.

## 10. Offline behavior

- **Readable:** the Subscriptions list, the months and upcoming renewals, persisted (root 7.3), with "as of". The upcoming list and the calendar are computed on the device from cached schedules.
- **Writable from M5:** create, edit, pause, skip, undo skip, cancel, resume and delete queue (D-46, P1). Each carries `createdAt` or `changedAt`, so it takes effect from when it was made (BR-F05-08). The dialogs' footer says "Saved on this device until you reconnect.", and the notice adds "Saved on this device; it syncs when you reconnect."
- **Replay order:** items replay one by one, each with the version the previous one returned (D-265, D-269).
- **No charges offline:** charges are created only by server catch-up. While Subscription items wait, the lazy check and the boot endpoint are skipped on this device (D-244); the boot endpoint runs after replay (D-181).
- **Replay outcomes:**
    - A 422 rejects the item with its message, as P1 rejects any refused write; a skip whose date was charged and edited meanwhile is one (BR-F05-26).
    - 409 `version_conflict` opens the conflict view. Keep mine resends with the original `changedAt`, whose C is bounded by `lastChangeOn`.
    - A 404 on a change is rejected; a 404 on a delete counts as done (D-239).
    - Larger counts than the dialog showed raise BR-F05-15's toast.
    - A failed new Subscription shows "Not saved" and "Couldn't be saved." with Retry and Discard (P1).

## 11. Server surface

| Endpoint                                | Method | Input                                                                                                                                                                                                                                                                                        | Output                                                                                                                                      | Errors                                                                    | Idempotency and versioning                              |
| --------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| `/api/subscriptions`                    | GET    | none                                                                                                                                                                                                                                                                                         | `{ items, totals: { monthlyMinor, yearlyMinor, count }, upcoming, upcomingTotalMinor, thisMonth: { chargedMinor, toComeMinor }, currency }` | 401, 403 `profile_required`                                               | Read                                                    |
| `/api/subscriptions`                    | POST   | `{ id, name, amountMinor, currency, cadence, startDate, category, note, backfill, createdAt }`                                                                                                                                                                                               | 201 with the Subscription and `chargesCreated`; 200 for a repeated id                                                                       | 401, 403, 409 `id_conflict`, 422 `validation_failed`, `currency_mismatch` | `Idempotency-Key` required                              |
| `/api/subscriptions/[id]`               | PATCH  | `changedAt` plus changed fields from `name`, `amountMinor` (with `currency`), `cadence`, `startDate`, `category`, `note`, `endDate` (a date or `null`), `pause` (an object or `null`); and the options `skipDueOn`, `unskipDueOn`, `alsoPastCharges`, `backfillGap` (BR-F05-29 to BR-F05-34) | 200 with the Subscription and `{ changeDate, chargesCreated, chargesUpdated, chargesDeleted, months }`                                      | 401, 403, 404, 409 `version_conflict`, 422                                | `Idempotency-Key` and `If-Match` required               |
| `/api/subscriptions/[id]`               | DELETE | `{ changedAt }`, or `{ changedAt, undo: "create" }` (BR-F05-34)                                                                                                                                                                                                                              | 200 `{ changeDate, chargesCreated, chargesKept, chargesDeleted, months }`, where `chargesKept` counts the charges left as unlinked expenses | 401, 403, 404, 409 `version_conflict`, 422                                | `Idempotency-Key` and `If-Match` required               |
| `/api/subscriptions/[id]/skips`         | POST   | `{ dueOn, changedAt }`                                                                                                                                                                                                                                                                       | 200 with the Subscription                                                                                                                   | 401, 403, 404, 409 `version_conflict`, 422                                | `Idempotency-Key` and `If-Match` required               |
| `/api/subscriptions/[id]/skips/[dueOn]` | DELETE | `{ changedAt }`                                                                                                                                                                                                                                                                              | 200 with the Subscription                                                                                                                   | 401, 403, 404, 409 `version_conflict`, 422                                | `Idempotency-Key` and `If-Match` required               |
| `/api/subscriptions/months`             | GET    | `from`, `to` (BR-F05-36)                                                                                                                                                                                                                                                                     | `{ months: [{ month, chargedMinor, expectedMinor }], currency }`                                                                            | 400, 401, 403 `profile_required`                                          | Read                                                    |
| `/api/sync/catch-up`                    | POST   | `{}`                                                                                                                                                                                                                                                                                         | `{ skipped, chargesCreated, pricesUpdated }`                                                                                                | 401, 403 `profile_required`                                               | Exempt from `Idempotency-Key` (API-3); `catchUp: false` |

The create and change answers carry the counts beside the Subscription's own fields, not in a wrapper (D-601). Every answer that holds a Subscription also carries `currency` (API-6, D-609): the create, the change, a skip and bringing one back. The items of a list are in order of `createdAt`, then id (D-602). A create whose id the user already has answers 200 with that Subscription and `chargesCreated` 0 (D-603). Each item in `items` carries its stored fields and BR-F05-35's: `skips`, `nextDueOn`, `status`, `yearlyMinor`, `monthlyMinor`, `chargeCount`, `paidMinor`. Each entry of `upcoming` is `{ subscriptionId, dueOn, amountMinor }`.

**Shared functions**

| Function                                                                                                                                                                                                                   | Used by                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `dueDates(subscription, from, to)` in `src/lib/subscriptions`, with the status, next due, cost, month item and dialog preview helpers beside it                                                                            | Catch-up, the upcoming list, the months, every dialog preview      |
| `upcomingDue(tx, ctx, days)`, one statement                                                                                                                                                                                | This page (30 days), F10 (7 days)                                  |
| `subscriptionCosts(tx, ctx)`, one statement                                                                                                                                                                                | F08's widget, F11's report, which labels it "Current monthly cost" |
| `subscriptionSummary(tx, ctx)`: in one statement, the monthly and yearly cost (as `subscriptionCosts`) and the next renewal, the earliest next due date across Subscriptions (BR-F05-19) with its name and amount, or none | F08's widget                                                       |

## 12. Cross-feature effects

- **Charges are Transactions.** Creating, updating or deleting them invalidates the same queries as a Transaction write (F03, section 12), for the months in `months`, including Budgets and the dashboard.
- **A confirmed Subscription write** invalidates Subscriptions, the months, upcoming renewals, the whole dashboard prefix (F08, D-295), Insights (F10) and the demo status (F15). A create or delete also invalidates the profile, whose currency lock counts Subscriptions (BR-F02-14).
- **A confirmed Transaction write that changes a charge** (an edit, or a delete, which writes its tombstone) invalidates Subscriptions and the months, since charges and tombstones feed them (F03, section 12).
- **F10** reads renewals within 7 days; **F11** reads charges in the period and the current monthly cost; **F13** searches names, and its result selects the Subscription (BR-F05-21).
- **F15** seeds Subscriptions, charges and tombstones by these rules.

## 13. Edge cases

- **Due on the 29th to the 31st:** months clamp, and the next month returns to the anchor day (BR-F05-01), also for custom months.
- **A yearly Subscription started on 29 February:** charges on 28 February in other years and on the 29th again in leap years.
- **A time-zone change:** existing charges keep their `occurredAt`; later charges use midnight in the new zone (F02, BR-F02-13).
- **Midnight that does not exist** on a daylight-saving day, in zones that change their clocks at midnight such as America/Santiago: the charge moves to 01:00.
- **A long absence:** the first catch-up after weeks creates every missed charge at once, each with its own date.
- **An edited charge after C:** it is never repriced, renamed or deleted by a change, an end date, a pause or a delete. After a delete or an undone create it stays as an unlinked expense.
- **A queued edit of a charge that was repriced meanwhile:** it meets 409 with both versions (F03, BR-F03-24).
- **A charge deleted while its Subscription is being deleted:** F03 re-reads the charge after the lock (BR-F03-17).
- **Two devices change the same Subscription:** the second gets 409 and the conflict view.
- **Backfill for a weekly Subscription started 10 years ago:** about 520 charges, in one statement.
- **A start date in the future:** status `upcoming`, shown as "Starts 5 Dec"; no charge until then; counted in costs, since it has a next due date.
- **An end date before `chargesFrom`:** BR-F05-12 deletes any unedited linked charge after the end date, and catch-up creates nothing more.
- **A pause that ends:** the status returns to `active` or `ending` and the pause stays stored; a later pause replaces it under BR-F05-29, so its dates stay uncharged.
- **A pause past the end date:** the Subscription ends during it; the pause changes nothing after the end.
- **A skip and a pause on the same date:** the date stays skipped after the pause ends.
- **Skipping the only date left before the end:** next due becomes none, and the row moves to No more charges.
- **Undo near midnight:** the notice ends at midnight in the profile time zone (BR-F05-33). An Undo sent just before it may reach the server after midnight; its `changedAt` keeps C on the day of the write, so it applies as made.
- **A custom cadence equal to a preset:** stored and shown as the preset.

## 14. Acceptance criteria

The request clock is frozen per test. Steps that need a later day move it explicitly (TST-3).

- **AC-F05-01** (unit) `dueDates` gives every row of BR-F05-01's table.
- **AC-F05-02** (integration) On golden at the frozen clock:
    - next due, yearly and monthly figures match section 5;
    - the monthly total is 20,273.92;
    - upcoming 30 days holds 3 charges and totals 20,149.00;
    - within 7 days is Netflix only;
    - this month is charged 18,000.00 and still to come 2,149.00.
- **AC-F05-03** (integration) The first golden request on 2 November creates row 27 only. Repeating the boot endpoint creates nothing. With `Daybook-Queue: pending` it returns `skipped: true`.
- **AC-F05-04** (integration) A monthly Subscription started 13 months ago and created without backfill gets no past charge. With backfill it gets every past due date, as many as `dueDates` gives from the start to yesterday.
- **AC-F05-05** (integration) The late price change in section 5 (`changedAt` 4 November; sync request at 6 November with `Daybook-Queue: pending`):
    - gives a 799.00 charge on 5 November, with or without another device's catch-up;
    - repricing keeps that charge's id and raises its version;
    - an edited 5 November charge keeps its amount.

    The same change with `changedAt` on 5 November leaves that charge at 649.00.

- **AC-F05-06** (integration) Schedule changes:
    - the late schedule change in section 5 leaves exactly one November charge, on the 8th;
    - an upcoming start moved earlier charges from the new start;
    - an edited charge after C survives.
- **AC-F05-07** (integration) On golden at 2 November:
    - cancelling Netflix with end date 2026-09-30 deletes #16, and catch-up then creates nothing;
    - moving its end date to 2026-12-31 makes next due 5 November, and 5 October is never charged;
    - moving it instead to 2026-10-15 recreates the 5 October charge;
    - Cult Gym cancelled with end date 2026-09-30 keeps its 10 October tombstone.
- **AC-F05-08** (integration) Deleting Netflix keeps #5 and #16, with `subscriptionId` null and source `subscription`, and check E still totals 20,148.00. A delete whose C is before an existing unedited charge's due date deletes that charge; an edited one stays, unlinked.
- **AC-F05-09** (integration) A tombstoned date, past or future, is never recreated by the lazy, boot or on-change runs.
- **AC-F05-10** (integration) A charge created from a demo Subscription has `demo` true.
- **AC-F05-11** (integration) Each of these returns 422:
    - `startDate` 11 years back;
    - an `endDate` before `startDate`;
    - a `changedAt` 91 days old;
    - a cadence of 0 or 53 weeks, or 25 months.

- **AC-F05-12** (client integration, M5) Offline, a pending Subscription's upcoming entries show "Pending" and are left out of the totals, and no charge appears in Transactions until sync.
- **AC-F05-13** (integration) `/api/transactions?sub=<golden Netflix id>` returns #5 and #16, with Out 1,298.00.
- **AC-F05-14** (integration) A charge deleted from a stale device after a reprice returns 409. Keep mine deletes it and writes the tombstone, and catch-up never recreates it.
- **AC-F05-15** (accessibility) The page, its three views, the panel and every dialog pass axe with no serious or critical violations and work by keyboard alone.
- **AC-F05-16** (performance) On the stress account, saving a new Subscription and saving a change to one each stay within INP 200 ms (root 11.1, D-580).
- **AC-F05-17** (unit) Costs follow BR-F05-16 and section 5's custom table: 3,120.00 and 260.00 for 120.00 every 2 weeks, 1,733.33 and 144.44 for 100.00 every 3 weeks, 1,714.29 and 142.86 for 1,000.00 every 7 months; page totals are summed unrounded and rounded once.
- **AC-F05-18** (integration) Skips on golden at 2 November: skipping Netflix's 5 November makes next due 5 December and the next 30 days 19,500.00; catch-up on 5 November creates nothing; Undo skip on 3 November brings it back; skipping 5 October, 2 November or a date that is not due returns 422; Undo skip on 5 November returns 422. Each skip raises `version` and leaves `lastChangeOn`.
- **AC-F05-19** (integration) Section 5's pause: status `paused`, next due 5 January 2027, monthly cost 20,273.92, next 30 days 19,500.00, and catch-up through 5 December creates no Netflix charge. Resume now on 10 November makes next due 5 December, and 5 November is never charged. A later pause that replaces this one never charges 5 November.
- **AC-F05-20** (integration) Section 5's double charge: the change on 6 November with `skipDueOn` 2026-11-15 tombstones 15 November and gives next due 15 December; without it, next due is 15 November. A `skipDueOn` that is not a new due date after C returns 422.
- **AC-F05-21** (integration) Renaming golden Netflix to "Netflix Premium" on 2 November with `alsoPastCharges` gives #5 and #16 that payee at 649.00 each, with `edited` false; without it they keep "Netflix". An edited past charge keeps its payee either way.
- **AC-F05-22** (integration) Section 5's cancel and Undo: after the cancel, `PATCH` with `endDate: null` and `backfillGap` creates a 5 October charge at 649.00 under a new id, and next due is 5 November.
- **AC-F05-23** (integration) Section 5's backfill, then `DELETE` with `undo: "create"` at version 1, removes the Subscription and its 14 charges; an edited one stays, unlinked. At version 2 it returns 409.
- **AC-F05-24** (integration) On golden, the Cult Gym item's `skips` is `["2026-10-10"]` and `paidMinor` 150000. `months` from 2026-10 to 2026-12 returns section 5's figures (BR-F05-36), and a span over 24 months returns 400.
- **AC-F05-25** (integration) Section 5's several queued changes: both items get C = 4 November, and the 5 November charge ends up at 799.00 in Shopping.
- **AC-F05-26** (unit) Status takes the first match in section 3's order: an `endDate` of today is `ended`; a pause whose `until` is today is not `paused`; an upcoming Subscription with a pause is `upcoming`.
- **AC-F05-27** (integration) Late skips on golden Netflix: a skip of 5 November with `changedAt` on 3 November, synced on 6 November after another device created the 5 November charge, deletes that charge and writes the tombstone; with that charge edited, it returns 422. An Undo skip of 5 November with `changedAt` on 3 November, synced on 6 November, charges 5 November. A repeated skip and an Undo skip of a date with no tombstone each answer 200 without a version change.
- **AC-F05-28** (integration) Pause refusals: a `from` that is not the next due date, an `until` not after `from`, and an `until` past 24 months each return 422. Paused from 5 November to 5 January, Resume now on 5 December charges 5 December; its Undo the same day puts the pause back and deletes that charge. Resume now on 5 November itself clears the pause and charges 5 November.
- **AC-F05-29** (integration) Undo of section 5's double-charge change, with `unskipDueOn` 2026-11-15, puts the start back to 2026-09-05 with no 15 November tombstone, and next due is 5 December.
- **AC-F05-30** (integration) On golden at 2 November, Cancel "Now" on Netflix sets `endDate` 2026-11-02 with status `ended` and deletes nothing. After section 5's cancel in the past, a resume with "Restart from today", its Undo, and then a resume with `backfillGap` still create the 5 October charge.
- **AC-F05-31** (client integration, M5) A queued cancel whose dialog showed 1 deletion and whose response has `chargesDeleted` 3 shows "Netflix: 2 more charges were removed when this change synced."
- **AC-F05-32** (integration) A change whose fields all equal the stored ones answers 200 with the same version and no charge. An end date of 2026-09-30 on golden Netflix deletes #16 although it is due before C. A change that waits for another writer's lock sees the tombstone that writer committed and does not charge that date.
- **AC-F05-33** (client integration) Whole charge sets (BR-F05-48): a month with 130 charges reads two pages of 100 and 30 and shows all 130 items; a Subscription created with backfill and holding 101 charges lists all 101 in its timeline after "Show all", and Cancel with "I cancelled it earlier" on its start date counts the 100 after it in the deletion line; a failing second page shows "Charges could not be loaded." with Retry, never part of the set. A name of "TV" or "99" reads no duplicates and shows no note. Add's duplicate note on golden Netflix started 5 Sep 2026 names 5 Sep and 5 Oct and leaves out a "Netflix Premium" expense.
- **AC-F05-34** (unit) Page wording on golden at 2 November in `en-IN` (BR-F05-22, BR-F05-37, BR-F05-49):
    - the date columns read "Thu, 5 Nov" over "in 3 days" (Netflix), "Tue, 10 Nov" over "in 8 days" (Cult Gym), "Tue, 1 Dec" over "in 29 days" (Sunrise Apartments) and "12 Oct 2027" over "in 11 months" (Amazon Prime);
    - the amounts read "₹649.00 a month", "₹1,500.00 a month", "₹18,000.00 a month" and "₹1,499.00 a year", and only Amazon Prime has "≈ ₹124.92 a month";
    - the groups are "Within 7 days · 1" (₹649.00), "Within 30 days · 2" (₹19,500.00) and "Later · 1", with no Ended group, and a Subscription due yesterday reads "yesterday" and stays in Within 7 days;
    - a weekly Subscription with 5 charges in the next 30 days reads "5 charges in the next 30 days" with their sum, and one with a single charge has no caption.
- **AC-F05-35** (unit) The table on golden (BR-F05-39): sorted by Per month, largest first, it lists Sunrise Apartments, Cult Gym, Netflix and Amazon Prime with Shares 88.8%, 7.4%, 3.2% and 0.6%, and "Total · 4" with ₹20,273.92 a month and ₹2,43,287.00 a year. A Subscription with no next due date shows "—" as Share and Next due, is left out of the Total and sorts last in either direction.
- **AC-F05-36** (unit) The row menu (BR-F05-22): an active Subscription with a next due date offers Edit, "Skip the 5 Nov charge", Pause, Cancel Subscription, View charges and Delete in that order; a paused one Resume now, Change pause and Cancel Subscription; an ending one Change end date and Keep it going; an upcoming one Edit, View charges and Delete; an ended one Resume, Edit, View charges and Delete. Pause is left out when the next due date is on or after 24 months from today.

## 15. Illustrations

Illustrative, a list item:

```json
{
	"id": "0192…",
	"name": "Amazon Prime",
	"amountMinor": 149900,
	"cadence": { "unit": "month", "every": 12 },
	"startDate": "2026-10-12",
	"category": "entertainment",
	"note": "",
	"endDate": null,
	"pause": null,
	"skips": [],
	"chargesFrom": "2026-10-12",
	"lastChangeOn": "2026-10-12",
	"status": "active",
	"nextDueOn": "2027-10-12",
	"yearlyMinor": 149900,
	"monthlyMinor": 12492,
	"chargeCount": 1,
	"paidMinor": 149900,
	"version": 1,
	"demo": false
}
```

Illustrative, the page on a phone:

```text
Subscriptions                                      [+]
[ List | Calendar ]

Monthly cost
₹20,273.92
₹2,43,287.00 a year · 4 Subscriptions
November                              ₹20,149.00 in all
███████████████████████████████░░░
Charged ₹18,000.00               Still to come ₹2,149.00
Next 30 days · 3 charges                    ₹20,149.00

Within 7 days · 1                              ₹649.00
  Netflix  • Entertainment             ₹649.00 a month
                                             Thu 5 Nov
Within 30 days · 2                          ₹19,500.00
  Cult Gym  • Health                 ₹1,500.00 a month
                                            Tue 10 Nov
  Sunrise Apartments  • Housing     ₹18,000.00 a month
                                             Tue 1 Dec
Later · 1
  Amazon Prime  • Entertainment       ₹1,499.00 a year
                                           12 Oct 2027
```
