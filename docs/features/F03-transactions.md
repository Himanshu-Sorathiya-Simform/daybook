# F03 Transactions

16 Oct 2026 · @Himanshu

Transactions are the ledger every other number comes from: income, expenses, refunds, and money moved into or out of Goals.

- **Entry:** a Transaction is added from anywhere in a few seconds, in a dialog or bottom sheet.
- **Changes:** it can be edited, duplicated, or deleted with Undo.
- **The list:** found again in an infinite list whose filters live in the URL. A header shows Count, In, Out and To Goals for exactly the rows the filter selects.
- **Pending changes:** changes not yet confirmed show as pending and never enter confirmed totals.

| Item | Value |
| --- | --- |
| Milestone | M1, with parts in M2 and M5 (section 2) |
| Plan | Free and Premium. Bulk delete is Stretch (`transactions.bulkDelete`) |
| Depends on | [F02](F02-onboarding-profile-settings.md) (profile, locale, today), [P2](../platform/P2-data-access-and-security.md), [P4](../platform/P4-capabilities.md); F05 (charges, tombstones), F06 (Goal states), P1 (write queue, sync panel), F15 (demo rows) |
| Decisions | D-20 to D-24, D-32, D-35 to D-40, D-77, D-78, D-80 to D-89, D-102, D-171, D-176, D-185, D-213, D-218 to D-231, D-236 to D-239, D-241, D-255, D-270 |

## 1. User stories

- As a user on my phone, I want to add an expense in a few seconds, so that I record it before I forget.
- As a user, I want to record income, refunds, and money moved into and out of Goals in the same place.
- As a user, I want to fix a Transaction, or duplicate one I repeat, without retyping it.
- As a user, I want to delete a Transaction and undo it if I tapped by mistake.
- As a user, I want to filter by date, type, category, Goal, amount, source and text, and share or bookmark the result as a link.
- As a user, I want the list header to tell me how much came in, went out and went to Goals for exactly what I filtered.
- As a user, I want to find a Transaction by typing part of the payee, the description, the note or the exact amount.
- As a user who is offline, I want to keep adding and editing, and see clearly what has not synced yet.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| The entry dialog (create, edit, duplicate); the infinite, virtualized list; filters in the URL; sort; header totals; payee suggestions; delete with Undo; deep links; pending, rejected and conflict display; how Subscription charges and demo rows behave in the list; the server rules for Goal Transactions; keyboard shortcuts | Bulk delete with one Undo (D-85, `transactions.bulkDelete`) | Import (D-86); attachments and receipts; split Transactions (D-22); tags (D-23); accounts and transfers (D-24); multi-currency; recurring income (D-72); linking a refund to its original expense; changing a charge's date; per-day totals in the list; export (F01, Stretch) |

**Milestones (D-241).** Each acceptance criterion names its milestone when it is not M1.

- **M1** builds income, expense and refund, the list, filters, totals, payee suggestions, edit, duplicate, delete with Undo and deep links. Writes are online only:
    - **Offline:** Save is disabled, with "You are offline. Connect to save."
    - **A failed save:** keeps the dialog open with the error.
    - **No pending rows** appear yet.
- **M2** adds Goal Transactions with F06 (BR-F03-13 to BR-F03-15, BR-F03-50, BR-F03-51) and charges with F05 (BR-F03-16, BR-F03-17). Until then, the Type control hides To Goal and From Goal.
- **M5** adds P1's write queue: pending, rejected and conflicting rows, offline writes, and the queued delete (BR-F03-26).

## 3. Concepts and fields

**Transaction**

| Field | Meaning | Required | Rules | Example |
| --- | --- | --- | --- | --- |
| `id` | UUIDv7 | Yes | Client-generated for creates (ID-1) | `0192f0c4-…` |
| `type` | TXN-1 | Yes | Changes per BR-F03-02 | `expense` |
| `amountMinor` | Positive integer, minor units | Yes | MON-1, MON-5; BR-F03-03 | `185000` |
| `occurredAt` | UTC instant | Yes | Minute precision; BR-F03-06 to BR-F03-11 | `2026-09-03T07:50:00Z` |
| `occurredOn` | Local date fixed at entry | Yes | TIME-2; BR-F03-10 | `2026-09-03` |
| `category` | Category key | Income, expense, refund | TXN-3 | `food` |
| `goalId` | Goal | Goal types | TXN-3; BR-F03-13 | |
| `payee` | Counterparty | Income, expense, refund | TXN-4; 1 to 80 | `Swiggy` |
| `description` | Short text under the payee | No | Up to 120 | `Monthly groceries` |
| `note` | Longer text | No | Up to 500; line breaks allowed | |
| `source` | `manual` or `subscription` | System | TXN-8; never sent by the client | `manual` |
| `demo` | Loaded as demo data | System | TXN-8; F15 | `false` |
| `subscriptionId`, `dueOn` | The charge's Subscription and due date | System | Charges only (F05) | |
| `edited` | Changed by the user since it was created | System | Charges only: set true by the user's first edit and never reset. F05 never reprices or deletes an edited charge | `false` |
| `version` | P2 | System | API-4 | `1` |
| `createdAt` | When it was first recorded | Yes, on create | Client-set, at most 5 minutes after `ctx.now` (TIME-7). The recording date is this instant in the profile zone | |
| `updatedAt` | P2 | System | | |

Requests also carry `currency` (BR-F03-05). Responses add `goal: { id, name, icon, color }` to Goal Transactions and `subscription: { id, name }` to linked charges, so the list needs no extra lookups.

**Rules by type**

| Type | Category from | Goal | Payee | Header column | Amount shown |
| --- | --- | --- | --- | --- | --- |
| `income` | Income categories (CAT-3) | No | Required | In | +85,000.00 |
| `expense` | Expense categories (CAT-2) | No | Required | Out, added | −1,850.00 |
| `refund` | Expense categories | No | Required | Out, subtracted | +1,500.00 |
| `goal_contribution` | None | Required | None | To Goals, added | −5,000.00 |
| `goal_withdrawal` | None | Required | None | To Goals, subtracted | +1,000.00 |

A plus sign means money becomes free to spend: income, a refund, money back from a Goal. A minus sign means it stops being free (D-231). Positive amounts also use the positive color token, but the sign always carries the meaning, never the color alone.

**Filter object.** Root section 6.9, plus two interface parameters that are not filters and never enter query keys (D-229):

| Parameter | Effect |
| --- | --- |
| `txn=<id>` | Opens that Transaction in the dialog over the list |
| `new=1` | Opens an empty entry dialog |

**Date presets (D-227).** Each preset writes explicit dates into the URL. Examples are for today, 2026-11-02.

