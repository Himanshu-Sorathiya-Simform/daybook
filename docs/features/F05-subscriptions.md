# F05 Subscriptions

16 Oct 2026 · @Himanshu

A Subscription is any recurring bill the user tracks: streaming, rent, insurance, a loan EMI, a gym. It has an amount, a cadence and a start date. Daybook writes each due charge into Transactions as an expense, up to today, through catch-up. Spending and Budgets therefore include it exactly once. Future renewals are never stored; they are computed from the schedule.

The Subscriptions page shows monthly and yearly cost, renewals over the next 30 days, and every Subscription's next due date. A Subscription can be changed, cancelled, resumed or deleted. Every change takes effect after the day it was made (a resume from that day itself), even when it syncs days later or after another device has already added charges. Stripe is not involved: anything Stripe bills is Premium (NAM-1, D-27).

| Item | Value |
| --- | --- |
| Milestone | M2. Before M5, writes are online only: Save is disabled offline with "You are offline. Connect to save.", a failed save keeps the dialog open, and the app calls the boot endpoint once at start. From M5 the write queue (P1) adds offline writes, and boot step 5 calls the endpoint (D-241) |
| Plan | Free and Premium; no capability codes |
| Depends on | [F03](F03-transactions.md) (charges are Transactions), [F02](F02-onboarding-profile-settings.md) (time zone, today), [P2](../platform/P2-data-access-and-security.md) (catch-up check, locks, request clock); P1 (write queue and boot sequence); F08, F10, F11, F13 read Subscriptions |
| Decisions | D-26, D-27, D-70 to D-72, D-90 to D-96, D-181, D-213, D-219, D-224, D-236, D-239, D-241, D-244, D-250 to D-257, D-265, D-267, D-269, D-270 |

## 1. User stories

- As a user, I want to add a recurring bill once and have its charges appear in my Transactions on their due dates, without entering them every month.
- As a user adding a Subscription I have paid for years, I want to choose whether its past charges are added too.
- As a user, I want to see what my Subscriptions cost a month and a year, and what renews in the next 30 days.
- As a user whose price went up, I want the new price on charges after today while earlier ones keep theirs.
- As a user, I want to skip one charge, cancel from a date, or resume, without the app recreating what I removed.
- As a user, I want to delete a Subscription and keep the charges that really happened.
- As a user who changed a Subscription offline, I want it to take effect from when I changed it, even if another device added charges before mine synced.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| Create, edit, cancel, resume and delete; four cadences with anchored schedules; past-charge backfill on create; catch-up and the boot endpoint; charges as Transactions with tombstones; reconciling charges after a change; costs; upcoming renewals; next due dates; the Subscriptions page; charge drill-down; offline writes | Push reminders for renewals (D-144, P1) | Pause (D-94); free trials (D-94); custom intervals such as every 10 days (G1); recurring income (D-72); scheduled future price changes; price history (costs use current amounts); restoring a skipped charge after its Undo window (add a manual expense instead); Stripe for Subscriptions (D-27); email or calendar reminders |

## 3. Concepts and fields

**Subscription** (private)

| Field | Meaning | Required | Rules | Example |
| --- | --- | --- | --- | --- |
| `id` | UUIDv7 | Yes | Client-generated (ID-1) | |
| `name` | What it is | Yes | 1 to 60 characters (root 6.7); the default payee of its charges (TXN-4); duplicates allowed | `Netflix` |
| `amountMinor` | The price of one charge | Yes | MON-5 | `64900` |
| `cadence` | How often | Yes | `weekly`, `monthly`, `quarterly`, `yearly` (D-90) | `monthly` |
| `startDate` | The date of the first charge; the schedule repeats from it | Yes | From 10 years before to 1 year after the recording date (create) or the change date (edit) (D-257) | `2026-09-05` |
| `category` | An expense category (CAT-2) | Yes | Copied to each new charge | `entertainment` |
| `note` | Optional text | No | Up to 500; not copied to charges | |
| `endDate` | The last date a charge may fall on | No | `null` while it runs; from `startDate` to 10 years after the change date | |
| `chargesFrom` | The first date catch-up may charge | System | BR-F05-03, BR-F05-11, BR-F05-13 | `2026-09-05` |
| `lastChangeOn` | The change date of the last applied change | System | The recording date on create; C after each change except a note-only one (D-267) | `2026-09-05` |
| `demo` | Loaded as demo data | System | F15; its charges inherit it (D-234) | `false` |
| `version`, `createdAt`, `updatedAt` | P2 | System | `createdAt` is client-set on create, from 90 days before to 5 minutes after `ctx.now` (D-267) | |

