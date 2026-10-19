# F13 Search and command palette

18 Oct 2026 · @Himanshu

One palette, opened with Ctrl or Cmd+K or the header's search button, finds anything a user has written and does anything the app offers. It searches Transactions (payee, description, note and exact amounts), Subscription names, Goal names and Learn titles, and lists quick actions: add a Transaction, Subscription or Goal; go to any page; switch the theme.

Scope chips and typed prefixes narrow the search. Results come from the server, under the user's own data rules, with the same matching as the Transactions list's text filter, so "See all" opens a list that agrees with the palette.

| Item | Value |
| --- | --- |
| Milestone | M6. Learn results arrive with F14 (M7) |
| Plan | Free and Premium. Field operators (`amount:>500`) are Stretch (`search.operators`) |
| Depends on | [F03](F03-transactions.md) (search expression, list order, the `q` filter), [F05](F05-subscriptions.md), [F06](F06-goals.md), F14 (Learn, M7), [P1](../platform/P1-offline-and-pwa.md) (offline, the queue), [F02](F02-onboarding-profile-settings.md) (theme, formats) |
| Decisions | D-47, D-48, D-133 to D-136, D-344 to D-347, D-372, D-385, D-386 |

## 1. User stories

- As a user, I want to find a Transaction by payee, note or amount from anywhere in the app.
- As a user, I want to jump to a Subscription or Goal by typing part of its name.
- As a keyboard user, I want to add a Transaction or go to a page without the mouse.
- As a phone user, I want the same search from a visible button.
- As a user, I want to narrow results to one kind and see all matches when there are many.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| The palette, its shortcut and button; scope chips and prefixes; quick actions and navigation; server search over Transactions, Subscriptions, Goals and (from M7) Learn; "See all"; offline behavior | Field operators such as `amount:>500 category:food` (D-136, `search.operators`) | Searching pending changes; fuzzy typo matching beyond substrings; search history; searching Budgets, categories or settings; full-text search of Learn bodies; searching investments |

## 3. Concepts and fields

**Scopes** (D-136)

| Chip | Prefix | Searches | Results in All | Results when scoped |
| --- | --- | --- | --- | --- |
| All | none | Everything below | | |
| Transactions | `t:` | Payee, description, note; exact amount | 5 | 20 |
| Subscriptions | `s:` | Name; exact amount | 5 | 20 |
| Goals | `g:` | Name | 5 | 20 |
| Learn (from M7) | `l:` (from M7) | Post titles (F14), 3 or more characters | 5 | 20 |
| Actions | `>` | Quick actions and pages, on the device | 5 | All |

**Query rules** (root 6.7, D-48, BR-F03-35)
- **Text:** trimmed and NFC-normalized, up to 100 code points, no control characters.
- **Searching the server:** needs at least 3 characters, unless the query is numeric.
- **A numeric query:** one the amount field would accept. Under 3 characters, it matches amounts only.
- **Actions:** matched on the device from the first character.

**Quick actions** (D-134)

| Action | Does | Keywords |
| --- | --- | --- |
| Add Transaction | Opens F03's entry dialog | expense, income, spend, new |
| Add Subscription | Opens F05's create dialog | bill, recurring, new |
| Add Goal | Opens F06's new Goal flow, which shows the limit message at the Free cap | save, target, new |
| Go to Dashboard, Transactions, Budgets, Subscriptions, Goals, Investments, Analytics, Insights, Reports, Settings, and Learn (from M7) | Navigates there | each page's name |
| Switch to dark theme / Switch to light theme | Changes the theme (F02) | theme, dark, light, appearance |

## 4. Business rules

**The palette (D-133, D-344)**