| Preset | `from` to `to` | Example |
| --- | --- | --- |
| All time (default) | No dates | |
| This month | First to last day of the current month | 2026-11-01 to 2026-11-30 |
| Last month | The previous calendar month | 2026-10-01 to 2026-10-31 |
| Last 3 months | The current month and the two before | 2026-09-01 to 2026-11-30 |
| Year to date | 1 January to today | 2026-01-01 to 2026-11-02 |
| Last 12 months | The current month and the 11 before | 2025-12-01 to 2026-11-30 |
| Custom | Any inclusive range | |

**Cursor.** Opaque base64url JSON holding the sort, the direction of travel, and the boundary row's sort key and id. A cursor used with a different sort, or one that fails to decode, gets 400 `bad_request`.

## 4. Business rules

**Types and fields**

- **BR-F03-01** The type decides which fields are required and which are forbidden (table above; TXN-1 to TXN-4). A forbidden field, such as a payee on a Goal Transaction, is refused with 422 `validation_failed`, never silently dropped.
- **BR-F03-02** An edit may change the type only within a group (D-222): `income`, `expense` and `refund`; or `goal_contribution` and `goal_withdrawal`.
    - **Between income and expense or refund:** a category from the other list is needed, so the dialog clears the category.
    - **Between expense and refund:** the category is kept.
    - **Across the two groups:** never allowed; the user deletes the row and adds a new one.

**Amounts**

- **BR-F03-03** `amountMinor` is an integer from 1 to the MON-5 maximum for the profile currency:

    | Currency | Maximum `amountMinor` | Shown as |
    | --- | --- | --- |
    | INR, USD, EUR, GBP | 99,999,999,999 | 999,999,999.99 |
    | JPY | 999,999,999 | 999,999,999 |
    | KWD | 999,999,999,999 | 999,999,999.999 |

- **BR-F03-04** The amount field takes major units in the user's own format (F02, BR-F02-18; D-214, D-230):
    - **The signs:** the decimal sign is the `decimal` part of `Intl.NumberFormat(numberLocale, { style: 'currency', currency }).formatToParts(…)`. The grouping signs are the `group` parts of that formatter and of the plain-number formatter; Austria has two. A space group accepts U+0020, U+00A0 and U+202F alike, and `'` and `’` count as the same sign.
    - **Accepted characters:** digits, the decimal sign once, and the grouping signs.
    - **Grouping:** a grouping sign is accepted only inside a valid grouping of the whole-number part: thousands (`12.345,50` in `de-DE`) or Indian (`1,23,456.50` in `hi-IN`).
    - **The other mark:** `.` or `,`, whichever is not the decimal sign, is refused outside a valid grouping, with a message naming the right sign. A German user's `12.50` is therefore never read as 1,250.
    - **Decimals:** at most the currency's exponent (none for JPY, three for KWD).
    - **Conversion:** to `amountMinor` by string arithmetic, never through a float.
    - **On blur:** the field is re-formatted with grouping.
    - **Phone keyboard:** `inputmode="decimal"`, or `numeric` for JPY.
- **BR-F03-05** Every Transaction write (create, edit or delete) first reads the profile with `SELECT currency ... FOR KEY SHARE` in its write transaction (D-213).
    - **The currency check:** every create, and every edit that sends `amountMinor`, carries `currency`. It must equal the profile currency; a mismatch gets 422 `currency_mismatch`.
    - **Why the lock:** it serializes with a currency change (F02, BR-F02-15) and with demo load and removal (F15, BR-F15-04, BR-F15-11), and it does not block the catch-up update of `last_catch_up_on`.

**Dates and times**

- **BR-F03-06** The form has a date and a time (hours and minutes) in the profile time zone.
    - **`occurredAt`:** that local date and time converted to UTC with `@date-fns/tz`, seconds set to zero.
    - **`occurredOn`:** the chosen date.
    - **Daylight saving (D-221):** a local time that does not exist (in a spring-forward gap) moves forward by the gap, so 02:30 becomes 03:30. A local time that occurs twice takes the earlier instant.
- **BR-F03-07** A new Transaction defaults to type expense, today's date, the current time rounded down to the minute, and no category (D-89).
- **BR-F03-08** The entry window (TIME-7) for a user-entered date runs from the recording date minus 10 days to the recording date, inclusive: 11 dates.
    - **In the browser:** the recording date of a new Transaction is today, from the device clock in the profile zone, and the date picker offers only those 11 dates.
    - **On the server:** the recording date is `createdAt` in the profile zone. A date outside the window gets 422 `date_out_of_window`.
- **BR-F03-09** `occurredAt` is never in the future (D-221).
    - **On create:** `occurredAt` is at most `createdAt` plus 5 minutes.
    - **On edit:** `occurredAt` is at most `ctx.now` (the request clock, P2, BR-P2-43) plus 5 minutes.
    - **In the form:** on today's date, the time picker stops at the current time.
    - **Refusal:** 422 `validation_failed` on `occurredAt`.
- **BR-F03-10** The server checks that `occurredOn` fits `occurredAt` (TIME-2, D-220). It must lie between the UTC date of `occurredAt` minus 12 hours and the UTC date of `occurredAt` plus 14 hours, the full range of real UTC offsets. Otherwise 422 `validation_failed` on `occurredOn`. The check does not use the current profile zone, so a time-zone change between an offline write and its sync cannot reject a correct row.
- **BR-F03-11** Date and time are editable only on rows whose source is `manual` and whose `demo` is false (D-221). On those rows:
    - **Changing the date:** re-checks the window against the original recording date (`createdAt` in the current profile zone).
    - **Changing only the time:** re-checks BR-F03-09 only.
    - **Keeping `occurredOn`:** no window check.
    - **What the fields show (D-238):** the date field shows the stored `occurredOn`, and the time field shows `occurredAt` in the profile zone. After a time-zone change the two can disagree; for example, row 26 reads 1 November with 12:00 pm in `America/Los_Angeles`. A new time is combined with the date shown. When only the time changes, the stored `occurredOn` is kept.

    Charges show "Auto" instead of a time (TIME-6).

**Text**

- **BR-F03-12** Payee, description and note follow root 6.7 (D-230):
    - trimmed and normalized to NFC;
    - control characters (U+0000 to U+001F and U+007F to U+009F) are refused, except that the note keeps line feeds, with CRLF normalized to LF;
    - lengths count Unicode code points (`[...text].length` in the browser, `char_length` in Postgres);
    - an empty description or note is stored as null;
    - the payee keeps the case typed.

**Goal Transactions**