**`changedAt` and the change date C.** Every write after the create carries `changedAt`: the client instant when the user made the change. It must lie from 90 days before to 5 minutes after `ctx.now` (D-267). The change date C is computed in the profile time zone:
1. Take the later of `changedAt`'s date and `lastChangeOn`.
2. Never let it pass today.

A queued change therefore never reaches back past a change applied before it, and a skewed device clock cannot rewrite old history. Several changes queued on one device keep their own dates, because each sets `lastChangeOn` to its own C.

**Tombstone** (private, a child of a Subscription): `(subscriptionId, dueOn)`. It is written when a charge is deleted, and catch-up never charges a tombstoned date (D-93). Tombstones are deleted only together with their Subscription.

**Charge.** An expense Transaction with source `subscription`, `subscriptionId` and `dueOn` (F03). Its `edited` flag turns true the first time the user edits it (F03, BR-F03-16) and never turns back.
- **Repricing:** the server updates a charge only to reprice an unedited one (BR-F05-10, BR-F05-11). That bumps `version` like any update, so an edit queued before it meets 409 and the conflict view.
- **Removal:** the server deletes a charge only by BR-F05-11, BR-F05-12 and BR-F05-14, and never an edited one.

**Derived values** (never stored)

| Value | Meaning |
| --- | --- |
| Due dates | `startDate` plus k periods, k = 0, 1, 2, … (BR-F05-01) |
| Chargeable dates | Due dates from `chargesFrom` to `endDate` (or without an end) |
| Next due | The earliest chargeable date on or after today with no charge and no tombstone |
| Status | First match of: `ended` (`endDate` before today), `upcoming` (`startDate` after today), `ending` (`endDate` set), `active` |
| Yearly cost | `amountMinor` × 52, 12, 4 or 1 by cadence |
| Monthly equivalent | Yearly cost ÷ 12, rounded half away from zero, for display |

## 4. Business rules

**Schedules (TIME-9, D-90)**

- **BR-F05-01** Due date k is always computed from `startDate`, never from the previous due date. It uses the shared `shared/schedule` module, which the server and the browser both use:
    - **weekly:** `startDate` + 7k days;
    - **monthly:** `startDate` + k months;
    - **quarterly:** `startDate` + 3k months;
    - **yearly:** `startDate` + 12k months.

    Month arithmetic keeps the start's day of month and clamps it to each month's length, through date-fns `addMonths` from the start.

    | Start | Cadence | First due dates |
    | --- | --- | --- |
    | 2026-01-31 | monthly | 2026-01-31, 2026-02-28, 2026-03-31, 2026-04-30 |
    | 2028-02-29 | yearly | 2028-02-29, 2029-02-28, 2030-02-28, 2031-02-28, 2032-02-29 |
    | 2026-11-30 | quarterly | 2026-11-30, 2027-02-28, 2027-05-30, 2027-08-30 |
    | 2026-10-12 | yearly | 2026-10-12, 2027-10-12 |

**Charges and catch-up (JOB-1, JOB-2)**

- **BR-F05-02** Catching a Subscription up through date D creates one charge for each chargeable date d where d is on or before D, d is on or before today, and (Subscription, d) has neither a charge nor a tombstone. Each charge has:
    - **The basics:** type `expense`, and the Subscription's current amount, category and name (as payee).
    - **Dates:** `dueOn` and `occurredOn` are d, and `occurredAt` is 00:00 on d in the profile time zone (TIME-6). Where midnight does not exist on a daylight-saving day, it moves forward by the gap (F03, BR-F03-06).
    - **System fields:** source `subscription`, `edited` false, the Subscription's `demo` flag, `createdAt` and `updatedAt` both `ctx.now`, and a server-generated UUIDv7 id.

    The dates are computed with `shared/schedule` and inserted in one statement with `ON CONFLICT (subscription_id, due_on) DO NOTHING`, so catch-up is idempotent.
