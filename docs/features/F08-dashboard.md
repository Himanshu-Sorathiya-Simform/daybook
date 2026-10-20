# F08 Dashboard and layout

17 Oct 2026 · @Himanshu

The dashboard is the first screen after login. It shows one calendar month at a glance:

- spending against last month;
- net savings with the split between Goals and unallocated;
- Budgets, Subscriptions, investments and Goals;
- spending by category and twelve months of income against expenses;
- the month's insights, its most recent Transactions, and the latest Learn posts.

Every figure comes from the same server functions as the Transactions list, the Budgets page and the reports, so they always agree. Each widget can be shown or hidden and reordered, and the layout follows the account across devices. A brand-new account sees one onboarding panel in place of the finance widgets.

| Item       | Value                                                                                                                                                                                                                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Milestone  | M3 (dashboard, layout and its sync, settings page). Pending annotations, the persisted cache and offline reading arrive with P1 (M5). The insights widget arrives with F10 (M6) and Latest from Learn with F14 (M7); until then both are absent from the registry                                                                          |
| Plan       | Free and Premium; no widget is Premium. Drag-and-drop and resizing are Stretch (`dashboard.dragAndDrop`)                                                                                                                                                                                                                                   |
| Depends on | [F03](F03-transactions.md), [F04](F04-budgets.md), [F05](F05-subscriptions.md), [F06](F06-goals.md), [F07](F07-investments.md) for figures; [F02](F02-onboarding-profile-settings.md) (month, locale); [P4](../platform/P4-capabilities.md) (`<Gate>`); F09 (chart rules), F10 (insights), F14 (posts), F15 (Load demo data), P1 (offline) |
| Decisions  | D-25, D-40, D-54, D-55, D-63, D-108 to D-111, D-113, D-114, D-116, D-117, D-120, D-183, D-185, D-279 to D-283, D-293 to D-295, D-385                                                                                                                                                                                                       |

## 1. User stories

- As a user, I want to open the app and see this month's spending, savings and Budgets without clicking anywhere.
- As a user, I want to look at any past month the same way.
- As a user, I want every number to match the Transactions list and the reports, and to tap through to the Transactions behind it.
- As a user, I want to hide widgets I don't use and put the important ones first, on every device.
- As a new user, I want one clear next step instead of a page of empty charts.
- As a user offline, I want the last dashboard I saw, clearly marked with when it was current.

## 2. Scope

| In                                                                                                                                                                                                                                                                                          | Stretch (M8)                                                                           | Out                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The month picker; the widget registry (9 widgets at M3, 11 once F10 and F14 arrive); the dashboard data endpoint; server prefetch and hydration; pending annotations; drill-down; the onboarding panel; layout storage, validation and sync; the Settings → Dashboard page; offline reading | Drag-and-drop reordering and resizing on the dashboard (D-54, `dashboard.dragAndDrop`) | Date ranges or category filters on the dashboard (D-110); custom widgets; per-breakpoint layouts (D-54); saved layout presets; a widget marketplace (root 16); Premium-only widgets (Premium charts live on Analytics, F09) |

## 3. Concepts and fields

**Widget registry** (`shared/dashboard/widgets.ts`, D-109). One entry per widget.

- **Fields:** id, title, description (for settings), default size, default order, the queries it reads, an optional capability, whether it is a finance widget (hidden by the onboarding panel), and a lazy loader.
- **Shared with:** layout, lazy loading and gating all read this one definition.