- **BR-F13-01** **Opening.** The palette opens from the header's search button on every logged-in page (root 4), and from Ctrl+K (Windows, Linux) or Cmd+K (macOS) through the app's TanStack Hotkeys wrapper (D-171), which is set to fire inside text fields. Inside the palette, or while another modal dialog is open, the shortcut does nothing. It always prevents the browser's own Ctrl or Cmd+K.
- **BR-F13-02** **Structure.** A modal dialog holding React Aria's `Autocomplete` with a `Menu` of results, which follows the combobox pattern (NFR-5).
    - **Top:** the search field.
    - **Below it:** the scope chips (section 3).
    - **Then:** the results, in groups: Transactions, Subscriptions, Goals, Learn, Actions.
- **BR-F13-03** **Keyboard.**
    - **Up and Down:** move through results across groups. Home and End go to the first and last result, as React Aria's Autocomplete passes them to the menu, so they do not move the caret.
    - **Enter:** opens the active result.
    - **Escape:** clears the field, or closes the palette when it is empty.
    - **Chips:** reachable with Tab, and set with Space or Enter.
- **BR-F13-04** **Prefixes.** Typing a prefix at the start of the field (`t:`, `s:`, `g:`, `l:` or `>`) selects its chip and removes the prefix from the text. Backspace in an empty field with a chip selected returns to All.
- **BR-F13-05** **Empty field.** The palette shows the Actions group: the three add actions, then the pages.

**Searching (D-345, D-346)**

- **BR-F13-06** **Sending.** 200 ms after typing stops, a query that meets section 3's rules is sent to `GET /api/search`.
    - **Stale answers:** a newer query aborts the older request, and only the latest answer renders.
    - **Too short:** a non-numeric query under 3 characters sends nothing; the Actions group still filters, and the palette says "Type at least 3 characters to search."
- **BR-F13-07** **Transactions** (D-47). Exactly the Transactions list's `q` filter (F03, BR-F03-35), through the same function, so its search expression, `coalesce` handling, numeric rule and literal `%`, `_` and `\` are F03's.

    Results are in list order, newest first (TIME-3), so the palette's first results are the first rows of the list that "See all" opens: `/transactions?q=<query>`.