- **BR-F05-03** On create, `chargesFrom` depends on "Also add past charges" (D-91, D-250):
    - **chosen:** `startDate`;
    - **not chosen (the default):** the later of `startDate` and the recording date. The recording date is `createdAt`'s date in the profile time zone, never later than today.

    `lastChangeOn` is the recording date. Golden: each Subscription was created on its start date without backfill, so `chargesFrom` equals `startDate` and the first charge falls on the start date.
- **BR-F05-04** "Also add past charges" appears only when `startDate` is before the recording date, and only on create. It is off by default. It shows what it adds, computed in the browser from the schedule: "Adds 14 charges, 9,086.00 in total."
- **BR-F05-05** Catch-up runs at three moments (JOB-1). Each run locks the profile, then each Subscription it covers with `FOR UPDATE` in id order (SRV-7, JOB-2).
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
- **BR-F05-07** Deleting a single charge writes its tombstone in the same transaction, under the Subscription lock (F03, BR-F03-17; D-93, D-236), so the charge is never recreated. Golden: the Cult Gym charge for 2026-10-10 is a tombstone, and October's charges total 20,148.00.

**Changes: one order for every change (D-250)**

- **BR-F05-08** Every change runs in one write transaction, in this order:
    1. **Lock and check:** take the profile lock, then lock the Subscription with `SELECT ... FOR UPDATE` and compare `If-Match` (SRV-7). A mismatch returns 409 before anything is written.
    2. **Close the old period:** catch the Subscription up through C, with its values from before the change. The change date itself always belongs to the old values. When the change sets an end date or moves it earlier, this step stops at the earlier of C and the new end date, so it never creates a charge that step 3 would delete.
    3. **Apply:** apply the change and its charge rule (BR-F05-09 to BR-F05-14), then set `lastChangeOn` to C (BR-F05-09 excepted).
    4. **Open the new period:** catch it up through today with its new values. A delete skips this step.

    Charges through C follow the old values, and charges after C follow the new ones, whatever other devices did in between. The response carries `changeDate`, the counts `chargesCreated`, `chargesUpdated` and `chargesDeleted`, and `months`: every month whose charges changed, so the client can invalidate exactly those months.
- **BR-F05-09** A change to `note` alone changes no charge and does not move `lastChangeOn`.

**Value and schedule changes (D-92, D-250)**

- **BR-F05-10** A change to `amountMinor`, `name` or `category` applies to charges due after C (D-92: future charges only).
    - **The update:** step 3 reprices the unedited charges due after C in place, in one statement: `UPDATE ... SET amount, category, payee, version = version + 1, updated_at = <ctx.now> WHERE subscription_id = $1 AND due_on > C AND NOT edited` (P2, BR-P2-21 and BR-P2-43). Ids stay the same, so tombstones, queued edits and caches keep pointing at the right rows.
    - **Kept as they were:** edited charges, and charges through C.
    - **Dialog text:** "Charges up to today keep their amount. Later ones use the new amount."
    - **Example:** a change made offline on 4 November reprices the 5 November charge, even if another device created it before the change synced.
- **BR-F05-11** A change to `startDate` or `cadence` does two things:
    - **`chargesFrom`:** it becomes the new `startDate` if that is after C, and otherwise the day after C. The change date always keeps the old schedule.
    - **Unedited charges due after C:** those on a due date of the new schedule, from the new `chargesFrom`, are kept and repriced if values changed too. The rest are deleted.

    Step 4 creates the new schedule's other charges. Charges through C, and edited charges, stay.
    - **Dialog text:** "Past charges stay as they are. The new schedule applies from tomorrow."
    - **An upcoming Subscription:** created on 2 November to start 5 December, then moved on 3 November to 1 December, gets `chargesFrom` 1 December.

**End dates, cancel and resume (D-94, D-251)**