- **BR-F03-13** `goalId` must be one of the user's Goals. The composite foreign key (P2, BR-P2-06) turns any other id into 422 `parent_missing`.
    - **Editable Goals only:** the Goal must be active and not locked (D-98, D-29). Otherwise a create, edit or delete is refused with 422 `goal_read_only`, and `details` names the Goal's state.
    - **Moving between Goals:** an edit that moves a Transaction from one Goal to another needs both Goals editable.
    - **Demo Transactions stay with demo Goals (D-237):** a demo Transaction cannot move to a non-demo Goal (422 `validation_failed` on `goalId`, "Demo Transactions can only move between demo Goals."). Removing demo data therefore never changes the user's own Goals (F15).
- **BR-F03-14** A Goal's confirmed progress never goes below zero (D-223). Inside the write transaction, the handler does three things:
    1. Locks the Goal rows involved with `SELECT ... FOR UPDATE`, in id order when there are two.
    2. Computes each Goal's progress after the change.
    3. Refuses with 422 `validation_failed` on `amountMinor` if any would be negative.

    Two concurrent withdrawals therefore cannot both pass.
- **BR-F03-15** A contribution larger than all-time unallocated savings shows a warning in the dialog and is still allowed (D-102). The figure comes from F06's Goals summary. Golden: more than 89,363.00 warns; exactly 89,363.00 does not.

**Charges and demo rows**

- **BR-F03-16** A charge is a row whose source is `subscription`. Its editable fields are amount, category, payee, description and note (D-224); its type, date and time are fixed. Any edit of a linked charge sets `edited` (D-270), so a later Subscription change leaves it alone (F05, BR-F05-10 to BR-F05-14). The dialog shows "Auto from Netflix" with a link to the Subscription, or "From a deleted Subscription" when it is no longer linked (D-96).
- **BR-F03-17** Deleting a charge still linked to its Subscription runs three steps in one transaction (D-93, D-236):
    1. Lock the Subscription with `SELECT ... FOR UPDATE`.
    2. Delete the charge.
    3. Write the tombstone (`subscriptionId`, `dueOn`).

    Catch-up takes the same lock before it computes missing due dates (JOB-2, F05). A delete and a catch-up run therefore cannot interleave and recreate the charge.
    - **An unlinked charge:** a charge whose Subscription was deleted is deleted without a tombstone or lock.
    - **The charge is already gone (404):** a charge delete carries the cached `{ subscriptionId, dueOn }` as a hint, the one exception to BR-F03-19. If that Subscription still exists and the date has no charge, the handler writes the tombstone, commits, and answers 204, so the delete counts as done (D-239). A skip is therefore never lost when an end date removed the charge first and was later moved back.
    - **The Subscription is deleted meanwhile:** if the Subscription is gone when step 1 locks it, the handler re-reads the charge. Now unlinked, it is deleted without a tombstone. If it is gone too (F05, BR-F05-14 deleted it), the delete counts as done.