- **BR-F13-08** **Subscriptions** (D-372): the predicate is `name ILIKE '%q%'`, with `%`, `_` and `\` escaped, through a trigram index on `name` (`gin_trgm_ops`). A numeric query also matches the amount exactly. Order: not ended first, by name, then ended ones with an "Ended" badge. Opening an ended one shows its dialog, with Resume (F05).
- **BR-F13-09** **Goals:** `name ILIKE '%q%'`, escaped as above, through a trigram index on `name` (`gin_trgm_ops`). Order: active, then completed, then archived, each by name.
- **BR-F13-10** **Learn (from M7):** public post titles through F14's `searchLearn`, only for queries of 3 or more characters. It runs after the database groups' transaction has committed, through P2's `afterCommit` option (BR-P2-15), so no connection waits on Sanity. A Sanity failure returns the group empty with `error: true`, shown as "Learn search failed." Until M7 the Learn chip, the `l:` prefix and "Go to Learn" are absent, and no Learn group is returned.
- **BR-F13-11** **Limits.** In All, each group returns up to 5 items and a `more` flag. In a scoped search, up to 20. "See all in Transactions" appears under the Transactions group whenever `more` is true, and "See all in Learn" (to `/learn?q=<query>`, from M7) likewise. Subscriptions and Goals have no See all; their lists are short, and a scoped search shows 20.
- **BR-F13-12** **Confirmed only.** The server searches confirmed rows. When the device's queue holds items, the palette adds "Changes waiting to sync appear here after they're saved." (P1).

**Results**

- **BR-F13-13** Each result shows:

    | Kind | Line | Opens |
    | --- | --- | --- |
    | Transaction | Payee (or the Goal's name for Goal rows), the category chip, the day in F02's format, and the signed amount (D-231) | `/transactions?txn=<id>` |
    | Subscription | Name, cadence and amount, and the next due date | `/subscriptions?open=<id>`, which opens its dialog (F05) |
    | Goal | Name and progress percent | `/goals/<id>` |
    | Learn | Title and kind | `/learn/<slug>` |
    | Action | Its label, with the shortcut where one exists | Runs it |

    The matched part of a name or payee is highlighted. Text is rendered as text, never as HTML.
- **BR-F13-14** Opening a result closes the palette. A navigation keeps the browser's history, so Back returns to the previous page.

**Offline (D-346)**

- **BR-F13-15** Offline, actions and navigation still work. The search groups show "You're offline. Search needs a connection." Nothing is saved or queued.

## 5. Calculations

None. Matching and order follow F03's rules. Golden examples ([03-golden-dataset.md](../03-golden-dataset.md)):

| Query | Transactions | Subscriptions | Goals |
| --- | --- | --- | --- |
| `swiggy` | #26, #25, #24, #4 (check D's rows, newest first) | none | none |
| `649` | #16, #5 (exact amount) | Netflix (649.00) | none |
| `net` | #16, #5 (payee "Netflix") | Netflix | none |
| `vac` | none: Goal rows have no payee | none | Vacation |
| `groceries` | #21, #8 (description, check G) | none | none |
| `gr` | not sent: under 3 characters and not numeric | | |

## 6. Screens and states

**The palette** (BR-F13-02).

| State | What the user sees |
| --- | --- |
| Loading | The previous results stay, with a progress bar under the field |
| Empty | "No results for “zzq”." per searched group; Actions still filter |
| Error | "Search failed. Try again." in place of the search groups; Actions work |
| Offline | BR-F13-15 |
| Pending | The waiting-to-sync note (BR-F13-12) |
| Locked (Premium) | n/a |
| Read-only | n/a |
| Too short | "Type at least 3 characters to search." |

## 7. Flows

**7.1 Find a payee.** The user presses Ctrl+K and types "swig". After 200 ms the palette shows four Transactions, newest first. Enter on the first opens it over the Transactions list.

**7.2 Scoped search.** The user types `s:net`. The Subscriptions chip is selected and the field reads "net". Netflix appears; Enter opens its dialog on `/subscriptions`.

**7.3 Quick action.** The user types `>add`. The three add actions remain; Enter on Add Transaction opens the entry dialog.

**7.4 See all.** "swiggy" on a large account returns 5 of many Transactions. "See all in Transactions" opens `/transactions?q=swiggy`, whose first five rows are the palette's five.

## 8. Validation and messages

| Situation | Message shown |
| --- | --- |
| Placeholder | Search or type > for actions |
| Too short | Type at least 3 characters to search. |
| No results | No results for “zzq”. |
| Search failed | Search failed. Try again. |
| Learn search failed | Learn search failed. |
| Offline | You're offline. Search needs a connection. |
| Waiting to sync | Changes waiting to sync appear here after they're saved. |
| See all | See all in Transactions |
| Results announcement | 7 results |

## 9. Plan gating

None in the core. Field operators are Stretch, behind `search.operators`.

## 10. Offline behavior

BR-F13-15: actions and navigation only. The palette saves nothing, and the search endpoint is online only (root 7.3).

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency |
| --- | --- | --- | --- | --- | --- |
| `/api/search` | GET | `q` (section 3's rules), `scope` (`all`, `transactions`, `subscriptions`, `goals`, `learn`; default `all`) | `{ q, scope, groups: [{ kind, items, more, error }], currency }` | 400 (`q` too short or invalid, unknown scope), 401, 403 `profile_required` | Read |

- **Statements:** one read transaction, with one statement per searched database group (at most 3), and from M7 one call to F14's search for Learn.
- **Indexes:** each group uses its trigram index (`pg_trgm`, D-48). A migration creates the extension and the `gin_trgm_ops` indexes on Subscription and Goal `name`, which `ILIKE` uses. F03 owns the Transactions index.
- **Learn's time:** the Learn call runs after the commit, so it is reported as `Server-Timing` `after;dur`, outside the 300 ms budget, which applies to `app;dur` (P2, BR-P2-15; D-386). F14's Sanity time limit bounds it, at about 4 seconds at most (BR-F14-01).
- **Budget:** p95 within NFR-1's 300 ms on the stress account (P3).

## 12. Cross-feature effects

- **F03:** shares the search expression, numeric rule and list order. See all uses its `q` filter.
- **F05:** `/subscriptions?open=<id>` opens that Subscription's dialog; an unknown id is ignored.
- **F06:** `/goals/<id>`. The Add Goal action follows F06's cap.
- **F14 (M7):** supplies Learn search and `/learn?q=`.
- **F02:** the theme actions. **P1:** the waiting-to-sync note and offline behavior.
- **Root 4:** the header search button.

## 13. Edge cases

- **`%`, `_` or `\` in the query:** matched literally (BR-F03-35).
- **A numeric query like `1,850`:** accepted with valid grouping and matches 1,850.00; `18,50` is not numeric and is searched as text.
- **A deleted row still in an open palette:** opening it shows F03's not-found handling.
- **Typing faster than answers arrive:** only the latest query's answer renders.
- **A demo-data account:** demo rows are searched like any other.
- **Search while the palette is closed by navigation:** the in-flight request is aborted.

## 14. Acceptance criteria

- **AC-F13-01** (integration) On golden, `GET /api/search?q=swiggy` returns #26, #25, #24 and #4 in that order, and no Subscriptions or Goals.
- **AC-F13-02** (integration) `q=649` returns #16 and #5, and Netflix. `q=vac` returns the Goal Vacation only.
- **AC-F13-03** (integration) `q=gr` gets 400. `q=64` (numeric, 2 characters) matches amounts only.
- **AC-F13-04** (integration) A scoped search returns up to 20 items with `more`. The first 5 Transactions for `q=swiggy` equal the first 5 rows of `/api/transactions?q=swiggy`.
- **AC-F13-05** (integration) Another user's rows never appear (RLS), checked with two users sharing a payee.
- **AC-F13-06** (client integration) Typing `t:` selects Transactions and clears the prefix. Backspace on empty returns to All. A slower first answer arriving after a newer one is discarded.
- **AC-F13-07** (E2E) Keyboard only: Ctrl+K, type "swig", Down, Enter opens the Transaction. `>add`, Enter opens the entry dialog.
- **AC-F13-08** (E2E) Offline: actions work, and the search groups show the offline message.
- **AC-F13-09** (accessibility) The palette passes axe with no serious or critical violations, follows the combobox pattern, and announces the result count.
- **AC-F13-10** (performance, M7) `/api/search?q=swi`, every scope, on the stress account meets the 300 ms p95 of `app;dur` (NFR-1, NFR-2; P3, BR-P3-09).

## 15. Illustrations

Illustrative, `GET /api/search?q=net`:

```json
{
  "q": "net",
  "scope": "all",
  "groups": [
    { "kind": "transaction", "items": [{ "id": "0192…", "payee": "Netflix", "category": "entertainment", "occurredOn": "2026-10-05", "signedAmountMinor": -64900 }], "more": false },
    { "kind": "subscription", "items": [{ "id": "0192…", "name": "Netflix", "cadence": "monthly", "amountMinor": 64900, "nextDueOn": "2026-11-05" }], "more": false },
    { "kind": "goal", "items": [], "more": false }
  ],
  "currency": "INR"
}
```

Illustrative, the palette:

```text
[ Search or type > for actions      net ]
( All ) ( Transactions ) ( Subscriptions ) ( Goals ) ( Actions )
Transactions
  Netflix · Entertainment · Mon, 5 Oct · −₹649.00
  Netflix · Entertainment · Sat, 5 Sep · −₹649.00
Subscriptions
  Netflix · Monthly · ₹649.00 · next 5 Nov
```