- **BR-F05-12** Cancelling sets `endDate`, which defaults to C; any date from `startDate` onward may be chosen. An upcoming Subscription offers Delete instead of Cancel. Whenever `endDate` is set or moved earlier, step 3 deletes the unedited linked charges due after it.
    - **Edited charges stay,** still linked.
    - **The count:** when it is above zero, the dialog states it first: "This also deletes 1 charge dated after 30 Sep 2026."
    - **Tombstones are kept,** so a skipped date stays skipped if the end date moves again.
    - **A future end date:** charges continue until then, and the status is `ending`, shown as "Ends 31 Dec 2026".
- **BR-F05-13** Moving `endDate` later, or clearing it, depends on where the dates fall:
    - **The new end date is on or before C:** the Subscription ran longer than recorded. Step 4 creates its charges through the new end date, except tombstoned dates.
    - **Cleared, or moved after C, while the stored end date is before C** (a resume): `chargesFrom` becomes the later of its current value and C. The months while it was cancelled are never charged; C itself is charged if it is a due date. The dialog says: "Charges restart from today. Months while it was cancelled aren't added."
    - **The stored end date is on or after C:** the Subscription is still running, so nothing else changes.

**Delete (D-96, D-252)**

- **BR-F05-14** A delete works like a cancel with end date C, followed by removal. It runs BR-F05-08 steps 1 and 2, then:
    1. Delete the unedited linked charges due after C. These exist only when the delete was made offline and catch-up ran elsewhere in between.
    2. Delete its tombstones.
    3. Delete the Subscription.

    Its remaining charges, edited ones included, stay as ordinary expenses. They keep source `subscription` and `dueOn`, and their `subscriptionId` becomes null (`ON DELETE SET NULL (subscription_id)`, P2, BR-P2-06). The dialog says: "Delete Netflix? Its 14 charges stay in Transactions as ordinary expenses."

**After a late sync**

- **BR-F05-15** A change that syncs late can delete more charges than its dialog showed, because charges were added in between. The queued item stores the deletion count its dialog showed (0 when it showed none). When the response's `chargesDeleted` is larger, the client shows a toast after the item syncs: "Netflix: 2 more charges were removed when this change synced." Updates and creations never raise a toast, since they follow the change the user made.

**Costs (D-90, D-253)**

- **BR-F05-16** Each Subscription's yearly cost is its amount times 52 (weekly), 12 (monthly), 4 (quarterly) or 1 (yearly). Its monthly equivalent is the yearly cost ÷ 12, rounded half away from zero, for display only.
- **BR-F05-17** The page totals count every Subscription that has a next due date.
    - **Yearly cost:** Σ yearly costs.
    - **Monthly cost:** Σ yearly costs ÷ 12, rounded once (MON-7).

    Costs use current amounts; there is no price history. Golden: 243,287.00 a year and 20,273.92 a month.
- **BR-F05-18** "Charges this month" is the Out figure of the Transactions summary for `src=subscription` and the current month (FIL-2). It therefore includes charges of deleted Subscriptions and matches the list exactly. Golden October: 20,148.00 (check E).

**Upcoming renewals (D-95, D-254)**

- **BR-F05-19** Next due is the earliest chargeable date on or after today with no charge and no tombstone. Golden: Netflix 2026-11-05, Cult Gym 2026-11-10, Sunrise Apartments 2026-12-01 (1 November is already charged), Amazon Prime 2027-10-12.
- **BR-F05-20** The upcoming list holds every such date from today through today + 30 days, inclusive, so weekly Subscriptions appear up to five times. It is sorted by date, then name, each entry with the current amount, and shows a total. Golden: Netflix 5 Nov, Cult Gym 10 Nov, Sunrise Apartments 1 Dec, total 20,149.00. F10's renewals insight uses the same function with 7 days: Netflix only.

**The page and dialogs**

- **BR-F05-21** `/subscriptions` shows, top to bottom:
    1. **Summary:** Monthly cost, Yearly cost, Charges this month.
    2. **Next 30 days:** the upcoming list and its total.
    3. **Subscriptions:** every one that is not ended, sorted by next due, then name. Those without a next due date come last, by name.
    4. **Ended:** collapsed, sorted by end date, newest first.

    Pending items carry "Pending sync" (OFF-6).

    **Deep link:** `/subscriptions?open=<id>` opens that Subscription's dialog over the page, for F13's search results (D-347). An ended Subscription's dialog opens with the Ended group expanded behind it, so the user can Resume it. An unknown id opens nothing, and the parameter is removed.
