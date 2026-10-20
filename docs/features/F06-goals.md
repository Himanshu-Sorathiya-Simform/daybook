# F06 Goals

16 Oct 2026 · @Himanshu

A Goal is a savings target, such as an emergency fund, a vacation or a car. Money moves into and out of it through Transactions (contributions and withdrawals), so a Goal's progress is always the sum of its own Transactions and is never stored as a separate number. A Goal can have a target date, which gives a required monthly amount. The user marks a Goal completed when it reaches 100%, or archives it.

Free includes 3 active Goals; Premium is unlimited. When Premium lapses, nothing is deleted: the user's chosen 3 Goals (by default the 3 oldest) stay editable, and the rest become read-only until the user upgrades or changes the choice.

| Item       | Value                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Milestone  | M2 (Goals, states, the cap). Stand-ins (D-241): before M3 the Goal page has no chart (F09); before M4 the limit message has no Upgrade button and no lapse can happen (F12); before M5, writes are online only, as in F03      |
| Plan       | Free: 3 active Goals. Premium: unlimited (`goals.active.max`)                                                                                                                                                                  |
| Depends on | [F03](F03-transactions.md) (contributions and withdrawals), [P4](../platform/P4-capabilities.md) (the limit and its lock), [P2](../platform/P2-data-access-and-security.md); F12 (plan changes); F08, F09, F11, F13 read Goals |
| Decisions  | D-21, D-25, D-29, D-97 to D-103, D-198, D-213, D-223, D-237, D-241, D-258 to D-269                                                                                                                                             |

## 1. User stories

- As a user, I want to create a savings Goal with a target and an optional date, and see how far along it is.
- As a user, I want to know how much to save each month to reach a Goal by its date.
- As a user, I want to move money into a Goal and take it out again when I spend it, without the withdrawal counting as spending.
- As a user, I want to mark a Goal completed when I reach it, or archive one I gave up on, and reopen it later.
- As a Free user, I want to know clearly when I have reached the 3-Goal limit and what my options are.
- As a user whose Premium ended, I want to keep all my Goals and choose which 3 stay editable.
- As a user, I want to delete a Goal created by mistake, together with its Transactions if I mean to.

## 2. Scope

| In                                                                                                                                                                                                                                                                                        | Stretch (M8) | Out                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, edit, complete, archive, reopen and delete; progress and percentage; required monthly amount; the over-saving warning; the Free cap and its race-safe check; locks after a lapse and the choice of editable Goals; the Goals list and Goal page; icons and colors; offline writes | None         | Automatic completion (D-98); automatic contributions or round-ups; Goal balances held anywhere; projected completion dates (H6); sharing Goals; interest on savings |

## 3. Concepts and fields

**Goal** (private)

| Field                               | Meaning                               | Required | Rules                                                                             | Example      |
| ----------------------------------- | ------------------------------------- | -------- | --------------------------------------------------------------------------------- | ------------ |
| `id`                                | UUIDv7                                | Yes      | Client-generated (ID-1)                                                           |              |
| `name`                              | The Goal's name                       | Yes      | 1 to 60 characters (root 6.7)                                                     | `Vacation`   |
| `targetMinor`                       | The amount to reach                   | Yes      | MON-5                                                                             | `3000000`    |
| `targetDate`                        | When it should be reached             | No       | When set to a new value, after today (D-264); `null` clears it                    | `2027-03-31` |
| `icon`                              | One of the fixed icons                | Yes      | BR-F06-04                                                                         | `plane`      |
| `color`                             | One of the fixed colors               | Yes      | BR-F06-04                                                                         | `teal`       |
| `state`                             | `active`, `completed` or `archived`   | System   | Changed by BR-F06-07 to BR-F06-10                                                 | `active`     |
| `completedAt`, `archivedAt`         | When it was completed or archived     | System   | From the change's `changedAt` (BR-F06-10); cleared on Reopen                      |              |
| `keepEditable`                      | Picked to stay editable after a lapse | System   | BR-F06-13; changing it never bumps `version`                                      | `false`      |
| `demo`                              | Loaded as demo data                   | System   | F15                                                                               | `false`      |
| `version`, `createdAt`, `updatedAt` | P2                                    | System   | `createdAt` is client-set, at most 5 minutes after `ctx.now`; it defines "oldest" |              |

**Derived values** (never stored)