| Order | Id               | Title                | Size | Finance | Reads                                    | From |
| ----- | ---------------- | -------------------- | ---- | ------- | ---------------------------------------- | ---- |
| 1     | `spending`       | Spending             | s    | Yes     | Dashboard data                           | M3   |
| 2     | `savings`        | Net savings          | s    | Yes     | Dashboard data                           | M3   |
| 3     | `budgets`        | Budgets              | m    | Yes     | Dashboard data (F04)                     | M3   |
| 4     | `insights`       | Insights             | m    | Yes     | F10 insights, top 5                      | M6   |
| 5     | `categories`     | Spending by category | m    | Yes     | Dashboard data                           | M3   |
| 6     | `incomeExpenses` | Income vs expenses   | m    | Yes     | Dashboard data                           | M3   |
| 7     | `goals`          | Goals                | s    | Yes     | Dashboard data (F06)                     | M3   |
| 8     | `subscriptions`  | Subscriptions        | s    | Yes     | Dashboard data (F05)                     | M3   |
| 9     | `investments`    | Investments          | m    | No      | Dashboard data (F07)                     | M3   |
| 10    | `recent`         | Recent Transactions  | m    | Yes     | Dashboard data (F03)                     | M3   |
| 11    | `learn`          | Latest from Learn    | l    | No      | F14 latest posts, prefetched by the page | M7   |

**Sizes and the grid**

| Size | Desktop (4 columns, from 1024 px) | Tablet (2 columns, 640 to 1023 px) | Phone (1 column) | Reserved height |
| ---- | --------------------------------- | ---------------------------------- | ---------------- | --------------- |
| `s`  | 1 column                          | 1 column                           | Full width       | 176 px          |
| `m`  | 2 columns                         | 2 columns                          | Full width       | 336 px          |
| `l`  | 4 columns                         | 2 columns                          | Full width       | 288 px          |

Widgets flow in layout order and wrap. Every widget reserves its height before its data or chunk loads, so nothing shifts (CLS, root 11.1).

**Layout** (private, one per user; D-54)

| Field           | Meaning                                                                                                                     | Rules                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `formatVersion` | Format of the stored document. It is separate from the row's `version` column (P2), which layout writes never check (OFF-8) | `1`                                                   |
| `widgets`       | Ordered `{ id, size, hidden }`                                                                                              | BR-F08-20                                             |
| `changedAt`     | When the user made this layout; a column beside the document                                                                | Client instant; decides which layout wins (BR-F08-22) |

## 4. Business rules

**The month**

- **BR-F08-01** `/dashboard?month=YYYY-MM` shows one calendar month (D-108, D-110). The default is the current month.
    - **The picker:** previous and next arrows, a month list, and "This month".
    - **Range:** from `earliestMonth` in the dashboard response to the current month. `earliestMonth` is the month of the earliest confirmed Transaction, or the current month when there is none. Future months are disabled.
    - **Invalid values:** an invalid or out-of-range `month` is dropped with the FIL-5 notice.
    - **The current month:** labelled "to date" (PER-3), for example "November 2026 · to date".
- **BR-F08-02** The dashboard has no other filter (D-110). Category and date-range filtering live on Transactions and Analytics.

**Data**

- **BR-F08-03** `GET /api/dashboard?month=` returns every figure the finance and investment widgets need, from one repeatable-read transaction (P2). It calls the owning features' shared functions:
    - F03's `rollup` for spending, income and To Goals in M and M − 1, the categories of M, the 12-month series, and the earliest `occurredOn` (`bounds`); F03's `listTransactions` for the recent rows;
    - F04's `budgetMonth`;
    - F05's `subscriptionSummary`;
    - F06's `goalProgress`, with each Goal's lock;
    - F07's `loadPortfolio`, then its pure `portfolioFigures` and `portfolioSeries`;
    - F15's `accountEmpty`.

    The dashboard, the Transactions list and the reports therefore cannot disagree (root success criterion 1, TST-2).

- **BR-F08-04** **Statement budget** (D-293). After the wrapper's setup, the handler runs at most 8 SQL statements:
    1. `rollup`: every Transaction figure and the earliest `occurredOn`, in one statement;
    2. `listTransactions`: the 8 recent rows;
    3. `budgetMonth`;
    4. `subscriptionSummary`: costs and the next renewal;
    5. `goalProgress`: Goals, progress and locks;
    6. and 7. `loadPortfolio`: the trades, then the prices they need;
    7. `accountEmpty`: one statement of `EXISTS` checks.

    Each of these functions is specified as one statement (two for `loadPortfolio`) by its owning spec. A test counts them (AC-F08-11). Shared functions take the open transaction and never open their own.

