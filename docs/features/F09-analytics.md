# F09 Analytics and charts

17 Oct 2026 · @Himanshu

The Analytics page holds every chart, over any date range and set of categories:

- spending over time;
- spending by category;
- income against expenses;
- Budget against actual;
- this period against the previous one;
- a calendar heat map of daily spending;
- portfolio value and allocation;
- Goal progress.

Three of them are Daybook Premium: Budget against actual, period over period, and the heat map. Every chart reads the same server rollups as the Transactions list. Each one can be zoomed, exported as an image, read as a table, and clicked through to the Transactions behind it. This spec also owns the chart rules the dashboard (F08) and the PDF reports (F11) reuse.

| Item       | Value                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M3 (charts and page). The Premium gates show the locked card from M0, through P4; the purchase flow arrives in M4 (F12). Before M4 the locked card has no Upgrade button. Offline reading and the pending note arrive with P1 (M5)                                                             |
| Plan       | Free: spending over time, by category, income vs expenses, portfolio, allocation, Goal progress. Premium: `analytics.comparative.view` (Budget vs actual, period over period), `analytics.heatmap.view` (calendar heat map). Stretch: `analytics.weekdayHour.view`                             |
| Depends on | [F03](F03-transactions.md) (filter-to-SQL, the filter object), [F04](F04-budgets.md), [F06](F06-goals.md), [F07](F07-investments.md), [P4](../platform/P4-capabilities.md) (gates, locked card), [F02](F02-onboarding-profile-settings.md) (locales, week start); F08 and F11 reuse the charts |
| Decisions  | D-49, D-50, D-108, D-111, D-112, D-115 to D-119, D-124, D-185, D-284 to D-290, D-295, D-296                                                                                                                                                                                                    |

## 1. User stories

- As a user, I want to see how my spending moves over any range, by day, week or month.
- As a user, I want to see which categories take my money, and how income compares with spending.
- As a Premium user, I want to compare a period with the one before it, and my Budgets with what I actually spent.
- As a Premium user, I want a calendar of daily spending to spot heavy days.
- As a user, I want to click any bar or slice and see the Transactions behind it.
- As a user, I want to export a chart as an image, or read it as a table with a screen reader.
- As a Free user, I want to see what the Premium charts look like before upgrading, without my data being sent.

## 2. Scope