| Value                | Formula                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Progress             | Σ `goal_contribution` − Σ `goal_withdrawal` linked to the Goal, all time, confirmed only (TXN-5) |
| Progress at date D   | The same sum over Transactions with `occurred_on` ≤ D (for reports)                              |
| Percent              | Progress ÷ target, as tenths of a percent, rounded half away from zero; may exceed 100.0%        |
| Remaining            | Target − progress, floored at 0                                                                  |
| Required monthly     | BR-F06-16                                                                                        |
| Locked               | BR-F06-12                                                                                        |
| All-time unallocated | All-time net savings − all-time To Goals (TXN-5), confirmed only                                 |

## 4. Business rules

**Creating and editing**

- **BR-F06-01** Creating a Goal sends `POST /api/goals` with the client id, name, target, optional date, icon, color and `createdAt`. A new Goal is `active`.
- **BR-F06-02** The Free cap (D-99, P4): before inserting, the handler takes the `goals.active.max` advisory lock (P4, BR-P4-08; SRV-7) and counts the user's active Goals. If the count is at or above the limit, it returns 403 `premium_required` with `{ capability: "goals.active.max", limit, current }`. After a lapse the count can be above the limit (5 against 3). The client shows P4's limit message beside New Goal: "Free includes 3 active Goals. Complete or archive one, or upgrade for unlimited Goals." with Upgrade.
- **BR-F06-03** Editing changes name, target, target date, icon and color. It is allowed only on active, unlocked Goals (BR-F06-12). Lowering the target below progress is allowed; the Goal is then over 100% and offers Mark as completed.
- **BR-F06-04** Icons and colors come from fixed lists (D-103, D-262), so every Goal is recognisable at a glance and F15's demo Goals always resolve.
    - **Icons** (lucide names): `piggy-bank` (the default), `shield`, `plane`, `home`, `car`, `bike`, `graduation-cap`, `laptop`, `smartphone`, `camera`, `gift`, `heart`, `baby`.
    - **Colors** (design tokens): `blue`, `teal`, `green`, `lime`, `amber`, `orange`, `pink`, `purple`.

    Category colors are separate tokens, so a Goal never takes a category's chart color (CAT-4).

- **BR-F06-05** A target date sent with a value different from the stored one must be after today; `null` removes it. A date that later passes is kept, and the Goal shows "Target date passed" (BR-F06-16).
- **BR-F06-06** Contributions and withdrawals are Transactions (D-21), added and edited through F03's dialog with the Goal preselected. F03 enforces the Goal rules:
    - the Goal must be active and not locked (`goal_read_only`, F03, BR-F03-13);
    - progress can never go below zero (F03, BR-F03-14; D-223);
    - a demo Transaction cannot move to a non-demo Goal (D-237).

**States (D-98)**

- **BR-F06-07** Mark as completed is offered, and allowed, only when the Goal is active, unlocked, and its confirmed progress is at least its target. Completion is never automatic (D-98). The server checks the three conditions in this order:
    1. **Not active:** 422 `validation_failed` on `state` (BR-F06-10).
    2. **Locked:** 422 `goal_read_only` (F03, BR-F03-13).
    3. **Below target:** 422 `goal_not_reached`.
- **BR-F06-08** Archive is allowed on any active Goal, locked or not. It frees a slot.
- **BR-F06-09** Reopen turns a completed or archived Goal back into an active one. It needs a free slot (D-99), and it clears `completedAt` and `archivedAt`. Locks follow SRV-7: the profile, then the same advisory lock and at-or-above count as BR-F06-02, then the versioned update of the Goal.
- **BR-F06-10** State changes (D-268) are `PATCH` requests with `state` and `changedAt` only, under the Goal's row lock and `If-Match`.
    - **The timestamp:** `completedAt` or `archivedAt` is `changedAt`, clamped between the Goal's `createdAt` and `ctx.now`. `changedAt` must lie from 90 days before to 5 minutes after `ctx.now` (D-267). An edit synced first therefore never moves a queued archive to the sync time.
    - **Allowed transitions:**

        | From                   | To        | Rule      |
        | ---------------------- | --------- | --------- |
        | active (unlocked)      | completed | BR-F06-07 |
        | active (locked or not) | archived  | BR-F06-08 |
        | completed or archived  | active    | BR-F06-09 |

    - **Any other request:** a transition not in the table, including one to the current state, returns 422 `validation_failed` on `state`, for example "Vacation is already archived."