- **BR-F08-05** The page renders on the server, prefetches the dashboard data and layout through `readAsUser`, and hydrates TanStack Query (D-113). From M6 it also prefetches insights, and from M7 the 3 newest Learn posts, in their own Suspense boundary so the rest of the page never waits on Sanity (F14, BR-F14-11). The dashboard has no `<SanityLive />`, so the widget's posts update on the next load (D-385).
    - **The persisted cache (from M5):** a persisted copy that is newer than the server's wins until it refetches.
    - **Lazy loading:** widget code and charts load lazily on the client.
- **BR-F08-06** Only the category donut and the income-vs-expenses chart use ECharts, from the core chart chunk (F09, BR-F09-14). The investments sparkline, Budget bars and Goal bars are plain SVG or CSS. The dashboard's first-load JavaScript therefore stays within 200 KB (root 11.1).

**Widgets** (M is the dashboard month)

- **BR-F08-07** **Spending** shows Out for M (TXN-5) and the previous month's Out (PER-4), for example "+3,119.00 (+11.1%) vs September".
    - **No previous spending:** "—" when the previous month is 0.
    - **Words, not only arrows:** higher spending is labelled "more than September".
    - **Drill-down:** opens Transactions for M with `type=expense,refund`.
- **BR-F08-08** **Net savings** shows:
    - income, spending and net savings for M;
    - a split bar of To Goals and Unallocated (D-25), with negative values drawn below zero (TXN-7);
    - the savings rate, "—" without income.

    Selecting income opens Transactions with `type=income`; selecting To Goals opens it with `type=goal_contribution,goal_withdrawal`.

- **BR-F08-09** **Budgets** shows the overall figure and the 5 budgeted categories with the highest utilization in M, in F04's states and labels. "View all" opens `/budgets?month=M`. Without Budgets in M it reads "No Budgets for October 2026." with Add a Budget.
- **BR-F08-10** **Insights** (from M6) shows F10's top 5 insights for M (D-120), with "See all" to `/insights?month=M`.
- **BR-F08-11** **Spending by category** is a donut of M's category spending:
    - the top 6 categories, plus Other for the rest (D-116), in each category's fixed color (CAT-4);
    - the total in the center;
    - negative categories drawn at zero, with the footnote "Refunds exceeded spending" (D-185);
    - categories with zero spending left out.

    Selecting a slice opens Transactions for M with `cat=<c>`. Other opens it with every category it groups. View as table lists every category (D-117).

- **BR-F08-12** **Income vs expenses** is a grouped bar chart of income and spending for the 12 months ending at M, with negative spending drawn below zero. Selecting a bar opens that month's Transactions with the bar's types.
- **BR-F08-13** **Goals** shows up to 4 active Goals, oldest first, each with:
    - a progress bar and percent;
    - the required monthly amount (F06);
    - a lock badge, when locked.

    "View all" opens `/goals`. Goal progress is all-time, not limited to M.

- **BR-F08-14** **Subscriptions** shows:
    - the monthly and yearly cost;
    - the charges in M (Out for `src=subscription` in M);
    - the next renewal from today, from F05's `subscriptionSummary`: the earliest next due date across Subscriptions (F05, BR-F05-19), whatever their cadence. For example "Netflix · 5 Nov · 649.00", or "No upcoming renewals."

    "View all" opens `/subscriptions`.

- **BR-F08-15** **Investments** shows, for M:
    - the value at the end of M (today, for the current month);
    - the change in M without flows, and the time-weighted return (F07). A `null` return shows "—" with F07's tooltip "Not enough history in this range.";
    - a sparkline of M's daily values, through today;
    - the label "Simulated".

    The sparkline is an image with a text label: "Portfolio value from ₹1,000.00 on 1 Oct to ₹1,980.00 on 31 Oct; lowest ₹1,000.00, highest ₹2,200.00." The full series, with View as table, is on Investments. Selecting the widget opens `/investments?from=<first day of M>&to=<last day of M, or today>`, which shows the same figures (F07, BR-F07-15).