| In                                                                                                                                                                                                                                                       | Stretch (M8)                         | Out                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/analytics` with date range and category filters; 9 charts; bucketing; Premium gating with locked cards; drill-down; PNG export; View as table; ECharts setup, theme and accessibility rules shared with F08 and F11; offline reading of the last range | Weekday-by-hour heat map (D-115, K6) | Custom chart building; chart annotations; comparing arbitrary periods (only the previous period); category-by-month matrix (rejected); forecasting; exporting chart data (reports export CSV, F11) |

## 3. Concepts and fields

**The filter (D-285).** Root 6.9's `from`, `to` and `cat`, normalized with F03's shared module (BR-F03-33). Other filter fields are ignored on Analytics.

- **Always two dates:** Analytics never means "all time". Its presets are PER-2's without All time: this month, last month, last 3 months, year to date, last 12 months and custom.
- **The default:** Last 12 months. A URL with neither date is replaced with the default's dates, with no notice.
- **One date only:** it is dropped with the FIL-5 notice, and the default applies.
- **The endpoints:** require both dates, and answer 400 `bad_request` without them.
- **After today:** buckets end at today, since no Transaction can be dated later (F03, BR-F03-09). The portfolio and Goal progress charts end at today too. The bucket size still comes from the full range, so it does not change from day to day.

**Buckets (D-284).** The spending-over-time and income-vs-expenses charts group by:

| Range length       | Bucket                                            | Label example (`dateLocale`) |
| ------------------ | ------------------------------------------------- | ---------------------------- |
| Up to 31 days      | Day                                               | 5 Oct                        |
| 32 to 183 days     | Week, starting on the profile's week start (D-76) | Week of 5 Oct                |
| More than 183 days | Calendar month                                    | Oct 2026                     |

The first and last buckets are clipped to the range. A week starting before `from` covers only days from `from`, and is labelled with its first in-range day.

**The charts**

| Id                      | Chart                        | Type                                          | Plan                                   | Reads                             |
| ----------------------- | ---------------------------- | --------------------------------------------- | -------------------------------------- | --------------------------------- |
| `spendingSeries`        | Spending over time           | Line, with data zoom                          | Free                                   | Out per bucket                    |
| `categories`            | Spending by category         | Donut, top 6 plus Other (D-116)               | Free                                   | Out per category                  |
| `incomeExpenses`        | Income vs expenses           | Grouped bars                                  | Free                                   | Income and Out per bucket         |
| `budgetActual`          | Budget vs actual             | Paired bars per category                      | Premium (`analytics.comparative.view`) | F04 month views                   |
| `periodCompare`         | This period vs previous      | Paired bars per category, plus a change table | Premium (`analytics.comparative.view`) | Out per category, for two periods |
| `heatmap`               | Daily spending calendar      | ECharts calendar heat map, one year (D-118)   | Premium (`analytics.heatmap.view`)     | Out per day                       |
| `portfolioValue`        | Portfolio value              | Line, with trade markers                      | Free                                   | F07 series                        |
| `allocation`            | Allocation                   | Donut, four types                             | Free                                   | F07 summary at `to`               |
| `goalProgress`          | Goal progress                | Lines, cumulative                             | Free                                   | F06 progress by day               |
| `weekdayHour` (Stretch) | Spending by weekday and hour | 7 × 24 heat map                               | Premium (`analytics.weekdayHour.view`) | Out by local weekday and hour     |

## 4. Business rules

**The page**

- **BR-F09-01** `/analytics?from=&to=&cat=` shows the filter bar (date presets and custom range, as in F03; a category multi-select), then the charts in table order (section 3). A chart that has no data for the filter says so in its own area, for example "No spending in this range."
- **BR-F09-02** Every chart reads its own endpoint. The Transaction charts read F03's `rollup` (FIL-2): spending over time, by category, income vs expenses, and both periods of the comparison. Their figures therefore equal the Transactions list for the same filter. The Σ of spending-over-time buckets equals the category total, which equals the list header's Out.
    - **Whole months:** Budget vs actual covers whole calendar months (BR-F09-07).
    - **A whole year:** the heat map covers one calendar year (BR-F09-09).

    Their figures equal the list for those spans, not for the filter's dates.

- **BR-F09-03** A category filter applies to every Transaction chart (FIL-6), and the Budget charts keep only those categories. It never applies to the portfolio charts. Goal progress ignores it, since Goal rows have no category.

**Each chart**

- **BR-F09-04** **Spending over time** draws Out per bucket as a line, including negative buckets below zero (TXN-7). Selecting a point opens `/transactions` for that bucket's dates, the same categories and `type=expense,refund`.
- **BR-F09-05** **Spending by category**:
    - a donut of the 6 largest categories by Out, plus Other for the rest;
    - each category in its fixed color (CAT-4), the total in the center;
    - zero categories left out, and negative ones clamped to zero with the footnote "Refunds exceeded spending" (D-185).

    View as table lists every category, negatives included. A slice opens `/transactions` for the range and that category; Other opens it with every category it groups.

- **BR-F09-06** **Income vs expenses** draws income and Out per bucket as grouped bars, with negative Out below zero. A bar opens that bucket's Transactions with `type=income` or `type=expense,refund`.
- **BR-F09-07** **Budget vs actual** (D-50, D-286, D-373) covers the calendar months the range touches, up to and including the current month; a 15 Sep to 10 Nov range covers September, October and November. A future month's carried-forward limit is never counted, so Analytics and F11's reports agree.
    - **Per category:** the sum of its limits over the months where it is budgeted, against its spending in those months. Spending in months where it has no Budget is left out, and a note says so: "Transportation had no Budget in September; its spending then is not counted."
    - **Overall:** an overall pair, colored by F04's state of the overall utilization.
    - **Subtitle:** names the months covered, for example "September to November 2026, whole months".
    - **Drill-down:** a pair opens that category's Transactions for the covered months.
    - **Data:** F04's `budgetMonths` returns every covered month in one statement.
- **BR-F09-08** **This period vs previous** (D-50) compares the filter's range with the previous period of PER-4. That is the previous calendar month when the range is exactly one calendar month; otherwise the same number of days ending the day before `from`.
    - **The chart:** paired bars per category (previous, current).
    - **The table:** previous, current, change and change %, with "—" when previous is 0, and totals.
    - **Labels:** both periods are named, for example "October 2026 vs September 2026".
    - **A range running past today (D-296):** both periods are cut at the same elapsed day.
        - **The current period:** runs from `from` to today.
        - **The previous period:** runs from its own start for the same number of days, ending no later than its own end.
        - **The labels:** name the dates and say "to date", for example "1–2 Nov 2026 vs 1–2 Oct 2026 (to date)".

        A comparison of a partial period with a full one would otherwise show a fall that is not real.
- **BR-F09-09** **Daily spending calendar** (D-49, D-118, D-287) shows one calendar year of daily Out, chosen with a year selector.
    - **Default year:** the year of `to`, or of today when `to` is later. The date range filter does not limit it, but the category filter does.
    - **Week rows:** start on the profile's week start.
    - **Negative days:** shown as zero, with the footnote (D-185).
    - **Color levels:** five, through a piecewise `visualMap`.
        - **Level 0:** a day with no positive spending.
        - **Thresholds:** t1, t2 and t3 are the 25th, 50th and 75th percentiles, by nearest rank, of the year's positive days.
        - **Levels 1 to 4:** level 1 is up to t1, level 2 up to t2, level 3 up to t3, and level 4 is above t3.

        The thresholds are the quartiles of the spending days, so a few large days, such as rent, take level 4 without washing out the rest. The legend shows each level's range.

    - **Interaction:** the tooltip gives the exact amount; selecting a day opens that day's Transactions.
- **BR-F09-10** **Portfolio value** and **Allocation** draw F07's series from `from` to the earlier of `to` and today, and its allocation at that date, labelled "Simulated". Their drill-down opens `/investments` with the same `from` and `to` (F07, BR-F07-15). A range that starts after today shows "No portfolio values in this range." and sends no request.
- **BR-F09-11** **Goal progress** draws each selected Goal's cumulative progress (contributions minus withdrawals, all time up to each day) from `from` to the earlier of `to` and today (D-290). It reads F06's `goalProgressSeries`.
    - **Selection:** up to 5 Goals, from a picker; by default, the active Goals, oldest first.
    - **Target line:** a dashed line marks each Goal's target.
    - **Drill-down:** a point opens `/goals/<id>`.
- **BR-F09-12** **Stretch: weekday and hour.** With the flag and Premium, a 7 × 24 heat map shows Out by the local weekday and hour of `occurredAt`, in the current profile time zone. Subscription charges are excluded, since their time is "Auto" (D-288). Weekday rows follow the profile's week start.

**Gating (D-119, P4)**

- **BR-F09-13** Premium charts render through `<Gate>`. Without the capability, the client shows P4's locked card with that chart's static sample picture (`/images/locked/<chart>.webp`) and never requests its endpoint. The server refuses a direct request with 403 `premium_required` (P4, BR-P4-09). Locked cards keep the chart's reserved height.

**Chart behavior, shared with F08 and F11 (D-115 to D-117, D-289)**

- **BR-F09-14** ECharts 6 loads lazily, in two client chunks, with modular imports only. The chart wrapper is loaded through `next/dynamic`, so the build's loadable manifest names those chunks, and P3's first-load measure excludes them (P3, BR-P3-09):
    - **The core chunk** (the dashboard and every Analytics chart): `LineChart`, `BarChart`, `PieChart`; `GridComponent`, `TooltipComponent`, `LegendComponent`, `DataZoomComponent`, `ToolboxComponent`, `DatasetComponent`, `MarkLineComponent` (target lines), `MarkPointComponent` (trade markers), `AriaComponent`; `CanvasRenderer`.
    - **The heat-map chunk** (the heat maps only): `HeatmapChart`, `CalendarComponent`, `VisualMapComponent`.
    - **Print:** `SVGRenderer` only on the print route (D-124).

    Option objects are memoized (D-08), charts resize with their container, and each instance is disposed on unmount.

- **BR-F09-15** Two themes, `daybook-light` and `daybook-dark`, are built from the design tokens and registered once. A theme change switches every live chart with ECharts 6's runtime theme switch, without recreating the instance (F02, BR-F02-22).
- **BR-F09-16** Colors are fixed everywhere:
    - each category its CAT-4 color;
    - income, spending, previous and current periods, and Other, their own tokens;
    - asset types F07's colors;
    - Goals their F06 color.

    A category is never recolored by position.

- **BR-F09-17** Tooltips and axes format money with `numberLocale` and the currency (MON-4), and dates with `dateLocale` (F02). Percentages use one decimal (MON-8).
- **BR-F09-18** Time axes have data zoom: inside zoom always, plus a slider when a chart has more than 60 points. Line series above 1,000 points use LTTB sampling. Animation is off above 2,000 points, on the print route, and when the user prefers reduced motion.
- **BR-F09-19** Every chart offers two actions:
    - **Save as image:** the toolbox exports a PNG at twice the device pixel ratio, with the theme's background, named `daybook-<chart>-<from>-<to>.png` (D-117).
    - **View as table:** swaps the chart for a semantic HTML table of the same data. Every series and point appears, in the same order, with formatted values and a caption naming the chart and range. It is also the accessible version (NFR-5).
- **BR-F09-20** Accessibility:
    - **Labels:** ECharts' `aria` is enabled, so each canvas gets a generated label, and `AriaComponent` is imported.
    - **Patterns:** under `prefers-contrast: more`, decal patterns are added to bars and slices, so colors are not the only cue.
    - **Keyboard:** every drill-down target is also reachable from the table view by keyboard.
- **BR-F09-21** Each chart reserves its height before data or code arrives: line and bar charts 320 px, donuts 300 px, the calendar 220 px per year, weekday-by-hour 280 px.
- **BR-F09-22** Pending changes never enter chart data (TXN-6). From M5, when pending Transactions match the filter, the page shows one line above the charts: "3 changes waiting to sync aren't in these charts yet."

## 5. Calculations

Golden ([03-golden-dataset.md](../03-golden-dataset.md)), at the frozen clock:

**Spending by category, October** (`from=2026-10-01&to=2026-10-31`): housing 18,000.00, food 6,220.00, shopping 3,000.00, entertainment 2,148.00, transportation 1,800.00. Total 31,168.00 equals check A's Out.

**Spending over time, October** (31 days, so daily buckets). Each day equals the golden calendar table: 1 Oct 18,000.00, 4 Oct 2,300.00, 5 Oct 649.00, 7 Oct 4,500.00, 9 Oct −1,500.00 (below zero on the line), 11 Oct 1,800.00, 12 Oct 1,499.00, 14 Oct 2,900.00, 19 Oct 640.00, 31 Oct 380.00. Every other day is 0.00. The sum is 31,168.00.

**Daily spending calendar, 2026.** The year has 17 positive days (7 in September, 9 in October, 1 in November).

- **Thresholds:** by nearest rank, t1 = 649.00 (rank 5), t2 = 1,850.00 (rank 9) and t3 = 3,200.00 (rank 13).
- **October's levels:**
    - level 4: 1 Oct (18,000.00) and 7 Oct (4,500.00);
    - level 3: 4 Oct (2,300.00) and 14 Oct (2,900.00);
    - level 2: 11 Oct (1,800.00) and 12 Oct (1,499.00);
    - level 1: 5 Oct (649.00), 19 Oct (640.00) and 31 Oct (380.00);
    - level 0: 9 Oct, shown as 0 with the footnote "Refunds exceeded spending", and every other day.

**This period vs previous, October against September**

| Category       | September     | October       | Change                 |
| -------------- | ------------- | ------------- | ---------------------- |
| housing        | 18,000.00     | 18,000.00     | 0.00 (0.0%)            |
| food           | 5,050.00      | 6,220.00      | +1,170.00 (+23.2%)     |
| shopping       | 2,400.00      | 3,000.00      | +600.00 (+25.0%)       |
| entertainment  | 649.00        | 2,148.00      | +1,499.00 (+231.0%)    |
| transportation | 450.00        | 1,800.00      | +1,350.00 (+300.0%)    |
| health         | 1,500.00      | 0.00          | −1,500.00 (−100.0%)    |
| **Total**      | **28,049.00** | **31,168.00** | **+3,119.00 (+11.1%)** |

**Budget vs actual, September and October** (`from=2026-09-01&to=2026-10-31`)

| Category       | Limits (months budgeted)        | Spent in those months                     | Utilization |
| -------------- | ------------------------------- | ----------------------------------------- | ----------- |
| food           | 6,000.00 + 5,000.00 = 11,000.00 | 5,050.00 + 6,220.00 = 11,270.00           | 102.5%      |
| shopping       | 3,000.00 + 3,000.00 = 6,000.00  | 2,400.00 + 3,000.00 = 5,400.00            | 90.0%       |
| entertainment  | 1,000.00 + 1,000.00 = 2,000.00  | 649.00 + 2,148.00 = 2,797.00              | 139.9%      |
| transportation | 2,000.00 (October only)         | 1,800.00 (September's 450.00 not counted) | 90.0%       |
| **Overall**    | **21,000.00**                   | **21,267.00**                             | **101.3%**  |

**Income vs expenses, September to October** (61 days, so weekly buckets). Weeks start on Monday for golden. The September and October totals equal the monthly table: income 182,000.00 and spending 59,217.00 across the buckets.

## 6. Screens and states

**`/analytics`.** The filter bar, the pending note (BR-F09-22), and the charts, each with Save as image and View as table.

| State            | What the user sees                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Loading          | Each chart's reserved skeleton (BR-F09-21)                                                                                        |
| Empty            | Per chart: "No spending in this range.", "No Budgets in these months.", "No active Goals."                                        |
| Error            | Per chart: "This chart could not be loaded." with Retry                                                                           |
| Offline (M5)     | The last viewed range from cache, with "as of" (root 7.3); other ranges: "You're offline. This range isn't saved on this device." |
| Pending (M5)     | The note above the charts (BR-F09-22)                                                                                             |
| Locked (Premium) | P4's locked card with a sample picture; no data request (BR-F09-13). Before M4, without the Upgrade button                        |
| Read-only        | Everything; Analytics has no writes                                                                                               |

## 7. Flows

**7.1 Explore a range.** The user picks "Last 3 months" and then Food. The URL updates, and each chart refetches for its own endpoint. The donut becomes a single slice, and its table shows the food total, which equals the Transactions list for the same link.

**7.2 Compare periods (Premium).** With `from=2026-10-01&to=2026-10-31`, the comparison names "October 2026 vs September 2026" and shows section 5's table. Selecting the shopping pair opens October's shopping Transactions.

**7.3 Free user on the heat map.** The calendar's slot shows the locked card with the sample picture, and no heat-map request is sent. After purchase (M4), `/api/me` refetches, the gate opens, and the chart loads.

**7.4 Export.** Save as image downloads `daybook-categories-2026-10-01-2026-10-31.png`.

**7.5 Screen reader.** View as table on Spending over time lists 31 rows of date and amount, captioned "Spending over time, 1 Oct to 31 Oct 2026".

## 8. Validation and messages

| Situation                                      | Message shown                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Invalid filter parameter                       | Some filters in this link weren't valid and were removed.                                                        |
| Refunds exceed spending in a donut or calendar | Refunds exceeded spending                                                                                        |
| Budget months without a Budget                 | Transportation had no Budget in September; its spending then is not counted.                                     |
| Pending note                                   | 3 changes waiting to sync aren't in these charts yet.                                                            |
| Empty charts                                   | No spending in this range. / No Budgets in these months. / No active Goals. / No portfolio values in this range. |
| Locked chart                                   | Part of Daybook Premium (P4's locked card)                                                                       |
| Load failure                                   | This chart could not be loaded.                                                                                  |
| No previous data                               | — (change % when the previous value is 0)                                                                        |

## 9. Plan gating

| Code                                   | Charts                                    | Server refusal                                                                               | Client shows    |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------- | --------------- |
| `analytics.comparative.view`           | Budget vs actual, This period vs previous | 403 `premium_required` on `/api/analytics/budget-actual` and `/api/analytics/period-compare` | The locked card |
| `analytics.heatmap.view`               | Daily spending calendar                   | 403 `premium_required` on `/api/analytics/heatmap`                                           | The locked card |
| `analytics.weekdayHour.view` (Stretch) | Weekday and hour                          | 403 `premium_required` on `/api/analytics/weekday-hour`                                      | The locked card |

## 10. Offline behavior

Analytics reads only. From M5 (P1), the last viewed range's chart data is persisted (root 7.3) and shown with "as of". Other ranges need a connection. Gating offline uses the persisted `/api/me` (P4, BR-P4-12).

## 11. Server surface

Every endpoint is a `GET` read with `from`, `to` and `cat` (unless noted), using F03's filter function. Both dates are required. Each response carries `currency`, and refusals use 400, 401, 403 `profile_required` or 403 `premium_required`.

| Endpoint                                         | Extra input                             | Output                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/analytics/spending-series`                 | none                                    | `{ bucket: "day" \| "week" \| "month", points: [{ start, end, outMinor }] }`                                                               |
| `/api/analytics/categories`                      | none                                    | `{ items: [{ category, outMinor }], totalMinor }`                                                                                          |
| `/api/analytics/income-expenses`                 | none                                    | `{ bucket, points: [{ start, end, incomeMinor, outMinor }] }`                                                                              |
| `/api/analytics/budget-actual` (Premium)         | none                                    | `{ months: ["2026-09", "2026-10"], items: [{ category, limitMinor, spentMinor, utilizationTenths, state, unbudgetedMonths }], overall }`   |
| `/api/analytics/period-compare` (Premium)        | none                                    | `{ current: { from, to }, previous: { from, to }, items: [{ category, previousMinor, currentMinor, changeMinor, changeTenths }], totals }` |
| `/api/analytics/heatmap` (Premium)               | `year` instead of `from` and `to`       | `{ year, days: [{ date, outMinor }], thresholdsMinor: [t1, t2, t3] }`                                                                      |
| `/api/analytics/goal-progress`                   | `goals` (comma list, up to 5); no `cat` | `{ goals: [{ id, name, color, targetMinor, points: [{ date, progressMinor }] }] }`                                                         |
| `/api/analytics/weekday-hour` (Stretch, Premium) | none                                    | `{ cells: [{ weekday, hour, outMinor }] }`                                                                                                 |