- **BR-F06-11** Completed and archived Goals are read-only: no contributions, withdrawals or edits. They offer only Reopen and Delete.

**Locks after a lapse (D-29, D-258)**

- **BR-F06-12** Locks are computed, never stored, so nothing has to run when Premium ends or returns.
    - **Inputs:** L is the resolved `goals.active.max` (3 on Free, `null` on Premium); A is the user's active Goals.
    - **No locks:** when L is `null`, or A has at most L Goals.
    - **Otherwise, the editable Goals:** the Goals in A with `keepEditable`, topped up with the oldest remaining Goals in A (by `createdAt`, then `id`) until there are L of them. Any extra picked Goals beyond L are taken oldest first.
    - **Locked:** every other Goal in A.

    Every endpoint that writes a Goal or its Transactions computes this inside its transaction (P4, BR-P4-03).

- **BR-F06-13** The user chooses the editable Goals with `PUT /api/goals/editable { goalIds }`.
    - **Accepted only:** when locks exist, with exactly L distinct ids, all of them active Goals of the user. Otherwise 422.
    - **Locks, in SRV-7 order:**
        1. Update the profile's `goalsChosenAt` to `ctx.now` first. That takes the profile lock in its write mode, and it is never upgraded later.
        2. Take the advisory lock of BR-F06-02.
        3. Lock every Goal of the user, whatever its state, with `SELECT ... FOR UPDATE ORDER BY id`.
    - **The write:** it validates the ids, sets `keepEditable` on the chosen Goals and clears it on every other Goal. Neither change bumps `version` or `updatedAt`, so queued Goal edits never conflict with a choice.
- **BR-F06-14** A locked Goal shows a lock badge. Its Transactions open read-only with "Vacation is locked. Upgrade, or choose it as one of your 3 editable Goals." It allows only Archive and Delete.
- **BR-F06-15** The lapse banner (root 5.5) reads "Premium ended, so 2 Goals are locked. Choose which 3 stay editable." with Choose and Upgrade. It shows while two things hold:
    - some Goal is locked;
    - the profile's `goalsChosenAt` is empty, or earlier than `lapseSeenAt` in F12's plan record: the request-clock time when Daybook saw the latest Premium end.

    A second lapse therefore asks again. After a choice, a notice stays on `/goals` only: "2 Goals are locked." with Change and Upgrade.
    - **Computed on the server:** `/api/me` (persisted) and the Goals summary both carry `goals: { lockedCount, needsChoice }`, so the banner works offline from the last answer. F12's plan record supplies `lapseSeenAt` (BR-F12-11). It uses Daybook's clock, not Stripe's, so a Stripe test clock cannot put it in Daybook's future.

**Calculations shown**

- **BR-F06-16** The required monthly amount (D-101, D-261) takes the first matching case:
    1. **Progress at or above target:** `reached`, shown as "Target reached".
    2. **No target date:** `none`.
    3. **The target date is before today:** `passed`, shown as "Target date passed", with no amount.
    4. **Otherwise,** let m be the number of calendar months after the current month, up to and including the target month:
        - **m = 0** (the target is later this month): `dueThisMonth`, the whole remaining amount.
        - **m ≥ 1:** `monthly`, remaining ÷ m, rounded up to the minor unit (MON-7).
- **BR-F06-17** The over-saving warning (D-102) appears in F03's dialog when a new contribution is larger than all-time unallocated savings. It never blocks.
- **BR-F06-18** Percent above 100.0% is shown as it is ("112.0%"). The progress bar stops at full and adds "Over target by 3,600.00".

**Deleting (D-100, D-263)**

- **BR-F06-19** A Goal with no Transactions is deleted directly, after "Delete Vacation?".
- **BR-F06-20** A Goal with Transactions shows "Vacation has 3 Transactions. Archive it to keep them, or delete it with its Transactions." The choices are Archive, Delete with Transactions, and Cancel.
    - **The request:** `DELETE` with `{ withTransactions: true }` deletes the Goal's Transactions, then the Goal, in one transaction, under the profile lock and the Goal lock (SRV-7).
    - **Without the flag:** a Goal with Transactions returns 409 `has_dependents` with `details.count`.
- **BR-F06-21** Every Goal write takes the profile lock first (D-213). Requests that send a target carry `currency`. Goals are offline-writable (D-46).

**Pages**