- **BR-F05-22** A row shows:
    - the name and the category chip;
    - the amount with its cadence: "649.00 a month", "120.00 a week", "6,200.00 every 3 months" or "1,499.00 a year";
    - for non-monthly cadences, "≈ 124.92 a month";
    - "Next: 5 Nov";
    - its badges: "Starts 5 Dec" when the start is after today, "Ends 31 Dec 2026" when an end date is set, "Ended 31 Aug 2026" once it has passed;
    - a menu: Edit, Cancel (or Resume; Delete only for upcoming ones), View charges, Delete.
- **BR-F05-23** View charges opens `/transactions?sub=<id>` (root 6.9, D-255).
- **BR-F05-24** The Subscription dialog is a bottom sheet on phones. It asks for:
    - Name;
    - Amount (F03's amount rules);
    - Cadence (Weekly, Monthly, Every 3 months, Yearly);
    - Category;
    - "Started on", with the help text "The date of the first charge. Daybook repeats from this date.";
    - Note, behind "Add a note";
    - on create, the backfill choice (BR-F05-04).

    Editing shows the BR-F05-10 and BR-F05-11 texts as soon as a field they cover changes.
- **BR-F05-25** Every Subscription write takes the profile lock (D-213). Requests that send an amount carry `currency`. Writes are offline-writable from M5 (D-46). Queued Subscription items replay one by one: they are never merged, except that a create and a later delete of the same queued Subscription cancel out (D-265). Each later item uses the version the previous one returned (D-269). No charge is ever generated on the device.

## 5. Calculations

**Golden, as of 2 November** ([03-golden-dataset.md](../03-golden-dataset.md#subscriptions-as-of-2-november))

| Name | Cadence | Next due | Yearly cost | Monthly equivalent |
| --- | --- | --- | --- | --- |
| Netflix | monthly | 2026-11-05 | 7,788.00 | 649.00 |
| Cult Gym | monthly | 2026-11-10 | 18,000.00 | 1,500.00 |
| Sunrise Apartments | monthly | 2026-12-01 | 216,000.00 | 18,000.00 |
| Amazon Prime | yearly | 2027-10-12 | 1,499.00 | 124.92 |
| **Total** | | | **243,287.00** | **20,273.92** (243,287.00 ÷ 12 = 20,273.9166…, rounded once) |

- **Upcoming, next 30 days:** 20,149.00.
- **Within 7 days:** Netflix only; Cult Gym on 10 November is just outside.
- **Charges in October:** 20,148.00 (#12, #16, #20); the tombstoned Cult Gym charge is not one of them.
- **Catch-up on 2 November:** whichever catch-up runs first that day, boot or lazy, creates row 27 (Sunrise Apartments, due 1 November) and nothing else.

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

**Several queued changes.** Offline, both with `changedAt` on 4 November, the user changes Netflix to 799.00 and then its category to Shopping. Both sync in requests at 9 November.
- **The first item:** C = 4 November; `lastChangeOn` becomes 4 November.
- **The second item:** uses the version the first returned (D-269), and its C is also 4 November.

The 5 November charge ends up with both changes.

**Backfill count.** A monthly Subscription started 2025-09-05 and created on 2026-11-02 with backfill has due dates 2025-09-05 to 2026-10-05: 14 dates. At 649.00 each, the dialog shows "Adds 14 charges, 9,086.00 in total."

**Weekly cost.** 120.00 weekly gives a yearly cost of 6,240.00 and a monthly equivalent of 520.00.

## 6. Screens and states

**`/subscriptions`.** BR-F05-21 to BR-F05-23. Dialogs: BR-F05-24, Cancel (BR-F05-12), Resume (BR-F05-13) and Delete (BR-F05-14).

| State | What the user sees |
| --- | --- |
| Loading | Skeleton summary, upcoming list and rows |
| Empty | "No Subscriptions yet. Add rent, streaming, insurance or any bill that repeats." with Add a Subscription |
| Error | "Subscriptions could not be loaded." with Retry |
| Offline | Cached data with "as of". The upcoming list is recomputed on the device from cached schedules, including pending ones. Writes queue from M5 |
| Pending | "Pending sync" on rows. A pending Subscription's upcoming entries are marked "Pending" and left out of the totals |
| Locked (Premium) | n/a |
| Read-only | Ended Subscriptions offer Resume, View charges and Delete; their fields can still be edited |

## 7. Flows

**7.1 Add a Subscription**

1. The user selects Add a Subscription: Netflix, 649, Monthly, Entertainment, started 5 Sep 2025.
2. The start is in the past, so the backfill choice shows "Adds 14 charges, 9,086.00 in total." They leave it off.
3. `POST /api/subscriptions`. In one transaction:
    - `chargesFrom` and `lastChangeOn` become today;
    - the Subscription is inserted;
    - it is caught up through today, which creates no charge, since the next due date is 5 November.
4. The row appears with "Next: 5 Nov". **422:** field messages.

**7.2 Boot catch-up.** On start, after replaying the queue, the app calls `POST /api/sync/catch-up` (root 5.2, D-181).
- On 2 November, as the process's first request of the day, golden gets `{ skipped: false, chargesCreated: 1, pricesUpdated: true }` and refetches Transactions, the dashboard, Budgets and Subscriptions. If the first page was rendered on the server, its lazy check already created row 27, and the endpoint returns zeros.
- With Subscription items still waiting, it gets `{ skipped: true }` and calls again after the next successful replay.

**7.3 Price change.** On 2 November the user edits Sunrise Apartments to 19,500. The dialog shows the BR-F05-10 text, and the next charge, on 1 December, is 19,500.00.

**7.4 Cancel in the past**

1. On 2 November the user cancels Netflix with an end date of 30 September.
2. The dialog says "This also deletes 1 charge dated after 30 Sep 2026." That is #16, on 5 October.
3. Confirm. #16 is deleted, Netflix leaves the upcoming list, and its status becomes `ended`, shown as "Ended 30 Sep 2026".

**7.5 Resume.** Resuming that Netflix on 2 November moves `chargesFrom` to 2 November. The next charge is 5 November, and October stays empty. Had the user instead moved the end date to 15 October, the Subscription would have run longer than recorded, and step 4 would recreate the 5 October charge.

**7.6 Delete**

1. Delete Netflix. The dialog says its charges stay.
2. Confirm. #5 and #16 stay as ordinary expenses with source `subscription`, and `?src=subscription` still finds them.

**7.7 Skip one charge.** Deleting the Cult Gym 10 October charge in Transactions writes its tombstone (F03, flow 7.6). If its Subscription was repriced in between, the delete meets 409 and the conflict view; Keep mine deletes it and writes the tombstone.

## 8. Validation and messages

| Field or action | Rule | Message shown |
| --- | --- | --- |
| Name | Required, 1 to 60 | Enter a name, like Netflix or Rent. / Use 60 characters or fewer. |
| Amount | F03's amount rules | F03's amount messages |
| Cadence | Required | Choose how often it repeats. |
| Category | Required, an expense category | Choose a category. |
| Started on | Within 10 years before to 1 year after today | Choose a date from 2 Nov 2016 to 2 Nov 2027. |
| End date | On or after Started on, within 10 years of today | The end date can't be before the start date. |
| `createdAt` or `changedAt` | 90 days before to 5 minutes after `ctx.now` | This change is too old to apply. Discard it and make it again. |
| Backfill | Information, not an error | Adds 14 charges, 9,086.00 in total. |
| End date | Confirmation, when charges are deleted | This also deletes 1 charge dated after 30 Sep 2026. |
| Price, name or category change | Information | Charges up to today keep their amount. Later ones use the new amount. |
| Schedule change | Information | Past charges stay as they are. The new schedule applies from tomorrow. |
| Resume | Information | Charges restart from today. Months while it was cancelled aren't added. |
| Delete | Confirmation | Delete Netflix? Its 14 charges stay in Transactions as ordinary expenses. |
| A late sync | Toast (BR-F05-15) | Netflix: 1 charge added on another device was updated to the new price. / … was removed. |
| Any write | `version_conflict` | This Subscription was changed on another device. (Conflict view) |
| Any write | `not_found` | This Subscription was deleted on another device. |

"Today" in these messages is the recording date for a create and the change date for an edit.

## 9. Plan gating

None.

## 10. Offline behavior

- **Readable:** the Subscriptions list and upcoming renewals, persisted (root 7.3), with "as of". The upcoming list is computed on the device from cached schedules.
- **Writable from M5:** create, edit, cancel, resume and delete queue (D-46, P1). Each carries `createdAt` or `changedAt`, so it takes effect from when it was made (BR-F05-08).
- **Replay order:** items replay one by one, each with the version the previous one returned (D-265, D-269).
- **No charges offline:** charges are created only by server catch-up. While Subscription items wait, the lazy check and the boot endpoint are skipped on this device (D-244); the boot endpoint runs after replay (D-181).
- **Replay outcomes:**
    - 409 `version_conflict` opens the conflict view. Keep mine resends with the original `changedAt`, whose C is bounded by `lastChangeOn`.
    - A 404 on a change is rejected; a 404 on a delete counts as done (D-239).
    - Larger counts than the dialog showed raise BR-F05-15's toast.

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency and versioning |
| --- | --- | --- | --- | --- | --- |
| `/api/subscriptions` | GET | none | `{ items, totals: { monthlyMinor, yearlyMinor }, upcoming, upcomingTotalMinor, chargesThisMonthMinor, currency }` | 401, 403 `profile_required` | Read |
| `/api/subscriptions` | POST | `{ id, name, amountMinor, currency, cadence, startDate, category, note, backfill, createdAt }` | 201 with the Subscription and `chargesCreated`; 200 for a repeated id | 401, 403, 409 `id_conflict`, 422 `validation_failed`, `currency_mismatch` | `Idempotency-Key` required |
| `/api/subscriptions/[id]` | PATCH | `changedAt` plus changed fields from `name`, `amountMinor` (with `currency`), `cadence`, `startDate`, `category`, `note`, `endDate` (a date or `null`) | 200 with the Subscription and `{ changeDate, chargesCreated, chargesUpdated, chargesDeleted, months }` | 401, 403, 404, 409 `version_conflict`, 422 | `Idempotency-Key` and `If-Match` required |
| `/api/subscriptions/[id]` | DELETE | `{ changedAt }` | 200 `{ changeDate, chargesCreated, chargesKept, chargesDeleted, months }` | 401, 403, 404, 409 `version_conflict`, 422 | `Idempotency-Key` and `If-Match` required |
| `/api/sync/catch-up` | POST | `{}` | `{ skipped, chargesCreated, pricesUpdated }` | 401, 403 `profile_required` | Exempt from `Idempotency-Key` (API-3); `catchUp: false` |

Each item in `items` carries:
- `nextDueOn`, `status`, `chargesFrom`, `lastChangeOn`;
- `yearlyMinor`, `monthlyMinor`;
- `chargeCount`, for the delete dialog;
- `version`, `demo`.

**Shared functions**

| Function | Used by |
| --- | --- |
| `dueDates(subscription, from, to)` in `shared/schedule` | Catch-up, the upcoming list, the backfill preview |
| `upcomingDue(tx, ctx, days)`, one statement | This page (30 days), F10 (7 days) |
| `subscriptionCosts(tx, ctx)`, one statement | F08's widget, F11's report, which labels it "Current monthly cost" |
| `subscriptionSummary(tx, ctx)`: in one statement, the monthly and yearly cost (as `subscriptionCosts`) and the next renewal, the earliest next due date across Subscriptions (BR-F05-19) with its name and amount, or none | F08's widget |

## 12. Cross-feature effects

- **Charges are Transactions.** Creating, updating or deleting them invalidates the same queries as a Transaction write (F03, section 12), for the months in `months`, including Budgets and the dashboard.
- **A confirmed Subscription write** invalidates Subscriptions, upcoming renewals, the whole dashboard prefix (F08, D-295), Insights (F10) and the demo status (F15).
- **F10** reads renewals within 7 days; **F11** reads charges in the period and the current monthly cost; **F13** searches names.
- **F15** seeds Subscriptions, charges and tombstones by these rules.

## 13. Edge cases

- **Due on the 29th to the 31st:** months clamp, and the next month returns to the anchor day (BR-F05-01).
- **A yearly Subscription started on 29 February:** charges on 28 February in other years and on the 29th again in leap years.
- **A time-zone change:** existing charges keep their `occurredAt`; later charges use midnight in the new zone (F02, BR-F02-13).
- **Midnight that does not exist** on a daylight-saving day, in zones that change their clocks at midnight such as America/Santiago: the charge moves to 01:00.
- **A long absence:** the first catch-up after weeks creates every missed charge at once, each with its own date.
- **An edited charge after C:** it is never repriced or deleted by a change, an end date or a delete. After a delete it stays as an unlinked expense.
- **A queued edit of a charge that was repriced meanwhile:** it meets 409 with both versions (F03, BR-F03-24).
- **A charge deleted while its Subscription is being deleted:** F03 re-reads the charge after the lock (BR-F03-17).
- **Two devices change the same Subscription:** the second gets 409 and the conflict view.
- **Backfill for a weekly Subscription started 10 years ago:** about 520 charges, in one statement.
- **A start date in the future:** status `upcoming`, shown as "Starts 5 Dec"; no charge until then; counted in costs, since it has a next due date.
- **An end date before `chargesFrom`:** BR-F05-12 deletes any unedited linked charge after the end date, and catch-up creates nothing more.

## 14. Acceptance criteria

The request clock is frozen per test. Steps that need a later day move it explicitly (TST-3).

- **AC-F05-01** (unit) `dueDates` gives every row of BR-F05-01's table.
- **AC-F05-02** (integration) On golden at the frozen clock:
    - next due, yearly and monthly figures match section 5;
    - the monthly total is 20,273.92;
    - upcoming 30 days totals 20,149.00;
    - within 7 days is Netflix only.
- **AC-F05-03** (integration) The first golden request on 2 November creates row 27 only. Repeating the boot endpoint creates nothing. With `Daybook-Queue: pending` it returns `skipped: true`.
- **AC-F05-04** (integration) A monthly Subscription started 13 months ago and created without backfill gets no past charge. With backfill it gets every past due date, and the count matches the dialog's.
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
- **AC-F05-09** (integration) A tombstoned date is never recreated by the lazy, boot or on-change runs.
- **AC-F05-10** (integration) A charge created from a demo Subscription has `demo` true.
- **AC-F05-11** (integration) Each of these returns 422:
    - `startDate` 11 years back;
    - an `endDate` before `startDate`;
    - a `changedAt` 91 days old.

    Two changes queued at 4 November and synced on 9 November both get C = 4 November.
- **AC-F05-12** (client integration, M5) Offline, a pending Subscription's upcoming entries show "Pending" and are left out of the totals, and no charge appears in Transactions until sync.
- **AC-F05-13** (integration) `/api/transactions?sub=<golden Netflix id>` returns #5 and #16, with Out 1,298.00.
- **AC-F05-14** (integration) A charge deleted from a stale device after a reprice returns 409. Keep mine deletes it and writes the tombstone, and catch-up never recreates it.
- **AC-F05-15** (accessibility) The page and dialogs pass axe with no serious or critical violations and work by keyboard alone.

## 15. Illustrations

Illustrative, a list item:

```json
{
  "id": "0192…",
  "name": "Amazon Prime",
  "amountMinor": 149900,
  "cadence": "yearly",
  "startDate": "2026-10-12",
  "category": "entertainment",
  "endDate": null,
  "chargesFrom": "2026-10-12",
  "lastChangeOn": "2026-10-12",
  "status": "active",
  "nextDueOn": "2027-10-12",
  "yearlyMinor": 149900,
  "monthlyMinor": 12492,
  "chargeCount": 1,
  "version": 1,
  "demo": false
}
```

Illustrative, the page on a phone:

```text
Subscriptions
Monthly ₹20,273.92 · Yearly ₹2,43,287.00 · This month ₹18,000.00

Next 30 days                                    ₹20,149.00
  5 Nov  Netflix                ₹649.00
 10 Nov  Cult Gym             ₹1,500.00
  1 Dec  Sunrise Apartments  ₹18,000.00

Netflix            Entertainment   ₹649.00 a month     Next: 5 Nov   [⋯]
Amazon Prime       Entertainment   ₹1,499.00 a year    ≈ ₹124.92 a month
                                                       Next: 12 Oct 2027
```
