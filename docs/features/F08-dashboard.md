# F08 Dashboard and layout

17 Oct 2026 · @Himanshu

The dashboard is the first screen after login. It shows one calendar month at a glance:

- a month summary: spending against last month, day by day, with net savings, the split between Goals and unallocated, and the state of the Budgets;
- widgets for Recent Transactions, Budgets, spending by category, twelve months of income against expenses, Goals, the next renewals, investments and a Premium heat map;
- the month's insights and the latest Learn posts, once F10 and F14 arrive.

Every figure comes from the same server functions as the Transactions list, the Budgets page and the reports, so they always agree. The user arranges the widgets in saved views: show or hide, reorder and resize, and the views follow the account across devices. A brand-new account sees one onboarding panel in place of the summary and the finance widgets.

| Item       | Value                                                                                                                                                                                                                                                                                                                                                                                |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Milestone  | M3 (dashboard, saved views and their sync). Pending annotations, the persisted cache and offline reading arrive with P1 (M5). The insights widget arrives with F10 (M6) and Latest from Learn with F14 (M7); until then both are absent from the registry                                                                                                                            |
| Plan       | Free and Premium. One widget is Premium: the calendar heat map (`analytics.heatmap.view`). Drag-and-drop is Stretch (`dashboard.dragAndDrop`)                                                                                                                                                                                                                                        |
| Depends on | [F03](F03-transactions.md), [F04](F04-budgets.md), [F05](F05-subscriptions.md), [F06](F06-goals.md), [F07](F07-investments.md) for figures; [F02](F02-onboarding-profile-settings.md) (month, locale, week start); [P4](../platform/P4-capabilities.md) (`<Gate>`); F09 (chart rules, the heat map), F10 (insights), F14 (posts), F15 (Load demo data, `accountEmpty`), P1 (offline) |
| Decisions  | D-25, D-40, D-54, D-55, D-63, D-108 to D-111, D-113, D-114, D-116, D-117, D-120, D-183, D-185, D-279 to D-283, D-293 to D-295, D-385, D-632 to D-640                                                                                                                                                                                                                                 |

## 1. User stories