The portfolio charts use F07's `/api/investments/series` and `/api/investments/summary`. Goal progress reads F06's `goalProgressSeries`.

## 12. Cross-feature effects

- **F08:** reuses the categories and income-vs-expenses components, with the dashboard month as the range, and the shared chart rules.
- **F11:** draws the same components on the print route, with the SVG renderer and no animation (D-124).
- **Invalidation:** every confirmed write that changes Transactions (Subscription charges included), Budgets or Goals invalidates the whole `analytics` query prefix (D-295). The portfolio charts go stale once the UTC date passes their `asOfPriceDate` (F07, BR-F07-18).
- **F12:** a plan change refetches `/api/me`, and gates open or close.

## 13. Edge cases

- **A one-day range:** one daily bucket; the period comparison uses the previous day.
- **A range spanning a year boundary:** month buckets cross years; the calendar shows the year of `to`, and a year selector reaches the other.
- **A category filter with only income categories:** spending charts are empty, and income vs expenses shows income only.
- **A year with few positive days, such as 3:** the thresholds are the three values themselves, so the days take levels 1, 2 and 3 and level 4 is empty. A year with one positive day shows it at level 1.
- **A range ending after today:** "Last 12 months" ends on the last day of this month. Its buckets stop at today, and the portfolio and Goal lines end today.
- **The profile's week start changes:** weekly buckets and calendar rows follow on the next fetch; no stored data changes.
- **A Premium lapse while the page is open:** the next request returns 403, the client refetches `/api/me`, and the chart becomes the locked card.
- **Stress account, 5 years of daily data in the calendar:** one year at a time, at most 366 cells.