- **BR-F06-22** `/goals` shows, top to bottom:
    1. **Header:** "Saved in Goals: 15,000.00" (Σ progress of every Goal), "Unallocated savings: 89,363.00" (all time), and the active count against the limit ("2 of 3 active" on Free).
    2. **New Goal**, disabled at the cap with BR-F06-02's message.
    3. **Active Goals**, oldest first, each card showing icon, name, progress of target, percent, bar, target date, required monthly, and any lock badge.
    4. **Completed**, newest first, collapsed.
    5. **Archived**, newest first, collapsed.
- **BR-F06-23** `/goals/[id]` shows:
    - the header: icon, name, state, and the lock badge when locked;
    - progress, percent, the bar, target date and required monthly;
    - Add money (F03 dialog, To Goal) and Withdraw (From Goal), each shown only when the Goal accepts them;
    - the Goal's Transactions: F03's list with `goal=<id>`;
    - a cumulative progress chart (F09's Goal progress chart, loaded lazily);
    - the allowed actions: Edit, Mark as completed, Archive, Reopen, Delete.

    An id that is not the user's shows "We couldn't find that Goal."

## 5. Calculations

Golden, as of 2 November ([03-golden-dataset.md](../03-golden-dataset.md#goals-as-of-2-november)):

| Goal           | Contributions | Withdrawals | Progress  | Percent | Required monthly      |
| -------------- | ------------- | ----------- | --------- | ------- | --------------------- |
| Emergency fund | 10,000.00     | 0.00        | 10,000.00 | 10.0%   | none (no target date) |
| Vacation       | 6,000.00      | 1,000.00    | 5,000.00  | 16.7%   | 6,250.00              |

- **Vacation:** 25,000.00 remaining; the months after November up to March 2027 are December, January, February and March, so m = 4, and 25,000.00 ÷ 4 = 6,250.00 exactly.
- **Rounding up:** 10,000.00 remaining over 3 months is 3,333.333…, which rounds up to 3,333.34.
- **Header:** "Saved in Goals" is 15,000.00 (10,000.00 + 5,000.00). "Unallocated savings" is 89,363.00, all-time net savings of 104,363.00 minus 15,000.00 To Goals.
- **Over-saving warning:** a contribution of 89,363.01 or more warns; exactly 89,363.00 does not.
- **Progress at 31 October:** Emergency fund 10,000.00 and Vacation 5,000.00, for F11's October report.

**Locks: the `lapsed` scenario account (F15).** Five active Goals were created in months 1, 2, 3, 10 and 14, and Premium has ended, so L = 3.

- **No choice made:** the three oldest (months 1, 2 and 3) are editable; the Goals from months 10 and 14 are locked.
- **The user picks months 1, 10 and 14:** the Goals from months 2 and 3 lock instead.
- **The user archives the month-1 Goal:** four active Goals remain, two of them picked. They are topped up with the oldest unpicked Goal (month 2), so only month 3 is locked.
- **On re-upgrade:** L is `null` and nothing is locked; `keepEditable` stays for any later lapse.

## 6. Screens and states

**`/goals`** (BR-F06-22) and **`/goals/[id]`** (BR-F06-23).

**The choose dialog.** It lists every active Goal with checkboxes, the oldest pre-checked when no choice exists. It allows exactly L choices: "Choose 3 Goals to keep editable. The others stay visible but can't change until you upgrade." Save is enabled at exactly L.

| State            | `/goals`                                                                                                 | `/goals/[id]`                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Loading          | Skeleton header and cards                                                                                | Skeleton header, chart and list                                                 |
| Empty            | "No Goals yet. Save toward a trip, a car or an emergency fund." with New Goal                            | n/a                                                                             |
| Error            | "Goals could not be loaded." with Retry                                                                  | "This Goal could not be loaded." with Retry; 404: "We couldn't find that Goal." |
| Offline          | Cached Goals with "as of"; writes queue; New Goal uses the cached limit                                  | The cached Goal and its cached Transactions                                     |
| Pending          | "Pending sync" on cards; progress shows "+3,000.00 pending" and never offers completion on pending money | The same                                                                        |
| Locked (Premium) | Lock badges; the banner or notice (BR-F06-15); New Goal at the cap shows the limit message               | Read-only, with the lock message and Archive, Delete, Upgrade                   |
| Read-only        | Completed and archived Goals: Reopen and Delete only                                                     | The same                                                                        |

## 7. Flows

**7.1 Create a Goal and fund it**

1. New Goal: "Vacation", 30,000, by 31 Mar 2027, plane, teal. `POST /api/goals`.
2. **403 `premium_required`** at the cap: the limit message appears beside New Goal, with Upgrade.
3. **Success:** the Goal appears. The user selects Add money, and F03's dialog opens with To Goal and Vacation.
4. Offline (from M5), the Goal and its first contribution queue in order. The contribution references the Goal's client id (ID-1).

**7.2 Complete**

1. Progress reaches 30,000.00, and Mark as completed appears.
2. `PATCH { state: "completed", changedAt }`. **422 `goal_not_reached`** (a withdrawal synced meanwhile): "Vacation is below its target again." The Goal stays active.
3. **Success:** the Goal moves to Completed and becomes read-only.

**7.3 Reopen at the cap**

1. A Free user with 3 active Goals reopens an archived Goal.
2. The server returns 403 `premium_required`, and the message offers to archive one or upgrade.

**7.4 Premium lapses (from M4)**

1. Stripe ends Premium (F12). `goals.active.max` resolves to 3, and the user has 5 active Goals.
2. On the next `/api/me`, the client shows the banner (BR-F06-15). The two newest Goals show lock badges.
3. Choose opens the dialog. The user picks 3, and `PUT /api/goals/editable` saves the choice.
4. A queued contribution to a now-locked Goal replays as 422 `goal_read_only` and shows in the sync panel (P4, section 10).

**7.5 Delete with Transactions**

1. Delete on Vacation shows its 3 Transactions and the three choices.
2. Delete with Transactions: `DELETE { withTransactions: true }`.
3. #9, #22 and #23 are deleted with the Goal. October's To Goals drops to 5,000.00, and September's to 5,000.00.

## 8. Validation and messages

| Field or action    | Rule                       | Message shown                                                                             |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------- |
| Name               | Required, 1 to 60          | Name your Goal, like Vacation. / Use 60 characters or fewer.                              |
| Target             | F03's amount rules         | F03's amount messages                                                                     |
| Target date        | After today                | Choose a date after today.                                                                |
| Icon, color        | From the lists             | Choose an icon. / Choose a color.                                                         |
| New Goal or Reopen | `premium_required` (limit) | Free includes 3 active Goals. Complete or archive one, or upgrade for unlimited Goals.    |
| Complete           | `goal_not_reached`         | Vacation is below its target again.                                                       |
| Edit               | Completed or archived      | Reopen Vacation to change it.                                                             |
| Any write          | Locked                     | Vacation is locked. Upgrade, or choose it as one of your 3 editable Goals.                |
| Choose             | Not exactly L              | Choose exactly 3 Goals.                                                                   |
| State change       | `changedAt` out of bounds  | This change is too old to apply. Discard it and make it again.                            |
| Choose             | No locks exist             | Every Goal is editable, so there's nothing to choose.                                     |
| Delete             | Has Transactions           | Vacation has 3 Transactions. Archive it to keep them, or delete it with its Transactions. |
| Any write          | `version_conflict`         | This Goal was changed on another device. (Conflict view)                                  |
| Any write          | `not_found`                | This Goal was deleted on another device.                                                  |
| Required monthly   | Target date passed         | Target date passed                                                                        |

## 9. Plan gating

| Code               | Checked by                                                                                                                                                                                                                                            | Refusal   | Client shows                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------- |
| `goals.active.max` | Create (BR-F06-02) and Reopen (BR-F06-09): 403 `premium_required` with `{ limit, current }`. The editable choice (BR-F06-13): 422 unless exactly L. The lock computation (BR-F06-12) on every Goal and Goal-Transaction write: `goal_read_only` (F03) | As listed | The limit message with Upgrade (from M4); lock badges and the banner after a lapse |

Locking never deletes or hides data (D-29). A Premium user has no limit, so nothing is ever locked.

## 10. Offline behavior

- **Readable:** the Goals list and viewed Goals, persisted (root 7.3), with "as of".
- **Writable:** creates, edits, state changes, the editable choice and deletes queue (D-46). Contributions and withdrawals queue through F03.
- **Cap offline:** the client counts confirmed active Goals plus queued Goal creates against the persisted limit to disable New Goal. The server decides at replay; a refused create shows as rejected with the limit message.
- **Dependent items (D-266):** queued Transactions for a Goal whose queued create was rejected wait behind it. Retry replays them after it; Discard discards them too, and says how many. Deleting a Goal whose create is still queued and was never sent removes every queued item for it, its queued Transactions included, at once: Goal deletes have no hold. Once the create was sent, the delete replays after them (P1, BR-P1-15).
- **Pending money:** shows as an annotation and never enables Mark as completed (TXN-6).
- **Replay order:** Goal items replay one by one, each with the version the previous one returned (D-269). They are never merged, except that a create and a later delete of the same queued Goal cancel out (D-265).
- **Replay outcomes:** 409 `version_conflict` opens the conflict view. `goal_not_reached`, `premium_required` and `goal_read_only` mark the item rejected with the messages above. A 404 on a delete counts as done (D-239).

## 11. Server surface

| Endpoint              | Method | Input                                                                                                                              | Output                                                                                                                | Errors                                                                                                                           | Idempotency and versioning                |
| --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `/api/goals`          | GET    | none                                                                                                                               | `{ items, summary: { activeCount, limit, savedMinor, unallocatedAllTimeMinor, lockedCount, needsChoice }, currency }` | 401, 403 `profile_required`                                                                                                      | Read                                      |
| `/api/goals/[id]`     | GET    | none                                                                                                                               | The Goal with derived values                                                                                          | 401, 403, 404                                                                                                                    | Read                                      |
| `/api/goals`          | POST   | `{ id, name, targetMinor, currency, targetDate, icon, color, createdAt }`                                                          | 201 with the Goal; 200 for a repeated id                                                                              | 401, 403 `premium_required`, 409 `id_conflict`, 422 `validation_failed`, `currency_mismatch`                                     | `Idempotency-Key` required                |
| `/api/goals/[id]`     | PATCH  | Either `{ state, changedAt }`, or any of `name`, `targetMinor` (with `currency`), `targetDate` (a date or `null`), `icon`, `color` | 200 with the Goal                                                                                                     | 401, 403 `premium_required` (reopen), 404, 409 `version_conflict`, 422 `goal_not_reached`, `goal_read_only`, `validation_failed` | `Idempotency-Key` and `If-Match` required |
| `/api/goals/[id]`     | DELETE | `{ withTransactions }`                                                                                                             | 200 `{ deletedTransactions }`                                                                                         | 401, 403, 404, 409 `has_dependents` with `details.count`, 409 `version_conflict`                                                 | `Idempotency-Key` and `If-Match` required |
| `/api/goals/editable` | PUT    | `{ goalIds }`                                                                                                                      | 200 with the Goals                                                                                                    | 401, 403, 422 `validation_failed`                                                                                                | `Idempotency-Key` required                |

Each item carries:

- `progressMinor`, `percentTenths`, `remainingMinor`;
- `requiredMonthlyMinor` and `requiredStatus` (`none`, `monthly`, `dueThisMonth`, `passed`, `reached`);
- `locked`, `keepEditable`, `transactionCount`.

**Error codes added by this spec**

| Status | Code               | Default message                      | Write queue does |
| ------ | ------------------ | ------------------------------------ | ---------------- |
| 422    | `goal_not_reached` | This Goal hasn't reached its target. | Reject           |

`goal_read_only` is defined by F03.

**Shared functions:**

- `goalProgress(tx, ctx, { asOf })`: every Goal with its progress in one statement, and each Goal's lock from the same rows by BR-F06-12's rule; used by F08 and F11;
- `goalProgressSeries(tx, ctx, { goalIds, from, to })`: each Goal's cumulative progress at the close of every day from `from` to `to`, used by F09;
- `goalLocks(tx, ctx)`, used by every Goal and Goal-Transaction write.

## 12. Cross-feature effects

- **A confirmed Goal write** invalidates the Goals list and summary, the Goal's page, the whole dashboard prefix (F08, D-295), Analytics (F09), Insights (F10) and the demo status (F15).
- **Contributions and withdrawals** (F03) invalidate the same queries, plus the savings widget's To Goals split (D-25).
- **F12:** a plan change changes `goals.active.max`, so the client refetches Goals after a `/api/me` change. F12's plan record holds `lapseSeenAt`, when Daybook saw the latest Premium end, for the lapse banner (BR-F06-15).
- **F13** searches Goal names; **F11** reports progress at the period's end.
- **F01 reset and F15 removal** delete Goals and their Transactions.

## 13. Edge cases

- **A withdrawal syncs after completion was offered:** completion re-checks on the server (BR-F06-07).
- **Two tabs create a fourth Goal at once:** the advisory lock lets one through (P4, AC-P4-06).
- **A Free user at the cap archives a Goal on another device:** the next create succeeds, since the server counts committed active Goals.
- **A picked Goal is archived or completed:** BR-F06-12 tops up from the oldest, so exactly L stay editable.
- **Re-upgrade:** every Goal unlocks at once; nothing is migrated.
- **The target lowered below progress:** shows over 100% and offers completion.
- **A target date passes:** the Goal shows "Target date passed" and stays active.
- **Deleting a Goal whose Transactions include demo rows:** they are deleted with it.
- **A demo Goal deleted by the user:** removed normally; Remove demo data then has nothing to delete for it.
- **Progress at a date** counts only Transactions with `occurred_on` up to that date, so reports never see later money.

## 14. Acceptance criteria

- **AC-F06-01** (integration) On golden, progress, percent and required monthly match section 5, as do `savedMinor` 15,000.00 and `unallocatedAllTimeMinor` 89,363.00.
- **AC-F06-02** (unit) Required monthly:
    - 25,000.00 over 4 months gives 6,250.00;
    - 10,000.00 over 3 months gives 3,333.34;
    - a target later in the current month gives the whole remaining amount, `dueThisMonth`;
    - a target earlier in the current month, or in an earlier month, gives `passed`;
    - progress at or above target gives `reached`.
- **AC-F06-03** (integration) A Free user with 3 active Goals gets 403 with `{ limit: 3, current: 3 }` on create and on reopen. After archiving one, create succeeds. On the `lapsed` account (M4), create returns 403 with `current: 5`. After one Goal is archived, reopening it returns 403 with `current: 4`.
- **AC-F06-04** (integration) Complete returns 422 `goal_not_reached` below target and succeeds at or above it. A completed Goal refuses edits and Transactions with `goal_read_only`.
- **AC-F06-05** (integration, M4) The `lapsed` account:
    - with no choice, the three oldest are editable and the two newest locked;
    - a contribution to a locked Goal returns `goal_read_only`;
    - Archive on a locked Goal succeeds;
    - `PUT /api/goals/editable` with 2 ids, or 3 with a repeated id, returns 422; with 3 valid ids it moves the locks and leaves every Goal's `version` unchanged;
    - after a choice, re-upgrading and lapsing again shows the banner again.
- **AC-F06-06** (unit) `goalLocks` gives every result in section 5's lock walkthrough.
- **AC-F06-07** (integration) Delete without `withTransactions` on golden Vacation returns 409 `has_dependents` with count 3. With it, the Goal and #9, #22 and #23 are gone, and October To Goals is 5,000.00.
- **AC-F06-08** (integration) A target date of today or earlier returns 422. A stored date that has passed shows `passed`.
- **AC-F06-09** (client integration) The over-saving warning appears for 89,363.01 and not for 89,363.00.
- **AC-F06-10** (client integration, M5) A pending contribution that would reach the target shows "+… pending" and no Mark as completed.
- **AC-F06-11** (E2E) Fund a Goal and hit the Free cap (root TST-4): a fourth New Goal shows the limit message, with Upgrade from M4.
- **AC-F06-12** (accessibility) `/goals`, `/goals/[id]` and the choose dialog pass axe with no serious or critical violations and work by keyboard alone. Locked and read-only states are announced in text.
- **AC-F06-13** (integration) Archiving an archived Goal, or completing an archived one, returns 422 `validation_failed` on `state`. Completing a locked Goal returns `goal_read_only` (M4). Reopen clears `completedAt` and `archivedAt`. A queued archive synced after an edit keeps its own `changedAt` as `archivedAt`.

## 15. Illustrations

Illustrative, a Goal in `GET /api/goals`:

```json
{
	"id": "0192…",
	"name": "Vacation",
	"targetMinor": 3000000,
	"targetDate": "2027-03-31",
	"icon": "plane",
	"color": "teal",
	"state": "active",
	"progressMinor": 500000,
	"percentTenths": 167,
	"remainingMinor": 2500000,
	"requiredMonthlyMinor": 625000,
	"requiredStatus": "monthly",
	"locked": false,
	"keepEditable": false,
	"transactionCount": 3,
	"version": 1,
	"demo": false
}
```

Illustrative, a Goal card:

```text
[plane] Vacation                                 16.7%
5,000.00 of 30,000.00     [████░░░░░░░░░░░░░░░░░]
By 31 Mar 2027 · Save 6,250.00 a month   [Add money] [⋯]
```