- As a user, I want to open the app and see this month's spending, savings and Budgets without clicking anywhere.
- As a user, I want to look at any past month the same way.
- As a user, I want to see which days I spent on, and whether this month is running ahead of last month.
- As a user, I want every number to match the Transactions list and the reports, and to tap through to the Transactions behind it.
- As a user, I want to see what is about to renew.
- As a user, I want to hide widgets I don't use, put the important ones first and make some of them bigger, and to keep a few arrangements to switch between.
- As a new user, I want one clear next step instead of a page of empty charts.
- As a user offline, I want the last dashboard I saw, clearly marked with when it was current.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Stretch (M8)                                                               | Out                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The month picker and its month menu; the month summary with the day strip, the day popover and the Pace view; the widget registry (8 widgets at M3, 10 once F10 and F14 arrive); the dashboard data endpoint; server prefetch and hydration; pending annotations; drill-down; the onboarding panel; saved views (Overview plus up to 5 of the user's own, with Rename and Delete), Customize mode (move, size, hide, add back, reset); view storage, validation and sync; offline reading | Drag-and-drop reordering in Customize mode (D-54, `dashboard.dragAndDrop`) | Date ranges or category filters on the dashboard (D-110); custom widgets; per-breakpoint layouts (D-54); a widget marketplace (root 16); a separate settings page for the layout (D-638); Premium charts other than the heat map (they live on Analytics, F09) |

## 3. Concepts and fields

**Widget registry** (`shared/dashboard/widgets.ts`, D-109). One entry per widget.

- **Fields:** id, title, default size, default order, reserved height, the queries it reads, an optional capability, whether it is a finance widget (hidden by the onboarding panel), and a lazy loader.
- **Shared with:** views, lazy loading and gating all read this one definition.

| Order | Id               | Title                | Size | Height | Finance | Reads                                    | From |
| ----- | ---------------- | -------------------- | ---- | ------ | ------- | ---------------------------------------- | ---- |
| 1     | `recent`         | Recent Transactions  | 3    | 580 px | Yes     | Dashboard data (F03)                     | M3   |
| 2     | `budgets`        | Budgets              | 3    | 580 px | Yes     | Dashboard data (F04)                     | M3   |
| 3     | `categories`     | Spending by category | 3    | 380 px | Yes     | Dashboard data                           | M3   |
| 4     | `incomeExpenses` | Income vs expenses   | 3    | 380 px | Yes     | Dashboard data                           | M3   |
| 5     | `goals`          | Goals                | 2    | 330 px | Yes     | Dashboard data (F06)                     | M3   |
| 6     | `upcoming`       | Coming up            | 2    | 330 px | Yes     | Dashboard data (F05)                     | M3   |
| 7     | `investments`    | Investments          | 2    | 300 px | No      | Dashboard data (F07)                     | M3   |
| 8     | `insights`       | Insights             | 6    | 210 px | Yes     | F10 insights, top 5                      | M6   |
| 9     | `heatmap`        | Calendar heat map    | 3    | 360 px | Yes     | F09 heat map, Premium                    | M3   |
| 10    | `learn`          | Latest from Learn    | 6    | 288 px | No      | F14 latest posts, prefetched by the page | M7   |

The month summary is not a widget (D-632). It is always shown above the widgets, in every view.

**Sizes and the grid** (D-635)

- **Sizes:** a widget's size is the number of columns it spans of 6: `2` (a third), `3` (a half), `4` (two thirds) or `6` (full width). The size belongs to the widget and is stored with the view.
- **Wide:** from a grid width of 640 px, six columns. Below it, one column and every widget is full width. The width is the grid's own, measured, so a docked sidebar counts (D-626). The server draws six columns when the `daybook_wide` cookie says wide (768 px and up) and one column otherwise, and the browser corrects it once after measuring (D-629).
- **Rows:** widgets flow in view order. A widget joins the current row while the sizes add up to at most 6, otherwise it starts the next row. A row is as tall as its tallest widget's reserved height.
- **The last widget of a row** stretches to fill the row on screen. The stretch is never stored.
- **Heights:** every widget reserves its height before its data or chunk loads, so nothing shifts (CLS, root 11.1).

**Views** (private, per user; D-635, D-636)

| Field           | Meaning                                                                                                                          | Rules                                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `id`            | The view's id, made by the client                                                                                                | UUIDv7 (ID-1). `overview` is reserved for the built-in view        |
| `name`          | What the view pills show                                                                                                         | 1 to 40 characters after trimming; not unique                      |
| `widgets`       | Ordered `{ id, size, hidden }`                                                                                                   | BR-F08-20                                                          |
| `changedAt`     | When the user made this change to the view; a column beside the document                                                         | Client instant; decides which write wins (BR-F08-22)               |
| `deleted`       | A deleted view stays as a marker, so a device that was offline cannot bring it back                                              | Only in writes and in storage; a read never returns a deleted view |
| `formatVersion` | Format of the stored widget document. It is separate from the row's `version` column (P2), which view writes never check (OFF-8) | `1`                                                                |

- **Overview** is defined in code, never stored: the registry's widgets in registry order, at their default sizes, all visible. It cannot be changed, renamed or deleted. Customize on Overview makes a copy (BR-F08-25).
- **Own views:** at most 5 live views per user.
- **The last view used** is a device choice, not an account one: the cookie `daybook_view_dashboard` holds a view id (BR-F08-27, D-637).

## 4. Business rules

**The month**

- **BR-F08-01** `/dashboard?month=YYYY-MM` shows one calendar month (D-108, D-110). The default is the current month.
    - **The picker:** previous and next arrows around the month's name, which opens the month menu (BR-F08-32), and "This month".
    - **Range:** from `earliestMonth` in the dashboard response to the current month. `earliestMonth` is the month of the earliest confirmed Transaction, or the current month when there is none. Future months are disabled.
    - **Invalid values:** an invalid or out-of-range `month` is dropped with the FIL-5 notice. `GET /api/dashboard` answers 400 `validation_failed` for a `month` that is not `YYYY-MM`, is after the current month or is before 2000-01; a month before `earliestMonth` answers normally, with zero figures.
    - **The current month:** labelled "to date" (PER-3), for example "November 2026 · to date".
- **BR-F08-02** The dashboard has no other filter (D-110). Category and date-range filtering live on Transactions and Analytics.

**Data**

- **BR-F08-03** `GET /api/dashboard?month=` returns every figure the summary and the widgets need, from one repeatable-read transaction (P2). It calls the owning features' shared functions:
    - F03's `rollup` for spending, income and To Goals in M and M − 1, the categories of M, the days of M and M − 1, the months series, and the earliest `occurredOn` (`bounds`); F03's `listTransactions` for the recent rows;
    - F04's `budgetMonth`;
    - F05's `subscriptionSummary`;
    - F06's `goalProgress`, with each Goal's lock;
    - F07's `loadPortfolio`, then its pure `portfolioFigures` and `portfolioSeries`;
    - F15's `accountEmpty`.

    What the response holds, beyond those functions' figures:

    - **The series:** `incomeExpenses` is the 12 months ending at M, with 0 for a month without rows; `months` is each month's Out from `earliestMonth` to the current month, for the month menu. Both come from one monthly grouping of `rollup`.
    - **Budgets and renewals:** `budgets` carries F04's overall figure, its top 5, the state counts, how many Budgets the month has (`count`) and the unbudgeted categories with spending; `recent` holds the 8 rows and their days' totals (`items` and `groups`); `subscriptions` carries F05's costs and its next 4 renewals.

    The dashboard, the Transactions list and the reports therefore cannot disagree (root success criterion 1, TST-2). Until F06 and F07 are built, `goals` is `[]`, `investments` is `null` and `accountEmpty` leaves Goals out; they add their statements to BR-F08-04's budget when they arrive (D-640).

- **BR-F08-04** **Statement budget** (D-293). After the wrapper's setup, the handler runs at most 8 SQL statements:
    1. `rollup`: every Transaction figure, the daily and monthly series and the earliest `occurredOn`, in one statement;
    2. `listTransactions`: the 8 recent rows;
    3. `budgetMonth`;
    4. `subscriptionSummary`: costs and the next renewals;
    5. `goalProgress`: Goals, progress and locks;
    6. `loadPortfolio`: the trades;
    7. `loadPortfolio`: the prices they need;
    8. `accountEmpty`: one statement of `EXISTS` checks.

    Each of these functions is specified as one statement (two for `loadPortfolio`) by its owning spec. A test counts them (AC-F08-11). Shared functions take the open transaction and never open their own.

- **BR-F08-05** The page renders on the server, prefetches the dashboard data and the views through `readAsUser`, and hydrates TanStack Query (D-113). From M6 it also prefetches insights, and from M7 the 3 newest Learn posts, in their own Suspense boundary so the rest of the page never waits on Sanity (F14, BR-F14-11). The dashboard has no `<SanityLive />`, so the widget's posts update on the next load (D-385).
    - **The persisted cache (from M5):** a persisted copy that is newer than the server's wins until it refetches.
    - **Lazy loading:** widget code and charts load lazily on the client.
- **BR-F08-06** Only the income-vs-expenses chart and the Pace line use ECharts, from the core chart chunk (F09, BR-F09-14). The day strip, the category bars, the investments sparkline and the Budget bars are plain HTML, SVG or CSS. The heat map uses F09's heat-map chunk, loaded only when the Premium gate is open. The dashboard's first-load JavaScript therefore stays within 200 KB (root 11.1).

**The month summary** (M is the dashboard month; D-632)

- **BR-F08-07** The left half shows **Spent in** M (TXN-5) as a large figure, and below it the comparison with the previous month (PER-4), for example "₹3,119.00 more than September (+11.1%)", or "less than October (−40.9%)".
    - **No previous spending:** the comparison line is "—" when the previous month's Out is 0.
    - **Words, not only arrows:** the line says "more than" or "less than".
    - **The strip:** a Daily or Pace view, chosen with a segmented control (BR-F08-29). Daily is the default.
    - **Pending (from M5):** "+300.00 pending" beside the figure (BR-F08-18).
- **BR-F08-08** The right half shows:
    - **Three figures:** Income, Net savings and Savings rate for M, each with a note comparing it with the previous month, computed on the server: "₹12,000.00 less than September" (income), "₹15,119.00 less than September" (net savings), "7.8 points lower" (rate). A note is left out when the previous month has nothing to compare: without income in the previous month the income and rate notes are left out. Without income in M the notes read "No income yet" for income and rate and "Below zero" for a negative net.
    - **Where net savings went:** a split bar of To Goals and Unallocated (D-25), with negative values drawn below zero (TXN-7), and the savings rate, "—" without income.
    - **The Budgets line:** "Budgets this month" with the state counts of F04's month view, for example "2 over, 1 at limit, 1 near limit", or "All 4 within limit" when none is over, at limit or near, or "No Budgets" without any.

    Selecting Income opens Transactions with `type=income`; selecting To Goals opens it with `type=goal_contribution,goal_withdrawal`; selecting the Spent figure opens it for M with `type=expense,refund`.

**Widgets**

- **BR-F08-09** **Budgets** shows the 5 budgeted categories with the highest utilization in M, in F04's states and labels (with pending annotations from M5), then:
    - **Total budgeted:** "13,168.00 of 11,000.00" with "Over by 2,168.00" in the over color, or the amount left;
    - **Not budgeted:** the categories with spending and no Budget, largest first, for example "Not budgeted: Housing ₹18,000.00", showing the 2 largest and "and N more" for the rest, with "Add a Budget".

    "View all" opens `/budgets?month=M`; selecting a bar opens Transactions for M with `cat=<c>`. Without Budgets in M it reads "No Budgets for October 2026." with Add a Budget.

- **BR-F08-10** **Insights** (from M6) shows F10's top 5 insights for M (D-120), with "See all" to `/insights?month=M`, and the "Simulated" badge where F10 says so.
- **BR-F08-11** **Spending by category** is a list of horizontal bars of M's category spending, with each category's amount:
    - the top 6 categories, plus Other for the rest (D-116), in each category's fixed color (CAT-4);
    - negative categories drawn at zero, with the footnote "Refunds exceeded spending" (D-185);
    - categories with zero spending left out.

    Selecting a bar opens Transactions for M with `cat=<c>`. Other opens it with every category it groups. View as table lists every category (D-117).

- **BR-F08-12** **Income vs expenses** is a grouped bar chart of income and spending for the 12 months ending at M, with negative spending drawn below zero. Selecting a bar opens that month's Transactions with the bar's types. View as table lists the 12 months.
- **BR-F08-13** **Goals** shows up to 4 active Goals, oldest first, each with:
    - a progress bar and percent;
    - the required monthly amount (F06), for example "₹6,250.00 a month to make March";
    - a lock badge, when locked.

    "View all" opens `/goals`. Goal progress is all-time, not limited to M.

- **BR-F08-14** **Coming up** (D-633) shows the next 4 renewals from today: the Subscriptions with the earliest next due dates (F05, BR-F05-19), one entry for each Subscription whatever its cadence, ties by name then id. Each entry shows the name, the date and the amount, for example "Netflix · 5 Nov · 649.00", and below them "₹20,273.92 a month across 4 Subscriptions", the monthly cost F05 counts (BR-F05-17). Without a renewal it reads "No upcoming renewals."

    The action "Subscriptions" opens `/subscriptions`.

- **BR-F08-15** **Investments** shows, for M:
    - the value at the end of M (today, for the current month);
    - the change in M without flows, and the time-weighted return (F07). A `null` return shows "—" with F07's tooltip "Not enough history in this range.";
    - a sparkline of M's daily values, through today;
    - the label "Simulated".

    The sparkline is an image with a text label: "Portfolio value from ₹1,000.00 on 1 Oct to ₹1,980.00 on 31 Oct; lowest ₹1,000.00, highest ₹2,200.00." The full series, with View as table, is on Investments. Selecting the widget opens `/investments?from=<first day of M>&to=<last day of M, or today>`, which shows the same figures (F07, BR-F07-15).

- **BR-F08-16** **Recent Transactions** lists M's 8 newest Transactions in list order (F03, BR-F03-29), grouped by day with F03's group totals and row content.
    - **Pending creates (from M5):** pending creates in M come first, in a "Waiting to sync" group, with their badge.
    - **Selecting:** a row opens `/transactions?txn=<id>`, and "View all" opens Transactions for M.
- **BR-F08-17** **Latest from Learn** (from M7) shows the 3 newest public posts, from the page's server prefetch (F14, BR-F14-11). It never fetches on the client. Offline it shows the posts in the cached dashboard document or the saved query cache, or hides itself when there are none.

**Pending changes (OFF-6, TXN-6; from M5)**

- **BR-F08-18** Figures stay confirmed-only.
    - **The summary:** it adds annotations for pending Transactions in M, matched with F03's `matchesFilter`, for example "+300.00 pending". The day strip draws a day's pending spending as an outlined bar on top of the confirmed one, never filled, and the category bars and Budgets show F04's annotations. The server sends none of it (D-639).
    - **Budgets:** show F04's annotations.
    - **How long:** annotations stay until the affected queries refetch after sync.

**The onboarding panel (D-114, D-282)**

- **BR-F08-19** While the account is empty, one panel replaces the month summary, the view pills and every finance widget. Empty means F15's `accountEmpty` (BR-F15-01): no confirmed Transactions, Budgets, Subscriptions or Goals (Goals count once F06 is built). From M5 the client also requires an empty write queue for those kinds. The portfolio does not count.
    - **Title and text:** "Welcome to Daybook" with "Add your first Transaction to see your month take shape."
    - **Actions:** Add Transaction (F03's dialog) and Load demo data (F15).
    - **The rest:** the Investments and Learn widgets still show below it.
    - **When it goes:** the first row of any of those kinds removes the panel. The widgets then show their own empty states, so a user who starts with a Budget sees it.

    The server reports emptiness as `accountEmpty` in the dashboard response.

**Views (D-54, D-183, D-279, D-635, D-636)**

- **BR-F08-20** A view is valid after normalization:
    - unknown widget ids are dropped, and duplicates keep their first entry;
    - registry widgets missing from it are appended in registry order, visible;
    - a size that is not 2, 3, 4 or 6 is set to the registry default;
    - when no widget is visible, the first one is made visible;
    - a view with an unknown `formatVersion` gets Overview's widgets.

    The server normalizes every view on every read and write, and the client again on load, since a deploy can add or remove widgets.

- **BR-F08-21** Overview is the default view (BR-F08-27). **Reset to default** in Customize mode sets the current view's widgets to Overview's, after the confirmation "Reset your dashboard to the default layout?". It keeps the view's name.
- **BR-F08-22** Views are stored per account (D-55), each view as its own record, with a local copy, and they are not write-queue items (OFF-8). They work the same way from M3 on.
    - **The local copy:** local storage `daybook.layout` holds `{ userId, views }`, each view as `{ id, name, widgets, changedAt, deleted, synced }`. Each change applies on screen at once and is written there with `synced: false`. A copy whose `userId` is not the signed-in user's is deleted unread.
    - **Rendering:** the server renders its stored views.
        - **An unsynced local view:** when its `changedAt` is newer than the server's version of that view, or the server has none, it replaces it on screen after hydration and is sent. An older one is dropped. The reorder this causes happens only in that rare case.
        - **A synced local copy:** never overrides the server's. It is used only when a page has no server data (offline, from M5).
    - **Tabs:** every tab re-reads `daybook.layout` on the `storage` event and before applying an edit, so one tab never overwrites another tab's newer change.
    - **Saving:** `PUT /api/layout` one second after the last change, with the unsynced views and a new `Idempotency-Key` for each send. While a view's `synced` is false it is sent again on page load, on the `online` event, and when the tab becomes visible.
    - **The response:** applies to a view only if the local copy's `changedAt` for it still equals the one sent.
        - **It still does:** a result with `applied: true` sets `synced` to true. With `applied: false`, the client takes the stored view from the response's `views`.
        - **It has changed:** the user changed the view while the request was in flight. Its result is ignored, and the newer copy is sent.
        - **Deleted views:** a tombstone is dropped from the local copy once its result says `applied`, or says a newer view of that id is stored.
        - **A view the server no longer has:** a result with `applied: false` for an id that is absent from `views` means it was deleted elsewhere. The client drops the local view and, if it was shown, shows Overview.
        - **Synced views missing from a read:** a local view with `synced: true` that `GET /api/layout` does not return is dropped.
        - **Size of a send:** at most 10 views in one request; the rest go in the next one.
    - **Which one wins:** the server writes each view with an upsert that overwrites only an older record: `INSERT ... ON CONFLICT (user_id, id) DO UPDATE SET ... WHERE dashboard_views.changed_at <= EXCLUDED.changed_at`.
        - **No row written:** the result is `applied: false`, and the stored view comes back in `views`.
        - **A tie:** goes to the later arrival.
        - **Two concurrent `PUT`s:** leave the later `changedAt` for each view, and a device offline for days cannot overwrite a newer edit, or bring back a view deleted since.
        - **A deletion:** is a write like any other, so an edit made after the delete (a later `changedAt`) brings the view back, and a delete made after an edit removes it. A tie goes to the later arrival, for a delete against an edit too.
        - **A marker for an id the server never stored:** is stored, and answers `applied: true`, so a late edit from another device with an earlier `changedAt` does not bring the view back.
        - **Markers:** stay until the account is deleted. Each is a few bytes, and a user makes one only by deleting a view they made.
    - **The clock:** a `changedAt` later than `ctx.now` is stored as `ctx.now`, so a device with a fast clock cannot win forever.
    - **Another user's id:** a view id that is another user's gets 409 `id_conflict` (ID-1) and nothing is written for that request; the other user's view is never read.
    - **The limit:** a write that would make a 6th live view, a marker brought back by a later edit included, is not stored. Within one request the deletions are applied first, then the other views in the order sent. Its result is `applied: false` with `reason: "limit"`, and the client drops that view and shows "You can save up to 5 views of your own."
    - **Failures:**
        - **Network errors, 408, 429 and 5xx:** keep `synced` false and retry on the triggers above, with no message.
        - **401 and 403:** keep `synced` false and stop sending until the next page load.
        - **A 422:** is a bug. It is reported to Sentry. The client reads `GET /api/layout`, replaces the local copy with it, and shows the toast "Your dashboard layout couldn't be saved."
- **BR-F08-23** A `PUT` body, `{ formatVersion, views: [{ id, name, widgets, changedAt, deleted }] }`, is checked against its Zod shape first, and a body that fails gets 422 `validation_failed`:
    - `formatVersion`: an integer;
    - `views`: 1 to 10 entries;
    - `id`: a UUIDv7 (ID-1), so never `overview`; one entry for each id;
    - `name`: 1 to 40 characters after trimming (a deleted view's name is not checked);
    - `widgets`: 0 to 50 entries of `{ id: a string of at most 64 characters, size: an integer, hidden: boolean }`; a deleted view's are ignored;
    - `changedAt`: an ISO 8601 instant;
    - `deleted`: a boolean.

    Everything else is normalized (BR-F08-20), never refused: unknown ids, duplicates, missing widgets, sizes, an unknown `formatVersion`, and every widget hidden.

- **BR-F08-24** At least one widget must stay visible in a view. Hiding the last visible one is refused, with "Keep at least one widget on your dashboard."
- **BR-F08-25** **Customize mode** is the only place the arrangement is edited (D-638). The pills row ends with a Customize button; it is not shown while the onboarding panel is. Offline it works, and changes sync when the connection returns (BR-F08-22).
    - **On Overview:** Customize makes a copy named "My view", selects it and starts editing it, with the notice "Overview is ours, so you are editing your own copy of it." With 5 live views of the user's own, it shows "You can save up to 5 views of your own." and changes nothing.
    - **On an own view:** Customize starts editing it.
    - **The bar:** "Editing “<name>”", the hint "Move with the arrows, size with ⅓ ½ ⅔ Full, hide with ×.", a chip "+ <widget>" for each hidden widget, which shows it again at the end, Rename, Delete (BR-F08-28), Reset to default (BR-F08-21) and Done.
    - **On each visible widget:** a toolbar with the four sizes (the pressed one marked), "Move <title> earlier", "Move <title> later" (disabled at the ends) and "Hide <title>". Alt+Up and Alt+Down on a focused widget move it too.
    - **Announcements:** every change is announced in a live region: "Budgets moved to position 2 of 8." (the count is the visible widgets of the view), "Budgets is now ½ width." ("Full width" for 6), "Budgets hidden.", "Budgets added." and "Reset to the default layout."
    - **Motion:** a move or a resize animates the widget's position and size together for 260 ms on `cubic-bezier(.2,.7,.2,1)`. With `prefers-reduced-motion` it is instant.
- **BR-F08-26** With `dashboard.dragAndDrop` on, Customize mode gains drag handles.
    - **Controls:** a handle on each widget beside the toolbar's buttons.
    - **State:** the editing state lives in the Zustand `ui` store (root 7.4).
    - **Keyboard:** the toolbar's buttons and Alt+Up and Alt+Down remain the keyboard path.
- **BR-F08-27** The view pills sit above the grid: Overview first, then the user's own views in order of creation (`id`, which is time-ordered). Selecting a pill shows the view and, while Customize is open, ends it.
    - **The remembered view:** the cookie `daybook_view_dashboard` holds the id of the last view shown on this device. It is a D-629 device cookie: `Path=/`, `SameSite=Lax`, one year, `Secure` over https, kept at logout, written whenever the choice is known. The server reads it, so the first paint is the right view.
    - **Written by:** the browser, whenever the choice is known; the server only reads it.
    - **Fallback:** the server shows Overview for an id that is not `overview` or one of the user's live views. After hydration the client looks the id up in the local copy: a view found there that is not deleted (made on this device and not yet synced) is shown and the cookie stays; an id found in neither place is replaced by `overview` in the cookie (deleted elsewhere, or left by another user of this browser).
- **BR-F08-28** **Rename and Delete** apply to an own view, in Customize mode.
    - **Rename:** the name becomes a text field. Saving trims it; an empty name shows "Enter a name for this view." and over 40 characters "Use 40 characters or fewer."
    - **Delete:** asks "Delete “<name>”?" with "This view is removed on every device." and the buttons "Delete view" and "Cancel". It then shows Overview and ends Customize.
    - **Both** set the view's `changedAt` and sync as BR-F08-22 says.

**The month summary's strip, popover and month menu**

- **BR-F08-29** **Daily and Pace** (D-632). The segmented control "Strip view" switches the left half between them; the choice is not remembered.
    - **Daily:** the day strip (BR-F08-30) and the day popover.
    - **Pace:** a line chart of the running total of Out by day, M as a solid line to today (to the last day for a past month) and M − 1 as a dashed one, with a dot on M's last day (BR-F08-31).
- **BR-F08-30** **The day strip** has one bar for each day of M, from `daily`.
    - **Bars:** Out above a line, refunds (negative Out) below it in the negative color. A day with no Out has no bar. `daily` holds only the days whose Out is not 0, for M − 1 and M, oldest first.
    - **Scale:** days above the cap are cut with a gap and labelled with their value. The cap is 1.25 times the second-largest day's Out, a tie counting as two days, so one large day, such as the rent, does not flatten the rest. With fewer than 2 days of Out above 0 there is no cap and the scale is the largest day.
    - **The current month:** days after today have a faint baseline, and pending spending is drawn as in BR-F08-18.
    - **Selecting a day** opens the day popover below the strip; selecting it again closes it. Each bar is a button named "<day>: <amount>" or "<day>: nothing".
    - **The hint:** with no day selected, "Select a day to see its Transactions." and, for a cut day, "<d> <Mon> is cut to fit", and for a refund day, "<d> <Mon> is a refund, below zero."
- **BR-F08-31** **The day popover** is a dialog named by its date, for example "Fri, 9 Oct".
    - **Content:** the day's In and Out ("Nothing recorded" without rows), its Transactions in F03's compact row (the first 4), read from `GET /api/transactions?from=<day>&to=<day>`, and the link "Open 9 Oct in Transactions" to `/transactions?from=<day>&to=<day>`.
    - **Keys:** Escape closes it; the left and right arrows, and its Previous day and Next day buttons, move to the neighboring day of M.
    - **Pace:** the chart's sentence is about N, the day of the dot: today in the current month, the last day of a past one. It reads "By day N you had spent ₹X, ₹Y more than by the same day in September." (or "less"), and its label "Running total: ₹X by day 7, against ₹Y in September." When M − 1 has fewer days than the day compared, its total stays at the whole month's.
- **BR-F08-32** **The month menu** opens from the month's name: a year with Previous year and Next year, and twelve months, each with its name and the month's spending from `months` in a compact form ("₹28,049"). A month outside the range of BR-F08-01 is disabled. Under the grid: "Months before your first Transaction and future months can't be chosen." Escape closes it. Choosing a month sets `month` in the URL and announces it.

**Failures**

- **BR-F08-33** A widget that fails shows "This could not be loaded." with Retry in its own section, and the others render. The summary fails as a whole with the same text.
- **BR-F08-34** **Calendar heat map** (D-634) shows F09's calendar heat map for the calendar year of M, with the "Premium" lock rules of F09 (BR-F09-09). Without `analytics.heatmap.view` it shows P4's locked card and sends no request (section 9). It has no action link; F09's page opens from the card's own button.

## 5. Calculations

Every figure uses the owning feature's formula. Golden October, at the frozen clock ([03-golden-dataset.md](../03-golden-dataset.md)):

| Part                 | Figures                                                                                                                                                                                                                                                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Summary: spending    | 31,168.00; September 28,049.00; +3,119.00 (+11.1%)                                                                                                                                                                                                                                                               |
| Summary: savings     | Income 85,000.00 (12,000.00 less than September), spending 31,168.00, net 53,832.00 (15,119.00 less), savings rate 63.3% (7.8 points lower than 71.1%); To Goals 7,000.00, unallocated 46,832.00                                                                                                                 |
| Summary: Budgets     | 2 over, 1 at limit, 1 near limit                                                                                                                                                                                                                                                                                 |
| Day strip            | October Out by day: 1: 18,000.00; 4: 2,300.00; 5: 649.00; 7: 4,500.00; 9: −1,500.00; 11: 1,800.00; 12: 1,499.00; 14: 2,900.00; 19: 640.00; 31: 380.00; the cap is 5,625.00, so 1 October is cut. September Out by day: 1: 18,000.00; 3: 1,850.00; 5: 649.00; 8: 2,400.00; 10: 1,500.00; 12: 3,200.00; 20: 450.00 |
| Budgets              | Overall 13,168.00 of 11,000.00, 119.7%, Over budget. Top 5: entertainment 214.8%, food 124.4%, shopping 100.0%, transportation 90.0% (4 budgeted); not budgeted: housing 18,000.00                                                                                                                               |
| Spending by category | housing 18,000.00, food 6,220.00, shopping 3,000.00, entertainment 2,148.00, transportation 1,800.00; total 31,168.00 (5 categories, so no Other)                                                                                                                                                                |
| Income vs expenses   | 12 months ending October: September 97,000.00 and 28,049.00; October 85,000.00 and 31,168.00; every other month 0.00 and 0.00                                                                                                                                                                                    |
| Goals                | Emergency fund 10,000.00 of 100,000.00 (10.0%); Vacation 5,000.00 of 30,000.00 (16.7%), 6,250.00 a month                                                                                                                                                                                                         |
| Coming up            | Netflix 5 Nov 649.00; Cult Gym 10 Nov 1,500.00; Sunrise Apartments 1 Dec 18,000.00; Amazon Prime 12 Oct 2027 1,499.00; 20,273.92 a month across 4 Subscriptions                                                                                                                                                  |
| Investments          | With the golden fixture: value 1,980.00, change −120.00, return −1.0%. Sparkline: 1,000.00 from 1 to 14 Oct, 2,200.00 from 15 to 30 Oct, 1,980.00 on 31 Oct                                                                                                                                                      |
| Recent Transactions  | #25, #24, #23, #22, #21, #20, #19, #18                                                                                                                                                                                                                                                                           |
| Picker               | `earliestMonth` 2026-09; `accountEmpty` false; the month menu shows September 28,049, October 31,168 and November 18,420                                                                                                                                                                                         |

**November (to date):**

- **Spending:** 18,420.00 with "+300.00 pending" (P1, from M5), against October's 31,168.00: −12,748.00 (−40.9%). The day strip has one bar, 1 November, 18,420.00.
- **Net savings:** −18,420.00; the savings rate is "—". Income is 0.00, so its note and the rate's read "No income yet", and net savings reads "Below zero".
- **Budgets:** all 4 within limit; not budgeted: housing 18,000.00.
- **Investments:** value 1,980.00, change 0.00; the fixture has no November prices.

**Agreement (TST-2):** October's spending, income and To Goals equal golden list check A and the October report summary.

## 6. Screens and states

**`/dashboard?month=YYYY-MM`.** The month picker, the view pills with Customize, the month summary, then the widgets of the shown view.

| State         | What the user sees                                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading       | The server-rendered page arrives with its figures. The summary's and each widget's reserved skeleton (section 3) shows while a client-side month change loads  |
| Empty         | The onboarding panel (BR-F08-19). Single empty widgets show one line each, for example "No Budgets for October 2026."                                          |
| Error         | Failing widgets show "This could not be loaded." with Retry; the others render                                                                                 |
| Offline (M5)  | The current and last viewed months from cache with "as of" beside the title (root 7.3); other months: "You're offline. This month isn't saved on this device." |
| Pending (M5)  | Annotations (BR-F08-18); pending creates at the top of Recent Transactions                                                                                     |
| Locked (Free) | The heat map widget shows P4's locked card with the sample picture and "See every day of spending on a calendar heat map."; offline, the card's offline form   |
| Customize     | BR-F08-25: the bar, a toolbar on each widget, a dashed outline on stretched ones                                                                               |
| Read-only     | n/a                                                                                                                                                            |

## 7. Flows

**7.1 Open the dashboard**

1. The proxy passes, and the page reads the session, profile, views, the `daybook_view_dashboard` cookie and the dashboard data in `readAsUser` (from M6, insights too).
2. The HTML holds the text figures, which are the LCP.
3. Chart chunks load lazily into reserved space.
4. From M5, a persisted newer copy, if any, shows until refetch (D-113).

**7.2 Look at last month.** Selecting the previous arrow updates `month` in the URL. The data is fetched, or served from cache when present, and the picker announces "October 2026".

**7.3 Drill down.** Selecting the October food bar opens `/transactions?from=2026-10-01&to=2026-10-31&cat=food`, with Out 6,220.00 (golden check B).

**7.4 Look at a day.** Selecting 12 October on the strip opens its popover with Amazon Prime's charge, Out 1,499.00, and "Open 12 Oct in Transactions".

**7.5 Make a view**

1. On Overview, the user selects Customize. "My view" is created and opened, with the notice about the copy.
2. They move Budgets first, make it ⅔ and hide Investments. Each change shows at once, with a 260 ms move.
3. They rename it "Budget watch" and select Done. `PUT /api/layout` saves it one second after the last change.
4. Another device reads it on its next `/api/layout` read; its pill is there, and its own cookie decides which view opens.

**7.6 Two devices change a view offline**

1. Both are offline. The phone changes "Budget watch" at 09:00 and the laptop at 10:00.
2. Whichever syncs first is stored.
3. If the 09:00 edit arrives second, its result is `applied: false`, and the phone takes the 10:00 version.

**7.7 Close the tab during the debounce.** The user hides a widget and closes the tab within one second. The local copy holds it with `synced: false`. The next load shows it and sends it, and the server keeps it unless a newer one exists.

**7.8 Delete a view on one device.** The laptop deletes "Budget watch". The phone, which has not synced, still shows it; its next read drops it, and a late edit from the phone with an earlier `changedAt` does not bring it back. If its cookie names the view, the phone shows Overview.

**7.9 First visit**

1. A new user sees the onboarding panel, with Investments below it (and Learn, from M7).
2. They load demo data (F15) or add a Transaction.
3. The panel gives way to the summary and the widgets.

## 8. Validation and messages

| Situation                  | Message shown                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Invalid `month`            | Some filters in this link weren't valid and were removed.                                            |
| Hiding the last widget     | Keep at least one widget on your dashboard.                                                          |
| Reset                      | Reset your dashboard to the default layout?                                                          |
| Reset done                 | Reset to the default layout.                                                                         |
| Customize on Overview      | Overview is ours, so you are editing your own copy of it.                                            |
| Too many views             | You can save up to 5 views of your own.                                                              |
| Delete a view              | Delete “<name>”? This view is removed on every device. (Delete view, Cancel)                         |
| View name empty            | Enter a name for this view.                                                                          |
| View name too long         | Use 40 characters or fewer.                                                                          |
| Layout save refused (422)  | Your dashboard layout couldn't be saved.                                                             |
| Widget failure             | This could not be loaded.                                                                            |
| Offline month not cached   | You're offline. This month isn't saved on this device.                                               |
| Onboarding panel           | Welcome to Daybook. Add your first Transaction to see your month take shape.                         |
| No renewals                | No upcoming renewals.                                                                                |
| No Budgets                 | No Budgets for October 2026.                                                                         |
| Month announcement         | October 2026                                                                                         |
| Move announcement          | Budgets moved to position 2 of 8. (the count is the view's visible widgets)                          |
| Size announcement          | Budgets is now ½ width. (Full width for 6)                                                           |
| Hide and add announcements | Budgets hidden. Budgets added.                                                                       |
| Day strip hint             | Select a day to see its Transactions.                                                                |
| Month menu note            | Months before your first Transaction and future months can't be chosen.                              |
| Not budgeted               | Not budgeted: Housing ₹18,000.00 (with "and N more" and "Add a Budget")                              |
| All Budgets within limit   | All 4 within limit. (No Budgets: "No Budgets")                                                       |
| Categories footnote        | Refunds exceeded spending                                                                            |
| No spending                | No spending in October 2026.                                                                         |
| Summary notes              | No income yet. Below zero. 7.8 points lower. ₹12,000.00 less than September.                         |
| Cut and refund days        | <d> <Mon> is cut to fit. <d> <Mon> is a refund, below zero.                                          |
| Day strip and popover      | <day>: <amount>. <day>: nothing. Nothing recorded.                                                   |
| Pending group              | Waiting to sync                                                                                      |
| Badge                      | Simulated                                                                                            |
| Pace sentence              | By day 31 you had spent ₹31,168.00, ₹3,119.00 more than by the same day in September.                |
| Sparkline label            | Portfolio value from ₹1,000.00 on 1 Oct to ₹1,980.00 on 31 Oct; lowest ₹1,000.00, highest ₹2,200.00. |

## 9. Plan gating

The core is Free. The heat map widget renders through `<Gate>` (P4): with `analytics.heatmap.view` it loads F09's heat map for the calendar year of M, from `/api/analytics/heatmap`; without it, the locked card shows and no heat-map request is sent (D-634). It is in every view's registry, so a user who upgrades sees it without changing any view. The Stretch drag handles check `dashboard.dragAndDrop`.

## 10. Offline behavior

- **Readable (from M5):** the dashboard data and insights for the current and last viewed months (root 7.3), with "as of".
- **The views (from M3):** readable from the local copy, and writable. Changes stay on the device until they sync, and the server keeps the later `changedAt` of each view (BR-F08-22). The remembered view is a cookie, so it works offline.
- **Transactions added offline (from M5):** they show as annotations and in Recent Transactions, never in figures.
- **The day popover offline:** shows the day's Transactions from the saved query cache, or "You're offline. This month isn't saved on this device."

## 11. Server surface

| Endpoint         | Method | Input                                                                   | Output                                                                                                                                                                            | Errors                                               | Idempotency and versioning                                                                              |
| ---------------- | ------ | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/api/dashboard` | GET    | `month`                                                                 | Section 15                                                                                                                                                                        | 400, 401, 403 `profile_required`                     | Read                                                                                                    |
| `/api/layout`    | GET    | none                                                                    | `{ views: [{ id, name, widgets, changedAt }] }`: the user's live views, normalized, oldest first; none stored gives `[]`. Overview is not in it                                   | 401, 403                                             | Read                                                                                                    |
| `/api/layout`    | PUT    | `{ formatVersion, views: [{ id, name, widgets, changedAt, deleted }] }` | 200 `{ views, results: [{ id, applied, reason? }] }`: `views` as `GET` returns them after the write, one result for each sent view, `reason` `"limit"` when a 6th view is refused | 401, 403, 409 `id_conflict`, 422 `validation_failed` | `Idempotency-Key` required; no `If-Match` (OFF-8). A `changedAt` after `ctx.now` is stored as `ctx.now` |

**Shared function.** `dashboardData(tx, ctx, month)`, which runs BR-F08-03's calls; `accountEmpty` is F15's. The Transactions behind a day come from `GET /api/transactions` (F03).

## 12. Cross-feature effects

- **Invalidated by:** every confirmed finance write in F03 to F06 invalidates the whole `dashboard` query prefix, every month (D-295). Comparisons, the 12-month chart and all-time Goal figures read months other than the one written. Also F15 load and removal. The insights widget reads the `insights` query, which F10's Dismiss and Restore invalidate (F10, section 11). A view write invalidates only the `layout` query.
- **F05:** `subscriptionSummary` returns the next renewals for Coming up (F05, section 11).
- **F07:** prices change the investment figures daily. The dashboard query goes stale once the UTC date passes its `asOfPriceDate` (F07, BR-F07-18).
- **F09:** reuses the income-vs-expenses component and its View as table, the chart rules, and the heat map for the Premium widget.
- **F11:** the report's summary equals the dashboard's figures for the same month.
- **P3:** measures LCP, CLS, first-load JavaScript and server time on this route.

## 13. Edge cases

- **A month with income but no spending:** the category list shows "No spending in October 2026." and the savings rate is 100.0%.
- **Every category negative after refunds:** the bars sit at zero with the footnote; the table shows the negatives.
- **A Goal locked after a lapse:** the Goals widget shows the lock badge.
- **A user with a Budget and no Transactions:** no onboarding panel; the Budgets widget shows the Budget, and the others show their empty lines.
- **Only yearly Subscriptions:** the next renewals can be months away, and the widget still shows them.
- **Fewer than 4 Subscriptions with a next due date:** Coming up lists those it has.
- **Insights before M6, or Learn before M7:** the widget is absent from the registry, so normalization adds it to every stored view when it arrives, at the end.
- **A registry widget removed in a deploy:** dropped from stored views on their next read. If it was the only visible one, the first widget becomes visible.
- **A view's cookie names a deleted view:** Overview shows, and the cookie is written again.
- **A Free user's view holds the heat map:** it shows the locked card; nothing is stored differently.
- **The same view edited in two tabs:** the later `changedAt` wins, tab to tab (BR-F08-22).
- **Logging out with an unsynced view:** the local copy is wiped with the other local data (root 5.3), so the change is lost. The cookie stays (D-629).
- **The persisted cache from another user:** wiped by STATE-3 before render.
- **A browser zoomed to 200% at 360 px:** one column; reserved heights still prevent layout shift.
- **The previous month is shorter than the day compared (Pace):** its total stays at the whole month's (BR-F08-31).

## 14. Acceptance criteria

- **AC-F08-01** (integration) `GET /api/dashboard?month=2026-10` on golden returns every figure in section 5, including `daily` for October and September, `previous` income, net savings and rate, the Budget `summary` and `unbudgeted`, `upcoming` and `months`. Until F06's migration lets the golden load carry its Goal rows (D-471), To Goals is 0.00 and Recent Transactions lists #25, #24 and #21 to #16.
- **AC-F08-02** (integration) For October, the dashboard's spending, income and To Goals equal list check A's header (TST-2). From M6, they also equal the October report summary (F11).
- **AC-F08-03** (client integration, M5) With P1 queued, November spending shows 18,420.00 with "+300.00 pending", P1 leads Recent Transactions with its badge, and the day strip draws 2 November's pending bar outlined.
- **AC-F08-04** (unit) Normalization of a view:
    - an unknown id is dropped;
    - a missing widget is appended, visible;
    - a duplicate keeps its first entry;
    - a size of 5 is reset to the default;
    - every widget hidden makes the first visible;
    - `formatVersion: 2` gives Overview's widgets.
- **AC-F08-05** (integration) Last-write-wins for each view:
    - two `PUT /api/layout` with `changedAt` 09:00 and 10:00 for one id, arriving in either order, leave the 10:00 view;
    - the late 09:00 request's result is `applied: false`;
    - two concurrent `PUT`s leave the later `changedAt`;
    - a `changedAt` an hour ahead of `ctx.now` is stored as `ctx.now`;
    - a delete at 10:00 beats an edit at 09:00 and loses to one at 11:00;
    - a delete and an edit with the same `changedAt` leave whichever arrived later;
    - a marker for an id the server never stored answers `applied: true`, and an edit with an earlier `changedAt` for that id then answers `applied: false`;
    - a read never returns a deleted view.
- **AC-F08-06** (E2E) A new user sees the onboarding panel. After adding a Transaction the panel is gone and the summary and the finance widgets show.
- **AC-F08-07** (E2E) Selecting the October food bar opens a Transactions list whose header Out is 6,220.00.
- **AC-F08-08** (E2E, M5) Offline, a reload shows the cached current month with "as of". An uncached month shows the offline message.
- **AC-F08-09** (performance, M7) On the stress account after a warm-up: LCP at most 2.5 s, CLS at most 0.1, first-load JavaScript at most 200 KB compressed, and `/api/dashboard` server time p95 under 300 ms measured as root NFR-2 sets out (root 11.1).
- **AC-F08-10** (accessibility) The dashboard, in Customize mode too, passes axe with no serious or critical violations. Each chart has View as table or a text label, and the day strip's bars are named. Reordering and resizing work with the keyboard and are announced.
- **AC-F08-11** (integration) `GET /api/dashboard?month=2026-10` on golden runs at most 8 SQL statements after the wrapper's setup, counted by a query logger (BR-F08-04).
- **AC-F08-12** (client integration) Local copy sync:
    - a local view with `synced: false` and a newer `changedAt` than the server's is sent after hydration and is not replaced by the server's;
    - a change made while a `PUT` is in flight survives its response and is sent next;
    - a copy with another user's `userId` is discarded;
    - a change in one tab reaches another tab through the `storage` event.
- **AC-F08-13** (integration) A user whose only row is one Budget gets `accountEmpty: false`, and the dashboard shows the widgets, not the panel.
- **AC-F08-14** (integration) Views:
    - a read for a user with no stored views returns `[]`;
    - a sixth live view is not stored and its result is `applied: false` with `reason: "limit"`, while deleting one first lets it in;
    - `overview` as an id, a 41-character name and an empty name get 422 `validation_failed`;
    - another user's view with the same id is never read or overwritten.
- **AC-F08-15** (E2E) On Overview, Customize makes "My view" with the notice. Moving Budgets first, making it ⅔ and hiding Investments, then reloading, shows the same view first, on this device, from its cookie. A second device sees the pill, and opens Overview.
- **AC-F08-16** (E2E) Selecting 12 October on the day strip opens the popover with Amazon Prime's charge; Escape closes it. The Pace view reads "By day 31 you had spent ₹31,168.00, ₹3,119.00 more than by the same day in September."
- **AC-F08-17** (unit) The day strip's cap is 1.25 times the second-largest day's Out (none with fewer than 2 days of Out), and the Pace line and sentence use the previous month's whole total past its last day.
- **AC-F08-18** (E2E) A Free user sees the heat map's locked card and no request to `/api/analytics/heatmap`; a Premium user sees the chart.
- **AC-F08-19** (unit) The summary's notes and lines: the golden October notes ("₹12,000.00 less than September", "₹15,119.00 less than September", "7.8 points lower"), November's "No income yet" and "Below zero", no income and rate notes when the previous month had no income, the Budgets line "2 over, 1 at limit, 1 near limit" and "All 4 within limit", and the day strip's cut and refund hints.

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
		"rateTenths": 633,
		"previous": {
			"incomeMinor": 9700000,
			"netMinor": 6895100,
			"rateTenths": 711
		}
	},
	"daily": [
		{ "date": "2026-09-01", "outMinor": 1800000 },
		{ "date": "2026-10-01", "outMinor": 1800000 },
		{ "date": "2026-10-09", "outMinor": -150000 }
	],
	"months": [
		{ "month": "2026-09", "outMinor": 2804900 },
		{ "month": "2026-10", "outMinor": 3116800 }
	],
	"budgets": {
		"overall": {
			"limitMinor": 1100000,
			"spentMinor": 1316800,
			"utilizationTenths": 1197,
			"state": "over"
		},
		"summary": { "over": 2, "atLimit": 1, "near": 1 },
		"count": 4,
		"top": [],
		"unbudgeted": [{ "category": "housing", "outMinor": 1800000 }]
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
		"count": 4,
		"upcoming": [
			{
				"subscriptionId": "0192…",
				"name": "Netflix",
				"dueOn": "2026-11-05",
				"amountMinor": 64900
			}
		]
	},
	"investments": {
		"valueMinor": 198000,
		"changeMinor": -12000,
		"twrTenths": -10,
		"asOfPriceDate": "2026-10-31",
		"series": [{ "date": "2026-10-01", "valueMinor": 100000 }]
	},
	"recent": { "items": [], "groups": [] }
}
```

Illustrative, `GET /api/layout` after one view was made:

```json
{
	"views": [
		{
			"id": "0192…",
			"name": "Budget watch",
			"widgets": [
				{ "id": "budgets", "size": 4, "hidden": false },
				{ "id": "investments", "size": 2, "hidden": true }
			],
			"changedAt": "2026-11-02T09:00:00Z"
		}
	]
}
```

Illustrative, the grid of Overview at 6 columns (the last widget of a row stretches):

```text
| Recent Transactions (3)    | Budgets (3)                |
| Spending by category (3)   | Income vs expenses (3)     |
| Goals (2) | Coming up (2)  | Investments (2)            |
| Calendar heat map (3, stretched to 6)                   |
```