- **BR-F08-16** **Recent Transactions** lists M's 8 newest Transactions in list order (F03, BR-F03-29), with F03's row content.
    - **Pending creates (from M5):** pending creates in M come first, with their badge.
    - **Selecting:** a row opens `/transactions?txn=<id>`, and "View all" opens Transactions for M.
- **BR-F08-17** **Latest from Learn** (from M7) shows the 3 newest public posts, from the page's server prefetch (F14, BR-F14-11). It never fetches on the client. Offline it shows the posts in the cached dashboard document or the saved query cache, or hides itself when there are none.

**Pending changes (OFF-6, TXN-6; from M5)**

- **BR-F08-18** Figures stay confirmed-only.
    - **Spending and Net savings:** these widgets add annotations for pending Transactions in M, matched with F03's `matchesFilter`, for example "+300.00 pending".
    - **Budgets:** show F04's annotations.
    - **How long:** annotations stay until the affected queries refetch after sync.

**The onboarding panel (D-114, D-282)**

- **BR-F08-19** While the account is empty, one panel replaces every finance widget. Empty means F15's `accountEmpty` (BR-F15-01): no confirmed Transactions, Budgets, Subscriptions or Goals. From M5 the client also requires an empty write queue for those kinds. The portfolio does not count.
    - **Title and text:** "Welcome to Daybook" with "Add your first Transaction to see your month take shape."
    - **Actions:** Add Transaction (F03's dialog) and Load demo data (F15).
    - **The rest:** the Investments and Learn widgets still show below it.
    - **When it goes:** the first row of any of those kinds removes the panel. The widgets then show their own empty states, so a user who starts with a Budget sees it.

    The server reports emptiness as `accountEmpty` in the dashboard response.

**Layout (D-54, D-183, D-279)**

- **BR-F08-20** A layout is valid after normalization:
    - unknown ids are dropped, and duplicates keep their first entry;
    - registry widgets missing from it are appended in registry order, visible;
    - every size is set to the registry default (resizing is Stretch);
    - when no widget is visible, the first one is made visible;
    - a layout with an unknown `formatVersion` is replaced by the default.

    The server normalizes on every read and write, and the client again on load, since a deploy can add or remove widgets.

- **BR-F08-21** The default layout is the registry order, all visible. "Reset to default" restores it after the confirmation "Reset your dashboard to the default layout?".
- **BR-F08-22** The layout is stored per account (D-55), with a local copy, and it is not a write-queue item (OFF-8). It works the same way from M3 on.
    - **The local copy:** local storage `daybook.layout` holds `{ userId, layout, changedAt, synced }`. Each change applies on screen at once and is written there with `synced: false`. A copy whose `userId` is not the signed-in user's is deleted unread.
    - **Rendering:** the server renders its stored layout.
        - **An unsynced local copy:** after hydration, it replaces the server's layout on screen and is sent. The reorder this causes happens only in that rare case.
        - **A synced local copy:** never overrides the server's. It is used only when a page has no server data (offline, from M5).
    - **Tabs:** every tab re-reads `daybook.layout` on the `storage` event and before applying an edit, so one tab never overwrites another tab's newer change.
    - **Saving:** `PUT /api/layout` one second after the last change, with a new `Idempotency-Key` for each send. While `synced` is false it is sent again on page load, on the `online` event, and when the tab becomes visible.
    - **The response:** applies only if the local copy's `changedAt` still equals the one sent.
        - **It still does:** a 200 sets `synced` to true and takes the response's layout. With `applied: false`, that is the newer stored one.
        - **It has changed:** the user changed the layout while the request was in flight. The response is ignored, and the newer copy is sent.
    - **Which one wins:** the server writes with an upsert that overwrites only an older layout: `INSERT ... ON CONFLICT (user_id) DO UPDATE SET ... WHERE layout.changed_at <= EXCLUDED.changed_at`.
        - **No row written:** the server answers with the stored layout and `applied: false`, and the client takes it.
        - **A tie:** goes to the later arrival.
        - **Two concurrent `PUT`s:** leave the later `changedAt`, and a device offline for days cannot overwrite a newer layout from another device.
    - **The clock:** a `changedAt` later than `ctx.now` is stored as `ctx.now`, so a device with a fast clock cannot win forever.
    - **Failures:**
        - **Network errors, 408, 429 and 5xx:** keep `synced` false and retry on the triggers above, with no message.
        - **401 and 403:** keep `synced` false and stop sending until the next page load.
        - **A 422:** is a bug. It is reported to Sentry. The client reads `GET /api/layout`, replaces the local copy with it, and shows the toast "Your dashboard layout couldn't be saved."
- **BR-F08-23** A `PUT` body, `{ layout: { formatVersion, widgets }, changedAt }`, is checked against its Zod shape first, and a body that fails gets 422 `validation_failed`:
    - `layout.formatVersion`: an integer;
    - `layout.widgets`: 1 to 50 entries of `{ id: a string of at most 64 characters, size: s, m or l, hidden: boolean }`;
    - `changedAt`: an ISO 8601 instant.

    Everything else is normalized (BR-F08-20), never refused: unknown ids, duplicates, missing widgets, sizes, an unknown `formatVersion`, and every widget hidden.

- **BR-F08-24** At least one widget must stay visible. Hiding the last visible one is refused, with "Keep at least one widget on your dashboard."

**Settings → Dashboard**

- **BR-F08-25** `/settings/dashboard` lists every registry widget in layout order. Each row has the title, the description, a Show switch, and Move up and Move down buttons, disabled at the ends. Below the list is Reset to default.
    - **Keyboard:** with a row focused, Alt+Up and Alt+Down move it too.
    - **Announcements:** every move is announced with its position among the registry's widgets: "Budgets moved to position 2 of 9." at M3.
    - **Offline:** the page works, and changes sync when the connection returns (BR-F08-22).

**Stretch: drag-and-drop**

- **BR-F08-26** With `dashboard.dragAndDrop` on, the dashboard gains Edit layout.
    - **Controls:** drag handles and size controls (`s`, `m`, `l`).
    - **State:** the editing state lives in the Zustand `ui` store (root 7.4).
    - **Keyboard:** the settings list remains the keyboard path.

## 5. Calculations

Every figure uses the owning feature's formula. Golden October, at the frozen clock ([03-golden-dataset.md](../03-golden-dataset.md)):

| Widget               | Figures                                                                                                                                                     |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spending             | 31,168.00; September 28,049.00; +3,119.00 (+11.1%)                                                                                                          |
| Net savings          | Income 85,000.00, spending 31,168.00, net 53,832.00; To Goals 7,000.00, unallocated 46,832.00; savings rate 63.3%                                           |
| Budgets              | Overall 13,168.00 of 11,000.00, 119.7%, Over budget. Top 5: entertainment 214.8%, food 124.4%, shopping 100.0%, transportation 90.0% (4 budgeted)           |
| Spending by category | housing 18,000.00, food 6,220.00, shopping 3,000.00, entertainment 2,148.00, transportation 1,800.00; total 31,168.00 (5 categories, so no Other)           |
| Income vs expenses   | 12 months ending October: September 97,000.00 and 28,049.00; October 85,000.00 and 31,168.00; every other month 0.00 and 0.00                               |
| Goals                | Emergency fund 10,000.00 of 100,000.00 (10.0%); Vacation 5,000.00 of 30,000.00 (16.7%), 6,250.00 a month                                                    |
| Subscriptions        | 20,273.92 a month, 243,287.00 a year; charges in October 20,148.00; next renewal Netflix, 5 Nov, 649.00                                                     |
| Investments          | With the golden fixture: value 1,980.00, change −120.00, return −1.0%. Sparkline: 1,000.00 from 1 to 14 Oct, 2,200.00 from 15 to 30 Oct, 1,980.00 on 31 Oct |
| Recent Transactions  | #25, #24, #23, #22, #21, #20, #19, #18                                                                                                                      |
| Picker               | `earliestMonth` 2026-09; `accountEmpty` false                                                                                                               |

**November (to date):**

- **Spending:** 18,420.00 with "+300.00 pending" (P1, from M5), against October's 31,168.00: −12,748.00 (−40.9%).
- **Net savings:** −18,420.00; the savings rate is "—".
- **Investments:** value 1,980.00, change 0.00; the fixture has no November prices.

**Agreement (TST-2):** October's spending, income and To Goals equal golden list check A and the October report summary.

## 6. Screens and states

**`/dashboard?month=YYYY-MM`.** The month picker, then the widgets in layout order. **`/settings/dashboard`.** BR-F08-25.

| State            | What the user sees                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading          | The server-rendered page arrives with its figures. Each widget's reserved skeleton (section 3) shows while a client-side month change loads   |
| Empty            | The onboarding panel (BR-F08-19). Single empty widgets show one line each, for example "No Budgets for October 2026."                         |
| Error            | Failing widgets show "This could not be loaded." with Retry; the others render                                                                |
| Offline (M5)     | The current and last viewed months from cache with "as of" (root 7.3); other months: "You're offline. This month isn't saved on this device." |
| Pending (M5)     | Annotations (BR-F08-18); pending creates at the top of Recent Transactions                                                                    |
| Locked (Premium) | No core widget is gated. A future gated widget renders through `<Gate>` with the locked card (P4)                                             |
| Read-only        | n/a                                                                                                                                           |

## 7. Flows

**7.1 Open the dashboard**

1. The proxy passes, and the page reads the session, profile, layout and dashboard data in `readAsUser` (from M6, insights too).
2. The HTML holds the text figures, which are the LCP.
3. Chart chunks load lazily into reserved space.
4. From M5, a persisted newer copy, if any, shows until refetch (D-113).

**7.2 Look at last month.** Selecting the previous arrow updates `month` in the URL. The data is fetched, or served from cache when present, and the picker announces "October 2026".

**7.3 Drill down.** Selecting the October food slice opens `/transactions?from=2026-10-01&to=2026-10-31&cat=food`, with Out 6,220.00 (golden check B).

**7.4 Rearrange**

1. In Settings → Dashboard, the user moves Budgets up and hides Investments.
2. The dashboard reflects the change at once, and `PUT /api/layout` saves it after one second.
3. Another device gets the layout on its next `/api/layout` read.

**7.5 Two devices change the layout offline**

1. Both are offline. The phone changes the layout at 09:00 and the laptop at 10:00.
2. Whichever syncs first is stored.
3. If the 09:00 layout arrives second, it gets `applied: false`, and the phone takes the 10:00 layout.

**7.6 Close the tab during the debounce.** The user hides a widget and closes the tab within one second. The local copy holds it with `synced: false`. The next load shows it and sends it, and the server keeps it unless a newer layout exists.

**7.7 First visit**

1. A new user sees the onboarding panel, with Investments below it (and Learn, from M7).
2. They load demo data (F15) or add a Transaction.
3. The panel gives way to the widgets.

## 8. Validation and messages

| Situation                 | Message shown                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| Invalid `month`           | Some filters in this link weren't valid and were removed.                                            |
| Hiding the last widget    | Keep at least one widget on your dashboard.                                                          |
| Reset                     | Reset your dashboard to the default layout?                                                          |
| Layout save refused (422) | Your dashboard layout couldn't be saved.                                                             |
| Widget failure            | This could not be loaded.                                                                            |
| Offline month not cached  | You're offline. This month isn't saved on this device.                                               |
| Onboarding panel          | Welcome to Daybook. Add your first Transaction to see your month take shape.                         |
| No renewals               | No upcoming renewals.                                                                                |
| Month announcement        | October 2026                                                                                         |
| Move announcement         | Budgets moved to position 2 of 9. (the count is the registry's)                                      |
| Sparkline label           | Portfolio value from ₹1,000.00 on 1 Oct to ₹1,980.00 on 31 Oct; lowest ₹1,000.00, highest ₹2,200.00. |

## 9. Plan gating

None in the core. The registry's optional `capability` renders a widget through `<Gate>` (P4). The Stretch editing mode checks `dashboard.dragAndDrop`.

## 10. Offline behavior

- **Readable (from M5):** the dashboard data and insights for the current and last viewed months (root 7.3), with "as of".
- **The layout (from M3):** readable from the local copy, and writable. Changes stay on the device until they sync, and the server keeps the later `changedAt` (BR-F08-22).
- **Transactions added offline (from M5):** they show as annotations and in Recent Transactions, never in figures.

## 11. Server surface

| Endpoint         | Method | Input                   | Output                                                                          | Errors                            | Idempotency and versioning                                                                              |
| ---------------- | ------ | ----------------------- | ------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/api/dashboard` | GET    | `month`                 | Section 15                                                                      | 400, 401, 403 `profile_required`  | Read                                                                                                    |
| `/api/layout`    | GET    | none                    | `{ layout, changedAt }`, the default with `changedAt: null` when none is stored | 401, 403                          | Read                                                                                                    |
| `/api/layout`    | PUT    | `{ layout, changedAt }` | 200 `{ layout, changedAt, applied }`                                            | 401, 403, 422 `validation_failed` | `Idempotency-Key` required; no `If-Match` (OFF-8). A `changedAt` after `ctx.now` is stored as `ctx.now` |

## 12. Cross-feature effects

- **Invalidated by:** every confirmed finance write in F03 to F06 invalidates the whole `dashboard` query prefix, every month (D-295). Comparisons, the 12-month chart and all-time Goal figures read months other than the one written. Also F15 load and removal. The insights widget reads the `insights` query, which F10's Dismiss and Restore invalidate (F10, section 11).
- **F07:** prices change the investment figures daily. The dashboard query goes stale once the UTC date passes its `asOfPriceDate` (F07, BR-F07-18).
- **F09:** reuses the donut and income-vs-expenses components and their View as table.
- **F11:** the report's summary equals the dashboard's figures for the same month.
- **P3:** measures LCP, CLS, first-load JavaScript and server time on this route.

## 13. Edge cases

- **A month with income but no spending:** the donut shows "No spending in October 2026." and the savings rate is 100.0%.
- **Every category negative after refunds:** the donut shows the footnote with an empty ring; the table shows the negatives.
- **A Goal locked after a lapse:** the Goals widget shows the lock badge.
- **A user with a Budget and no Transactions:** no onboarding panel; the Budgets widget shows the Budget, and the others show their empty lines.
- **Only yearly Subscriptions:** the next renewal can be months away, and the widget still shows it.
- **Insights before M6, or Learn before M7:** the widget is absent from the registry, so normalization adds it when it arrives.
- **A registry widget removed in a deploy:** dropped from stored layouts on their next read. If it was the only visible one, the first widget becomes visible.
- **Logging out with an unsynced layout:** the local copy is wiped with the other local data (root 5.3), so the change is lost.
- **The persisted cache from another user:** wiped by STATE-3 before render.
- **A browser zoomed to 200% at 360 px:** one column; reserved heights still prevent layout shift.

## 14. Acceptance criteria

- **AC-F08-01** (integration) `GET /api/dashboard?month=2026-10` on golden returns every figure in section 5.
- **AC-F08-02** (integration) For October, the dashboard's spending, income and To Goals equal list check A's header (TST-2). From M6, they also equal the October report summary (F11).
- **AC-F08-03** (client integration, M5) With P1 queued, November spending shows 18,420.00 with "+300.00 pending", and P1 leads Recent Transactions with its badge.
- **AC-F08-04** (unit) Normalization:
    - an unknown id is dropped;
    - a missing widget is appended, visible;
    - a duplicate keeps its first entry;
    - a wrong size is reset;
    - every widget hidden makes the first visible;
    - `formatVersion: 2` gives the default.
- **AC-F08-05** (integration) Layout last-write-wins:
    - two `PUT /api/layout` with `changedAt` 09:00 and 10:00, arriving in either order, leave the 10:00 layout;
    - the late 09:00 request returns `applied: false`;
    - two concurrent `PUT`s leave the later `changedAt`;
    - a `changedAt` an hour ahead of `ctx.now` is stored as `ctx.now`.
- **AC-F08-06** (E2E) A new user sees the onboarding panel. After adding a Transaction the panel is gone and the finance widgets show.
- **AC-F08-07** (E2E) Selecting the October food slice opens a Transactions list whose header Out is 6,220.00.
- **AC-F08-08** (E2E, M5) Offline, a reload shows the cached current month with "as of". An uncached month shows the offline message.
- **AC-F08-09** (performance, M7) On the stress account after a warm-up: LCP at most 2.5 s, CLS at most 0.1, first-load JavaScript at most 200 KB compressed, and `/api/dashboard` server time p95 under 300 ms measured as root NFR-2 sets out (root 11.1).
- **AC-F08-10** (accessibility) The dashboard and Settings → Dashboard pass axe with no serious or critical violations. Each chart has View as table, and the sparkline has its text label. Reordering works with the keyboard and is announced.
- **AC-F08-11** (integration) `GET /api/dashboard?month=2026-10` on golden runs at most 8 SQL statements after the wrapper's setup, counted by a query logger (BR-F08-04).
- **AC-F08-12** (client integration) Local copy sync:
    - a local layout with `synced: false` and a newer `changedAt` than the server's is sent after hydration and is not replaced by the server's layout;
    - a change made while a `PUT` is in flight survives its response and is sent next;
    - a copy with another user's `userId` is discarded;
    - a change in one tab reaches another tab through the `storage` event.
- **AC-F08-13** (integration) A user whose only row is one Budget gets `accountEmpty: false`, and the dashboard shows the widgets, not the panel.

## 15. Illustrations

Illustrative, `GET /api/dashboard?month=2026-10` on golden (shortened):

```json
{
	"month": "2026-10",
	"partial": false,
	"earliestMonth": "2026-09",
	"accountEmpty": false,
	"currency": "INR",
	"spending": {
		"outMinor": 3116800,
		"previousOutMinor": 2804900,
		"deltaMinor": 311900,
		"deltaTenths": 111
	},
	"savings": {
		"incomeMinor": 8500000,
		"outMinor": 3116800,
		"netMinor": 5383200,
		"toGoalsMinor": 700000,
		"unallocatedMinor": 4683200,
		"rateTenths": 633
	},
	"budgets": {
		"overall": {
			"limitMinor": 1100000,
			"spentMinor": 1316800,
			"utilizationTenths": 1197,
			"state": "over"
		},
		"top": []
	},
	"categories": [
		{ "category": "housing", "outMinor": 1800000 },
		{ "category": "food", "outMinor": 622000 }
	],
	"incomeExpenses": [
		{ "month": "2026-10", "incomeMinor": 8500000, "outMinor": 3116800 }
	],
	"goals": [
		{
			"id": "0192…",
			"name": "Vacation",
			"progressMinor": 500000,
			"targetMinor": 3000000,
			"percentTenths": 167,
			"requiredMonthlyMinor": 625000,
			"requiredStatus": "monthly",
			"locked": false
		}
	],
	"subscriptions": {
		"monthlyMinor": 2027392,
		"yearlyMinor": 24328700,
		"chargesInMonthMinor": 2014800,
		"nextRenewal": {
			"name": "Netflix",
			"dueOn": "2026-11-05",
			"amountMinor": 64900
		}
	},
	"investments": {
		"valueMinor": 198000,
		"changeMinor": -12000,
		"twrTenths": -10,
		"asOfPriceDate": "2026-10-31",
		"series": [{ "date": "2026-10-01", "valueMinor": 100000 }]
	},
	"recent": []
}
```

Illustrative, the desktop grid:

```text
| Spending   | Net savings | Budgets (top 5)                |
| Insights                 | Spending by category           |
| Income vs expenses       | Goals       | Subscriptions    |
| Investments              | Recent Transactions            |
| Latest from Learn                                          |
```