## 14. Acceptance criteria

- **AC-F09-01** (integration) On golden, the categories, spending-series, period-compare, budget-actual and heat-map endpoints return every figure in section 5. Golden is seeded Premium from M4 (F15). Before that, these tests write the two Premium entitlement keys with a test factory (TST-3).
- **AC-F09-02** (integration) For any filter, Σ spending-series equals the categories total, which equals F03's summary Out (BR-F09-02). This is checked on golden checks A, B and C.
- **AC-F09-03** (unit) Bucketing: 31 days gives daily; 32 gives weekly with the profile's week start, and a first week clipped at `from`; 184 gives monthly.
- **AC-F09-04** (integration) A Free user's request to the heat map, budget-actual or period-compare returns 403 `premium_required`. A user with the entitlement keys gets data (a test factory before M4).
- **AC-F09-05** (client integration) A Free user's page renders the locked cards without requesting the Premium endpoints.
- **AC-F09-06** (unit) The heat map's thresholds for golden 2026 are 649.00, 1,850.00 and 3,200.00, and October's days take the levels in section 5. Negative days render at level 0 with the footnote.
- **AC-F09-07** (E2E) Selecting the October food slice opens a Transactions list with Out 6,220.00.
- **AC-F09-08** (E2E) Switching the theme re-themes live charts without a reload or a blank frame.
- **AC-F09-09** (E2E) Save as image downloads a PNG with the named file name.
- **AC-F09-10** (accessibility) Every chart's View as table passes axe with no serious or critical violations and lists the same values as the chart. Every drill-down is reachable by keyboard from the tables.
- **AC-F09-11** (build check) The Analytics and dashboard routes keep ECharts out of the shared first-load bundle, and only the heat maps load the heat-map chunk.
- **AC-F09-12** (unit) The Analytics filter:
    - no dates gives Last 12 months, with no notice;
    - one date alone is dropped with the FIL-5 notice;
    - All time is not offered;
    - a custom range from 2026-10-15 to 2026-11-30, on 2026-11-02, uses weekly buckets (47 days), ending with the week of 2 November cut to that one day.