- **BR-F03-18** Demo rows are edited and deleted like other rows, apart from BR-F03-11 (date and time) and BR-F03-13 (no move to a non-demo Goal), and stay demo rows after an edit (F15).
- **BR-F03-19** The API never accepts `source`, `demo`, `edited`, `subscriptionId` or `dueOn` from the client (a charge delete's hint is the one exception, BR-F03-17), and never accepts `createdAt` on an edit, so the window's anchor cannot move. Every create through this API has source `manual` and `demo` false.

**Creating**

- **BR-F03-20** `POST /api/transactions` carries the client id and an `Idempotency-Key`, and returns 201 with the row. An id that already exists for this user returns 200 with the existing row (API-5).
- **BR-F03-21** Save closes the dialog. "Save and add another" keeps the type, date and time, clears every other field, and focuses Amount.
- **BR-F03-22** If the new row does not match the current filter, the toast says "Saved. It's hidden by your filters." with Show, which clears the filters.

**Editing**

- **BR-F03-23** `PATCH /api/transactions/[id]` sends only the changed fields, with `If-Match`. When the date or the time changes, `occurredAt` and `occurredOn` are sent together; otherwise neither is sent. The server validates the merged row against every rule here.
- **BR-F03-24** A 409 `version_conflict` opens the conflict view (OFF-7). Both versions appear side by side, with differences highlighted, and two actions:
    - **Keep mine:** resends the change against the current version.
    - **Keep theirs:** discards the change.

    Online saves and queued replays use the same view.
- **BR-F03-25** A 404 on an edit shows "This Transaction was deleted on another device." and the row leaves the list. A 404 on a delete counts as done, with no message (D-239).

**Deleting**

- **BR-F03-26** Delete removes the row from the screen at once and shows "Transaction deleted." with Undo for 5 seconds (D-84). The `DELETE` request, with `If-Match`, is sent when the 5 seconds end.
    - **From M5 (D-228, D-364):** the delete enters the write queue at once with a 5-second hold, so closing the tab does not cancel it, and nothing sends it early. Undo removes the item while it is still unsent. The toast does not pause on hover, and it closes when the item is sent (P1, BR-P1-16).
    - **Before M5:** a timer in the page holds the delete. Closing the tab within the 5 seconds cancels it.
    - **During the 5 seconds:** from M5 the deletion counts as a pending delete in the header (BR-F03-42). Before M5 the header changes once the delete is confirmed.
    - **409 after the window:** the conflict view opens (BR-F03-24). Keep mine deletes against the current version; Keep theirs keeps the row.
    - **Other refusals after the window** (`goal_read_only`, the Goal floor):
        - **From M5:** the row reappears in place with "Not saved" and the reason, and its sync-panel item offers Retry and Discard (OFF-7; P1, BR-P1-25).
        - **Before M5:** the row reappears with a toast giving the reason.
    - **Network failure before M5:** the row reappears with "Couldn't delete. Check your connection and try again."
    - **Queue order (from M5):** later items wait behind a held delete, for at most 5 seconds, so replay keeps creation order (OFF-5).
- **BR-F03-27** Deleting a row whose create is still queued: when the delete's hold ends, if the create was never sent, both are removed with every other queued item for the row, and no request is made. Once the create has been sent, the delete is sent after it (OFF-5; P1, BR-P1-15).

**Duplicate**

- **BR-F03-28** Duplicate opens the dialog as a new Transaction:
    - it copies the type, amount, category or Goal, payee, description and note;
    - date and time are now, and the id is new;
    - duplicating a charge or a demo row creates a manual, non-demo row.

    Duplicate is hidden for Transactions of a read-only Goal.

**List and order**

- **BR-F03-29** Order (D-218):
    - **Date sort:** `occurredOn`, then `occurredAt`, then `id`, all in the chosen direction (newest first by default).
    - **Amount sort:** `amountMinor`, then `occurredOn`, `occurredAt` and `id` in the same direction.

    Day groups therefore never interleave, even after a time-zone change. Cursors stay stable when rows are inserted (API-7).
- **BR-F03-30** Pages hold 50 rows. The list behaves like this (D-36, D-171):
    - it keeps at most 5 pages in memory (`maxPages`) and reloads pages trimmed from the top through `prevCursor`;
    - it is a virtualized React Aria GridList;
    - scrolling near the end loads the next page, and a visible Load more button does the same (NFR-5);
    - each load announces "Loaded 50 more Transactions" in a polite live region.
- **BR-F03-31** The date sort shows sticky day headers by `occurredOn`: "Today", "Yesterday", or the F02 day format ("Sat, 31 Oct"; "Sat, 31 Oct 2025" outside the current year). The amount sort shows the date on each row instead.
- **BR-F03-32** A row shows six things:
    - **Avatar:** the payee's initials (D-86), taken from the letters and digits of the payee: the first character of each of the first two words, or the first two characters of a single word, uppercase. With none, the category icon. Goal rows show the Goal's icon and color.
    - **Title:** the payee. Goal rows read "To Vacation" or "From Vacation".
    - **Subtitle:** the description, else the category label. Goal rows show nothing.
    - **Category chip:** with the category's color (CAT-4); none on Goal rows.
    - **Time:** or "Auto" for charges.
    - **Amount and badges:** the signed amount (D-231), then any badge: "Pending sync" or "Not saved".

**Filters**

- **BR-F03-33** The committed filter lives in the URL (FIL-4) and is normalized before use:
    - parameters in a fixed order: `from`, `to`, `type`, `cat`, `goal`, `sub`, `src`, `min`, `max`, `q`, `sort`, `dir`;
    - lists sorted and deduplicated;
    - defaults omitted (`sort=date`, `dir=desc`, no dates for all time).

    The normalized object is the query key, so equivalent URLs share one cache entry.
- **BR-F03-34** An invalid parameter is dropped and the page says "Some filters in this link weren't valid and were removed." (FIL-5). Invalid means any of:
    - an unknown type or category;
    - a malformed date;
    - `from` after `to` (both dropped);
    - `min` above `max` (both dropped);
    - an amount that does not parse in major units with `.`, has more decimals than the currency allows, or exceeds MON-5;
    - a non-numeric `q` under 3 characters, any `q` over 100, or a `q` with control characters;
    - a `goal` or `sub` that is not a UUID;
    - an unknown `sort` or `dir`.

    A well-formed Goal or Subscription id that is not the user's simply matches no rows.
- **BR-F03-35** Text search (FIL-3):
    - **Text:** `q` matches the expression `coalesce(payee, '') || U+001F || coalesce(description, '') || U+001F || coalesce(note, '')`, case-insensitively, as a substring, through one trigram index on that expression. Stored text never holds U+001F (BR-F03-12), and `q` may not contain control characters, so a match never spans two fields. `%`, `_` and `\` in `q` match literally.
    - **Numbers:** a numeric `q` also matches `amountMinor` exactly. A numeric `q` is one that the amount field would accept (BR-F03-04): digits, commas only in a valid grouping, one `.`, and no more decimals than the currency allows.
    - **Short numbers:** a numeric `q` under 3 characters matches amounts only.

    Golden checks D, G and H.
- **BR-F03-36** `min` and `max` are inclusive bounds on `amountMinor`, given in major units with `.` (root 6.9). They apply to every type.
- **BR-F03-37** A category filter excludes Goal rows (FIL-6), and the filter control says so: "Category filters hide Goal Transactions." A Goal filter shows only that Goal's rows. A Subscription filter (`sub`, D-255) shows only that Subscription's charges; F05's View charges opens it, and its chip reads "Netflix charges".
- **BR-F03-38** The text box commits its draft 300 ms after typing stops (FIL-4). Enter, or clearing the box, commits at once.
- **BR-F03-39** Where filters appear:
    - **Desktop:** inline, and each change commits.
    - **Phones:** a sheet with Apply.
    - **Everywhere:** active filters show as removable chips with Clear all.
- **BR-F03-40** Sort options are Newest first (the default), Oldest first, Largest first and Smallest first.

**Header totals**

- **BR-F03-41** The header shows Count, In, Out and To Goals for the committed filter (D-82), from `/api/transactions/summary`. That endpoint uses the same filter-to-SQL function as the list (FIL-2) and counts confirmed rows only (TXN-6). Negative figures show a minus sign (TXN-7).
- **BR-F03-42** Pending changes that match the filter add an annotation beside each figure they move:
    - **The figures:** "+300.00 pending" or "−300.00 pending" for money, "+1 pending" for the count.
    - **The deltas:** a pending create adds its row; a pending edit adds the difference between old and new; a pending delete subtracts its row.
    - **Lifetime:** the annotation stays until the summary refetches after the sync (OFF-6).
- **BR-F03-43** Matching pending rows to the filter uses one shared module, `matchesFilter(row, filter)`. It mirrors the SQL predicate rule for rule and builds the same search string as BR-F03-35. The golden list checks run against both. It is used only for pending rows, never for confirmed figures.

**Payee suggestions**

- **BR-F03-44** `GET /api/payees` returns up to 200 payees used in the last 365 days, by `occurredOn`:
    - grouped case-insensitively and shown in their most recent spelling;
    - ordered by count, then by last use;
    - each with its last type and last category.

    The answer is persisted for offline use (STATE-3).
- **BR-F03-45** The payee field filters that list on the device (D-225). From the first character it suggests up to 8 payees that start with the typed text, or that have a word starting with it, case-insensitively. Choosing one fills the payee only.
    - **The category chip:** when that payee's last category is valid for the current type, a chip "Last time: Food" appears. Tapping it sets the category.
    - **Never automatic:** the category is never filled in on its own (D-89).

**Pending, rejected and conflicting rows**

- **BR-F03-46** Pending rows (D-226):
    - **Creates:** those that match the filter appear in a "Waiting to sync" group above the first page, newest first, whatever the sort.
    - **Edits:** shown in place, with the new values and "Pending sync".
    - **Deletes:** hidden.
- **BR-F03-47** Rejected or conflicting rows show "Not saved" with the reason. Selecting one opens its item in the sync panel (OFF-7). A rejected create stays in the waiting group with "Not saved".

**The dialog**

- **BR-F03-48** The entry dialog is a bottom sheet on phones.
    - **Fields, in order:** Type (Expense, Income, Refund, To Goal, From Goal), Amount (focused), Payee or Goal, Category (not for Goal types), Date and time, Description, Note (behind "Add a note" until used).
    - **Buttons:** Save, "Save and add another" (create only), Cancel. Editing adds Duplicate and Delete.
    - **Opened from:** the header's Add, the phone's Add tab, the palette (F13), the `N` shortcut, `new=1`, and empty states.
- **BR-F03-49** Closing with unsaved changes asks "Discard changes?" with Discard and Keep editing.
- **BR-F03-50** Read-only parts:
    - A charge's fixed fields show as text.
    - A Transaction of a read-only Goal opens read-only with the reason, for example "Vacation is completed, so its Transactions can't be changed."
- **BR-F03-51** The Goal picker lists active, editable Goals with their progress. With none: "Create a Goal first" with a link to `/goals`.

**Keyboard**

- **BR-F03-52** Shortcuts run through the one Hotkeys wrapper (D-171) and do nothing while a text field has focus.

    | Key | Where | Does |
    | --- | --- | --- |
    | `N` | Any logged-in page | Opens a new Transaction |
    | `/` | Transactions | Focuses the search box |
    | Ctrl or Cmd+Enter | Dialog | Saves |
    | Esc | Dialog | Closes, with BR-F03-49 |
    | Arrow keys | List | Move between rows (GridList) |
    | Enter | List | Opens the row |
    | Delete or Backspace | List | Deletes the row, with Undo |
    | `D` | List | Duplicates the row |

**Deep links**

- **BR-F03-53** `txn=<id>` opens that Transaction's dialog over the list, loaded through `GET /api/transactions/[id]`. A 404 shows "We couldn't find that Transaction." `new=1` opens an empty dialog. Closing the dialog removes the parameter by replacing the URL.

**Bulk delete (Stretch)**

- **BR-F03-54** With `transactions.bulkDelete` on, the list gains a Select mode. Up to 100 loaded rows can be selected, and "Delete 12" deletes them with one Undo.
    - **The request:** one `POST /api/transactions/bulk-delete` with `{ items: [{ id, version }] }`, which is all or nothing.
    - **A version mismatch:** any mismatch returns 409 `version_conflict` listing the ids, and nothing is deleted.
    - **Per row:** BR-F03-13, BR-F03-14 and BR-F03-17 apply to each row. The handler first collects every Goal and Subscription involved, then locks them in SRV-7 order (Goals, then Subscriptions, each in id order), and only then deletes the rows.

## 5. Calculations

**Header totals** (TXN-5, over confirmed rows that match the filter)

```text
Count     = number of rows
In        = Σ income
Out       = Σ expense − Σ refund
To Goals  = Σ goal_contribution − Σ goal_withdrawal
```

Every check in [03-golden-dataset.md, Transactions list checks](../03-golden-dataset.md#transactions-list-checks) must hold. For example:
- **Check A**, `from=2026-10-01&to=2026-10-31`, gives 14 rows, In 85,000.00, Out 31,168.00 and To Goals 7,000.00.
- **Check I** gives Out 18,420.00, with the pending P1 shown as "+300.00 pending" beside Out.

**Amount parsing** (locale per F02)

| Typed | Profile (`numberLocale`, currency) | `amountMinor` |
| --- | --- | --- |
| `1,240.50` | IN (`hi-IN-u-nu-latn`, INR) | 124050 |
| `1240.5` | IN | 124050 |
| `1,23,456.50` | IN | 12345650 |
| `1.234,50` | DE (`de-DE-u-nu-latn`, EUR) | 123450 |
| `12,5` | DE | 1250 |
| `12.50` | DE | refused: Use , for decimals, like 12,50. |
| `12,50` | US (`en-US-u-nu-latn`, USD) | refused: Use . for decimals, like 12.50. |
| `1240` | JP (`ja-JP-u-nu-latn`, JPY) | 1240 |
| `1240.5` | JP | refused: no decimals |
| `1.25` | KW (`en-KW-u-nu-latn`, KWD) | 1250 |
| `0.004` | KW | 4 |

**Entry window.** Recorded on 2026-10-16, the allowed dates are 2026-10-06 to 2026-10-16. An edit two months later can still move the date only within that range.

**`occurredOn` check** (BR-F03-10). Row 26 has `occurredAt` 2026-10-31T19:00:00Z.
- Minus 12 hours is 07:00 UTC on 31 October; plus 14 hours is 09:00 UTC on 1 November.
- So 2026-10-31 and 2026-11-01 are both accepted, and the stored 2026-11-01 passes.

**Goal floor** (BR-F03-14)
- Vacation's progress is 5,000.00, so a 6,000.00 withdrawal is refused: "You can withdraw at most 5,000.00 from Vacation."
- Deleting row 9 (a 3,000.00 contribution) is allowed: progress goes from 5,000.00 to 2,000.00.
- Then deleting row 22 as well would leave −1,000.00, so it is refused.

**Order.** The golden order checks hold:
- Newest first gives P1 (in the waiting group), then #26, #27, #25, #24.
- October by amount, largest first, starts with #13 and #12, as listed in the golden file.

## 6. Screens and states

**`/transactions`**, top to bottom:
- **Search box and filter controls.**
- **Active-filter chips** with Clear all.
- **Header:** Count · In · Out · To Goals, with pending annotations, and an "as of" time offline.
- **Sort control.**
- **The "Waiting to sync" group,** when it has rows.
- **The list.**
- **Load more.**

On desktop, each row also has a menu (⋯) with Edit, Duplicate and Delete. On phones, those actions live in the dialog.

**Entry dialog.** BR-F03-48 to BR-F03-51.

**Conflict view.** BR-F03-24.

| State | List | Header | Dialog |
| --- | --- | --- | --- |
| Loading | Skeleton rows | Skeleton figures | Goal picker and payee suggestions use cached data at once |
| Empty, no Transactions at all | "No Transactions yet." with Add Transaction, plus Load demo data while the account is empty (F15, BR-F15-01) | Zeros | n/a |
| Empty, filtered | "No Transactions match these filters." with Clear filters | Zeros | n/a |
| Error | "Transactions could not be loaded." with Retry | "Totals could not be loaded." with Retry | Field messages, or "Your change wasn't saved. Try again." |
| Offline | Cached first pages of the default filter. For any other filter: "You're offline. Filters need a connection." with Clear filters | Cached figures with "as of" | Works; saving queues the change |
| Pending | "Waiting to sync" group; "Pending sync" badges | Pending annotations | n/a |
| Locked (Premium) | n/a | n/a | n/a |
| Read-only | n/a | n/a | Charge fields (BR-F03-16); read-only Goals (BR-F03-50) |

## 7. Flows

**7.1 Add an expense, online**

1. The user presses Add. The dialog opens with type expense, now, and Amount focused.
2. They type `640`, choose Swiggy from the suggestions, tap "Last time: Food" and save.
3. From M5, the row appears at once, marked pending until the server confirms, and the header shows "+640.00 pending" beside Out. Before M5, the dialog waits for the response.
4. **201:** the row becomes confirmed, and the queries in section 12 refetch.
5. **422:** the dialog reopens with each field's message.
6. **Network failure:** from M5 the write stays queued and retries (P1). Before M5 the dialog stays open with "Your change wasn't saved. Try again."

**7.2 Add offline (from M5).** As 7.1. The row stays in the waiting group until the network returns and the queue replays it exactly once (P2, BR-P2-18).

**7.3 Edit**

1. The user selects a row; the dialog opens with its values.
2. They change the amount and save.
3. `PATCH` with `If-Match`.
4. **200:** done. **409:** the conflict view (7.4). **404:** BR-F03-25. **422 `goal_read_only`:** the dialog becomes read-only with the reason.

**7.4 Conflict**

1. Device A changes row 21 from 2,900.00 to 3,100.00 and syncs; the version becomes 2.
2. Device B, offline, changes the same row's description and replays with `If-Match: "1"`.
3. B gets 409 with version 2 in `details.current`, and the conflict view shows both versions.
4. **Keep mine:** B's description is sent against version 2, keeping A's amount. **Keep theirs:** B's change is discarded.

**7.5 Delete with Undo**

1. The user deletes a row. It disappears; the toast shows Undo.
2. **Undo within 5 seconds:** the row returns and no request is sent.
3. **Otherwise:** `DELETE` with `If-Match` is sent or queued.
4. **409:** the conflict view opens (BR-F03-24). **Other refusals:** BR-F03-26. **404:** it was already gone, which counts as done (D-239).

**7.6 Delete a charge**

1. The user deletes the Cult Gym charge for 2026-10-10.
2. One transaction deletes the row and writes the tombstone.
3. The next catch-up never recreates it (golden: the Cult Gym tombstone).

**7.7 Drill down from a chart**

1. A chart element (F09) navigates to, for example, `/transactions?from=2026-10-01&to=2026-10-31&cat=food`.
2. The list and header load for that filter: 4 rows, Out 6,220.00 (golden check B).
3. The figure matches the chart.

**7.8 Search by amount.** Typing `649` commits after 300 ms. The list shows #5 and #16, with Out 1,298.00 (golden check H).

**7.9 A contribution above unallocated savings**

1. The user picks To Goal, then Emergency fund, and types 90,000.
2. The dialog warns: "This is more than your unallocated savings of 89,363.00. You can still save it."
3. Saving works.

**7.10 A withdrawal above progress**

1. The user picks From Goal, then Vacation, and types 6,000.
2. The server returns 422 on the amount: "You can withdraw at most 5,000.00 from Vacation."

## 8. Validation and messages

| Field or action | Rule | Message shown |
| --- | --- | --- |
| Amount | Required | Enter an amount. |
| Amount | Not a number | Enter a number, like 1,240.50. (The example is formatted with the user's `numberLocale`) |
| Amount | The non-decimal mark outside a digit grouping | Use . for decimals, like 12.50. (Comma-decimal locales: Use , for decimals, like 12,50.) |
| Goal | Demo Transaction to a non-demo Goal | Demo Transactions can only move between demo Goals. |
| Delete | Network failure before M5 | Couldn't delete. Check your connection and try again. |
| Save | Offline before M5 | You are offline. Connect to save. |
| Amount | Above zero | Enter an amount above zero. |
| Amount | Too many decimals | Use at most 2 decimal places. (JPY: Yen amounts have no decimals. KWD: Use at most 3 decimal places.) |
| Amount | Above MON-5 | The largest amount is 999,999,999.99. (Formatted for the currency) |
| Payee | Required (income, expense, refund) | Enter who you paid, or who paid you. |
| Payee | Length | Use 80 characters or fewer. |
| Description | Length | Use 120 characters or fewer. |
| Note | Length | Use 500 characters or fewer. |
| Any text | Control characters | Remove unsupported characters. |
| Category | Required | Choose a category. |
| Goal | Required | Choose a Goal. |
| Date | `date_out_of_window` on create | Choose today or one of the 10 days before. |
| Date | `date_out_of_window` on edit | Choose a date from 6 Oct to 16 Oct. (The row's own window) |
| Time | In the future | The time can't be in the future. |
| Goal | `goal_read_only` | Vacation is completed, so its Transactions can't be changed. (Archived: Vacation is archived, so its Transactions can't be changed. Locked: Vacation is locked. Upgrade, or choose it as one of your 3 editable Goals.) |
| Withdrawal | Above progress | You can withdraw at most 5,000.00 from Vacation. |
| Edit or delete | Would take a Goal below zero | This would take Vacation below zero. Change or remove a withdrawal first. |
| Contribution | Above all-time unallocated (warning, not an error) | This is more than your unallocated savings of 89,363.00. You can still save it. |
| Save | `currency_mismatch` | Not saved: your currency changed after this was made. |
| Edit or delete | `not_found` | This Transaction was deleted on another device. |
| Search box | Under 3 characters, not numeric | Type at least 3 characters, or an amount. (No request is sent) |
| Link | Invalid parameters | Some filters in this link weren't valid and were removed. |
| Save | Hidden by the filter | Saved. It's hidden by your filters. |
| Deep link | `txn` not found | We couldn't find that Transaction. |

## 9. Plan gating

None for the core. Goal Transactions are not capped; the Goals cap applies to Goals themselves (F06). Bulk delete checks `transactions.bulkDelete` (Stretch); with it off, `POST /api/transactions/bulk-delete` returns 403 `feature_off`.

## 10. Offline behavior

- **Readable offline:** the first 2 pages and the summary of the default filter (all time, newest first), payee suggestions and the Goals list. All are persisted per STATE-3 and shown with their "as of" time.
- **Writable offline:** creates, edits and deletes of every type queue in the write queue (OFF-4, P1).
    - **Offline entry:** the dialog uses the device clock in the profile zone for today and the window (F02).
    - **On the screen:** pending rows show per BR-F03-46, and header figures are annotated, never changed (TXN-6).
- **Replay outcomes:**
    - 409 `version_conflict` opens the conflict view;
    - `goal_read_only`, `date_out_of_window`, `currency_mismatch`, `parent_missing` and `validation_failed` mark the item rejected, with the message from section 8;
    - 404 on a delete counts as done (D-239).
- **Needs a connection:** a filter or search not already cached shows the offline state.

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency and versioning |
| --- | --- | --- | --- | --- | --- |
| `/api/transactions` | GET | Filter parameters (root 6.9), `sort`, `dir`, `limit` (default 50, maximum 100), `cursor` | `{ items, nextCursor, prevCursor, currency }` | 400, 401, 403 `profile_required` | Read; repeatable read (P2) |
| `/api/transactions/summary` | GET | Filter parameters | `{ count, incomeMinor, spendingMinor, toGoalsMinor, currency }` | 400, 401, 403 | Read; same filter function as the list |
| `/api/transactions/[id]` | GET | none | The row | 401, 403, 404 | Read |
| `/api/transactions` | POST | `{ id, type, amountMinor, currency, occurredAt, occurredOn, createdAt, category or goalId, payee, description, note }` | 201 with the row, or 200 with the existing row | 400, 401, 403, 409 `id_conflict`, 422 `validation_failed`, `date_out_of_window`, `parent_missing`, `goal_read_only`, `currency_mismatch` | `Idempotency-Key` required |
| `/api/transactions/[id]` | PATCH | Changed fields; `currency` when `amountMinor` is sent | 200 with the row | 400, 401, 403, 404, 409 `version_conflict`, 422 as for POST | `Idempotency-Key` and `If-Match` required |
| `/api/transactions/[id]` | DELETE | `{}`; for a charge, `{ subscriptionId, dueOn }` as a hint (BR-F03-17) | 204 | 400, 401, 403, 404, 409 `version_conflict`, 422 `goal_read_only` or `validation_failed` (Goal floor) | `Idempotency-Key` and `If-Match` required |
| `/api/payees` | GET | none | `{ items: [{ payee, count, lastUsedOn, lastType, lastCategory }] }`, at most 200 | 401, 403 | Read |
| `/api/transactions/bulk-delete` (Stretch) | POST | `{ items: [{ id, version }] }`, 1 to 100 | 200 `{ deleted }` | 401, 403 `feature_off`, 409 `version_conflict` with `details.ids`, 422 | `Idempotency-Key` required |

**Error code added by this spec**

| Status | Code | Default message | Write queue does |
| --- | --- | --- | --- |
| 422 | `goal_read_only` | This Goal can't be changed right now. | Reject |

`currency_mismatch` is a root code (API-9), since F04 to F06 use it too.

**Shared functions** (the filter-to-SQL module, FIL-2)
- **`rollup(tx, ctx, requests)`:** takes one or more `{ filter, by }` requests and answers all of them in one SQL statement (D-293).
    - **`by`:** `total`, `category`, `day`, `week` (from the profile's week start), `month` (grouped by `occurredOn`) or `subscription` (charges per Subscription, F11); or `bounds`.
    - **Each group:** count, income, spending (Out), To Goals and net.
    - **`bounds`:** the earliest and latest `occurredOn` of the filter's confirmed rows, or none.
    - **Used by:** the summary endpoint, F08's dashboard and F09's charts.
- **`listTransactions(tx, ctx, filter, { sort, dir, limit, cursor })`:** the list query, one statement. F08's Recent Transactions uses it with `limit: 8`.
- **`matchesFilter(row, filter)`:** mirrors the SQL predicate for pending rows (BR-F03-43).

**Server-side check order for a write** (locks in SRV-7 order). The handler first reads the row, without a lock, to learn its Goal and Subscription. The row's own lock comes only from the versioned write in step 7, after the Goal and Subscription locks.
1. Zod shape.
2. Type rules.
3. The profile lock, then the currency check (BR-F03-05).
4. Dates: future, `occurredOn` fit, window.
5. Goal lock, state and floor (BR-F03-13, BR-F03-14). A Goal that is missing when it is locked gives 422 `parent_missing`.
6. For a linked charge's delete, the Subscription lock (BR-F03-17).
7. The write.
8. The tombstone, for a linked charge's delete.

## 12. Cross-feature effects

After a confirmed write, the client invalidates the following, where M is the month of each affected `occurredOn` (old and new, for an edit that moves the date):

| Query | Why |
| --- | --- |
| Every Transactions list and summary | Rows and totals changed |
| The whole dashboard prefix, every month (F08, D-295) | Comparisons, the 12-month chart and all-time Goal figures read months other than M |
| Budgets for M (F04) | Category spending changed |
| Goals list, summary and the affected Goal (F06) | Progress, and all-time unallocated, change with any write |
| Analytics (F09) | Every chart reads Transactions |
| Insights, every month (F10, D-337) | Detectors read the same aggregates, with baselines reaching back 3 months |
| Payees | New or renamed payees |
| Subscriptions (F05) | Only when a charge changed: charges this month |
| Profile and demo status (F02, F15) | Only on a create or delete: currency lock and account emptiness |

Search (F13) reads the same rows live. Reports (F11) are never cached.

## 13. Edge cases

- **Midnight boundary:** row 26 at 00:30 on 1 November counts in November, not October (root success criterion 2).
- **Offline across midnight:** a Transaction created offline at 23:58 and synced the next day is checked against its own `createdAt`, not the sync time.
- **Time-zone change before sync:** the profile zone changes between an offline create and its sync.
    - The `occurredOn` check passes (BR-F03-10).
    - The recording date, computed in the new zone, can shift by a day. A date at the window's edge may then be rejected with `date_out_of_window`; the sync panel offers Edit.
- **Edit of a queued create:** coalesced into one create (OFF-5).
- **A Goal completed on another device** while a contribution is queued: replay gets `goal_read_only` and the item shows "Not saved: Vacation is completed."
- **A charge whose Subscription was deleted:** it keeps "Auto" and source `subscription`, and is deleted without a tombstone.
- **Amount sort across types:** the amount is the positive magnitude, so income sorts among expenses by size, as in golden October.
- **Category and Goal filters together:** they combine with AND (FIL-1), and a category excludes Goal rows, so the result is empty.
- **A numeric `q` such as `649`:** also matches any payee, description or note containing "649".
- **A payee of only emoji or symbols:** no initials, so the avatar shows the category icon.
- **Very old cursors:** keyset cursors stay valid after rows before them are deleted.
- **Scrolling far down, then back up:** pages trimmed by `maxPages` reload through `prevCursor`.
- **Case folding of non-ASCII letters** can differ slightly between JavaScript and Postgres. This only affects the pending-row match, never confirmed figures.

## 14. Acceptance criteria

- **AC-F03-01** (integration, M2) On the golden dataset, list checks A to I return exactly the listed rows, count, In, Out and To Goals.
- **AC-F03-02** (client integration, M5) With P1 queued, check I's header shows "+300.00 pending" beside Out and "+1 pending" beside Count, and To Goals unannotated. After P1 syncs and the summary refetches, Out reads 18,720.00 with no annotation (golden invariant 5).
- **AC-F03-03** (integration, M2) The golden order checks hold for newest first and for October by amount.
- **AC-F03-04** (integration, M2) Bucketing uses `occurredOn`: October food is 6,220.00, and #1, #12, #26 and #27 fall in their local months.
- **AC-F03-05** (integration) Replaying one create twice with the same key creates one row (golden invariant 4). A new key with the same id returns 200 with the existing row.
- **AC-F03-06** (integration) The date window and future time:
    - Created on 2026-10-16, with `createdAt` equal to `ctx.now`, a date of 2026-10-05 gets `date_out_of_window` and 2026-10-06 passes.
    - An edit two months later to 2026-10-06 passes, and to 2026-10-17 is refused.
    - An `occurredAt` 10 minutes ahead of `ctx.now` is refused.
    - A PATCH that carries `createdAt` is refused.
- **AC-F03-07** (integration) A create with `occurredAt` 2026-10-31T19:00:00Z and `occurredOn` 2026-11-01 passes; with `occurredOn` 2026-11-02 it is refused.
- **AC-F03-08** (unit) Daylight saving: in `America/New_York`, 2026-03-08 02:30 resolves to 03:30 EDT, and 2026-11-01 01:30 resolves to the EDT instant.
- **AC-F03-09** (integration) Type rules:
    - a payee on a `goal_contribution` is refused;
    - an `income` with category `food` is refused;
    - a PATCH from `expense` to `goal_contribution` is refused;
    - a PATCH from `expense` to `refund` keeps the category.
- **AC-F03-10** (integration, M2) Goals:
    - A withdrawal of 6,000.00 from Vacation (progress 5,000.00) is refused.
    - Two concurrent 3,000.00 withdrawals leave exactly one committed.
    - Any write on a completed Goal returns `goal_read_only`.
- **AC-F03-11** (integration, M2) Charges:
    - A charge's amount and category can be changed.
    - Changing its `occurredOn` is refused.
    - Editing it sets `edited`, and a later price change on its Subscription leaves it unchanged (F05).
    - Deleting a linked charge writes a tombstone, and a following catch-up creates nothing for that due date.
- **AC-F03-12** (integration) `source`, `demo`, `edited`, `subscriptionId` and `dueOn` in a POST or PATCH body are refused.
- **AC-F03-13** (integration) A create with `currency: "USD"` for an INR profile returns 422 `currency_mismatch`.
- **AC-F03-14** (unit) Amount parsing matches the table in section 5, including `12.50` refused for a DE profile and `12,50` for a US profile, and no float operation appears in the parser (lint rule on the module).
- **AC-F03-15** (unit) URL normalization:
    - `?cat=food,food&dir=desc&sort=date` normalizes to `?cat=food`;
    - `from=2026-10-31&to=2026-10-01` drops both with the notice;
    - `q=ab` is dropped and `q=12` is kept.
- **AC-F03-16** (integration) `q=50%` matches a description containing "50%" literally and not "500".
- **AC-F03-17** (unit) `matchesFilter` agrees with the SQL filter on every golden list check.
- **AC-F03-18** (client integration, M5) A pending create appears in "Waiting to sync" under every sort.
    - A pending delete hides its row, and Undo within 5 seconds sends no request.
    - From M5, a delete survives a reload within the 5 seconds and is sent.
- **AC-F03-19** (client integration) A 409 on edit opens the conflict view with both versions. Keep mine resends with the current version.
- **AC-F03-20** (client integration) Choosing a payee suggestion fills only the payee; the "Last time" chip appears only when its category fits the type.
- **AC-F03-21** (integration) `/api/payees` returns at most 200 entries, groups "swiggy" and "Swiggy" into one, and ignores rows older than 365 days.
- **AC-F03-22** (E2E) On the stress account, scrolling 1,000 rows keeps at most 5 pages loaded, and scrolling back to the top restores the first rows.
- **AC-F03-23** (E2E, M3) Adding a Transaction from the dashboard's Add button updates the dashboard's spending widget after confirmation (root TST-4).
- **AC-F03-24** (accessibility) The list, filters and dialog pass axe with no serious or critical violations. A Transaction can be added, filtered, opened, edited and deleted with the keyboard alone, using Load more instead of scrolling.
- **AC-F03-25** (performance) Saving a Transaction and applying a filter each stay within INP 200 ms on the stress account (root 11.1).
- **AC-F03-26** (integration, Stretch) A bulk delete of 3 rows, one with a stale version, deletes none and returns 409 with that id.
- **AC-F03-27** (integration) On golden's income, expense and refund rows alone, list checks B, C, D, E, G and H hold. At M1 the charges load as unlinked rows with source `subscription`.
- **AC-F03-28** (integration, M2) A charge delete and a catch-up run for the same Subscription start together. Afterwards the tombstone exists and no charge exists for that due date.
- **AC-F03-29** (integration, M2) Moving a demo contribution to one of the user's own Goals returns 422 on `goalId`.
- **AC-F03-30** (client integration) A delete refused with 409 after the Undo window opens the conflict view, and Keep theirs brings the row back. From M2, a delete refused by the Goal floor brings the row back with its reason.
- **AC-F03-31** (integration) `q=swiggy monthly` does not match a row with payee Swiggy and description "Monthly groceries", because the fields never join into one string.
- **AC-F03-32** (client integration) After golden moves to `America/Los_Angeles`, row 26's dialog shows 1 November and 12:00 pm. Changing only the time keeps `occurredOn` 2026-11-01.

## 15. Illustrations

Illustrative, a create request:

```json
{
  "id": "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c01",
  "type": "expense",
  "amountMinor": 64000,
  "currency": "INR",
  "occurredAt": "2026-10-19T16:45:00Z",
  "occurredOn": "2026-10-19",
  "createdAt": "2026-10-19T16:46:12Z",
  "category": "food",
  "payee": "Swiggy",
  "description": null,
  "note": null
}
```

Illustrative, a list item for a charge:

```json
{
  "id": "0192…",
  "type": "expense",
  "amountMinor": 64900,
  "occurredAt": "2026-10-04T18:30:00Z",
  "occurredOn": "2026-10-05",
  "category": "entertainment",
  "payee": "Netflix",
  "description": null,
  "note": null,
  "source": "subscription",
  "demo": false,
  "subscription": { "id": "0192…", "name": "Netflix" },
  "dueOn": "2026-10-05",
  "edited": false,
  "version": 1,
  "createdAt": "2026-10-05T00:00:03Z",
  "updatedAt": "2026-10-05T00:00:03Z"
}
```

Illustrative, the list on a phone:

```text
[ Search payee, note or amount        ]  [Filters (2)]
This month · Food                            [x] [x]
1 (+1 pending) · In ₹0.00 · Out ₹420.00 (+₹300.00 pending) · To Goals ₹0.00
Newest first v

Waiting to sync
 (CP) Chai Point    Food   11:40 am      −₹300.00   Pending sync

Yesterday
 (SW) Swiggy        Food   12:30 am      −₹420.00
                  [ Load more ]
```

Illustrative, the entry dialog:

```text
New Transaction
( Expense | Income | Refund | To Goal | From Goal )
Amount     [ ₹ 640          ]
Payee      [ Swi            ]  -> Swiggy, Swiggy Instamart
           [ Last time: Food ]
Category   (Food) (Shopping) (Transportation) ...
Date       [ Mon, 19 Oct v ]   Time [ 10:15 pm ]
Description [               ]
+ Add a note
[Cancel]            [Save and add another] [Save]
```