- **AC-F09-13** (performance, M7) A 5-year monthly range on the stress account meets the server p95 of 300 ms per endpoint after a warm-up, measured as root NFR-2 sets out.
- **AC-F09-14** (integration) On golden, "This month" on 2026-11-02 compares 1–2 Nov with 1–2 Oct, labelled "to date":
    - current 18,420.00, previous 18,000.00, change +420.00 (+2.3%);
    - housing 18,000.00 against 18,000.00;
    - food 420.00 against 0.00, with change % "—".

## 15. Illustrations

Illustrative, `GET /api/analytics/period-compare?from=2026-10-01&to=2026-10-31` (shortened):

```json
{
	"current": { "from": "2026-10-01", "to": "2026-10-31" },
	"previous": { "from": "2026-09-01", "to": "2026-09-30" },
	"items": [
		{
			"category": "food",
			"previousMinor": 505000,
			"currentMinor": 622000,
			"changeMinor": 117000,
			"changeTenths": 232
		}
	],
	"totals": {
		"previousMinor": 2804900,
		"currentMinor": 3116800,
		"changeMinor": 311900,
		"changeTenths": 111
	},
	"currency": "INR"
}
```

Illustrative, a chart frame:

```text
Spending by category · 1–31 Oct 2026            [Save image] [View as table]
        ( donut: Housing 57.8% · Food 20.0% · Shopping 9.6% · ... )
                         ₹31,168.00
```
