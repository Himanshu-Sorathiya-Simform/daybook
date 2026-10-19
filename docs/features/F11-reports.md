# F11 Reports

18 Oct 2026 · @Himanshu

A report summarizes one month, quarter or year of a user's money in one document. The user picks the type and period on `/reports`, sees the report on screen, and downloads it as a PDF or as two CSV files: every Transaction in the period, and the summary tables.

The PDF is rendered on the server by Chromium from a print page built from the screen's own components, so the download cannot disagree with what the user saw or with the dashboard. Monthly reports are free; quarterly and annual reports are Daybook Premium.

| Item | Value |
| --- | --- |
| Milestone | M6 |
| Plan | Monthly: Free. Quarterly: `reports.quarterly.generate`. Annual: `reports.annual.generate` (Premium) |
| Depends on | [F03](F03-transactions.md) (`rollup`, `listTransactions`), [F04](F04-budgets.md) (`budgetMonths`), [F05](F05-subscriptions.md) (`subscriptionCosts`), [F06](F06-goals.md) (`goalProgress`), [F09](F09-analytics.md) (chart components, SVG on print), [P2](../platform/P2-data-access-and-security.md) (print token), [P4](../platform/P4-capabilities.md) (gates), [F12](F12-premium-billing.md) (Upgrade) |
| Decisions | D-51 to D-53, D-121 to D-124, D-338 to D-343, D-368 to D-370, D-373, D-382 |

## 1. User stories

- As a user, I want a monthly summary of income, spending, savings, Budgets, Goals and Subscriptions in one document.
- As a Premium user, I want the same for a quarter or a year, with a month-by-month table.
- As a user, I want to download every Transaction of a period as a spreadsheet.
- As a user, I want the report to match the dashboard and the Transactions list exactly.
- As a user, I want to see the report before downloading it.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| `/reports` with type and period; the on-screen report; the PDF through server Chromium and the print route; the Transactions CSV and the summary CSV; Premium gates for quarterly and annual | None | Stored report files and history (D-51); scheduled or emailed reports; category or account filters (D-123); investments in reports (D-121); asynchronous report jobs (root 16); custom branding; other formats (XLSX, OFX) |

## 3. Concepts and fields

**Types and periods** (PER-1, D-123)

| Type | Period form | Example | Plan |
| --- | --- | --- | --- |
| `monthly` | `YYYY-MM` | `2026-10` | Free |
| `quarterly` | `YYYY-Qn` | `2026-Q4` (October to December) | Premium |
| `annual` | `YYYY` | `2026` | Premium |

A period runs over whole calendar months of `occurred_on` (TIME-3). One that contains today is partial and labelled "to date" (PER-3); its figures run to today. Its covered months are its months up to and including the current one (D-373), so a quarter to date never counts a future month's Budget limits.

**The report** (`reportData(tx, ctx, type, period)`, D-339), in this order (D-121):

| Section | Content | Source |
| --- | --- | --- |
| Header | "Daybook monthly report · October 2026" ("quarterly report · Q4 2026", "annual report · 2026"; with "· to date" when partial), "Prepared for <display name>", the currency, and "Generated 2 Nov 2026, 12:00 pm" in F02's date-and-time format | The request clock in the profile zone; on the print route, the token's `generatedAt` |
| Summary | Income, spending, net savings, To Goals and savings rate (TXN-5), as on the dashboard | F03 `rollup` |
| Spending by category | Every category with non-zero Out, largest first, with its share of total spending; the donut | F03 `rollup`, F09's donut |
| Budget against actual | Monthly: F04's month view for the period, with overall and unbudgeted spending. Quarterly and annual: F09's rule of summing each category's limits over the months it was budgeted (D-286), over the covered months, with the chart | F04 `budgetMonths`, F09's chart |
| Goals | Every Goal created on or before the period's last day and not archived before its first day: progress at the period's end, target, percent, and "Completed on 12 Oct" when it was completed by then. Instants are compared as dates in the profile time zone. Goals carry their current state: a Goal reopened since loses its earlier completion (F06) | F06 `goalProgress` |
| Subscription costs | Charges in the period per Subscription that had any, largest first, then one "Deleted Subscriptions" row for charges whose Subscription was deleted (F05); and the total, which equals Out for `src=subscription`. The "Current monthly cost" today (F05) | F03 `rollup` by Subscription, F05 `subscriptionCosts` |
| Largest expenses | Up to 10 expenses by gross amount, largest first; ties newest first, as the list's Largest first sort (F03, BR-F03-29) | F03 `listTransactions` |
| Month by month | Quarterly and annual only: income, spending, net savings, savings rate and To Goals for every covered month, zeros included | F03 `rollup` |

Investments are left out (D-121).

## 4. Business rules

**The page (D-338)**

- **BR-F11-01** `/reports?type=<t>&period=<p>` shows a form and the report below it.
    - **The form:** type (Monthly, Quarterly, Annual), then a period picker for that type.
    - **Default:** monthly for the previous calendar month, or the current month when the user has no confirmed Transaction before it.
    - **Available periods:** from the period holding the user's earliest confirmed Transaction (or the current period, when there is none) to the current period. Future periods are disabled.
    - **Invalid values:** an invalid or out-of-range `type` or `period` is dropped with the FIL-5 notice, and the default applies. The APIs answer the same input with 400 `bad_request`.
- **BR-F11-02** The on-screen report renders the same components as the print route, with screen styles and charts in the canvas renderer. Below the form are three actions: Download PDF, Download Transactions (CSV) and Download summary (CSV).
- **BR-F11-03** Quarterly and annual types render through `<Gate>` (P4). Without the capability, the form still lets the user pick them. The report area then shows P4's locked card, "Get quarterly and annual reports with Daybook Premium.", with a static sample picture and Upgrade to `/settings/billing?from=reports.quarterly.generate` (or `.annual`; F12). No report data is requested, and the download buttons are hidden. The endpoints check the capability for the requested type themselves, through `assertCan`, since it depends on `[type]` (P4).

**Figures (D-339)**

- **BR-F11-04** Every figure comes from the shared functions in section 3, in one repeatable-read transaction, so the report equals the dashboard, the Transactions list and Analytics for the same period (root success criterion 1, TST-2). `reportData` runs at most 7 statements.
- **BR-F11-05** Confirmed Transactions only; pending changes never appear (TXN-6).
- **BR-F11-06** Money uses the profile's `numberLocale` and currency, and dates its `dateLocale` (F02). Percentages have one decimal, with "—" for a zero denominator (MON-8).
- **BR-F11-07** A period with no Transactions still renders, with zeros and "No Transactions in October 2026." in place of the category and expense sections.

**The PDF (D-52, D-124, D-340, D-368)**

- **BR-F11-08** `GET /api/reports/[type]/[period]/pdf`:
    1. **Checks:** the route is declared with P2's `afterCommit` option (BR-P2-15). In its read transaction, the handler checks the session, the profile and, for quarterly and annual, the capability through `assertCan` (P2, P4). It validates the period, and signs a print token for the user, type and period, with `generatedAt` set to `ctx.now` (P2, BR-P2-41). It returns a continuation, which runs the steps below after the transaction has committed and its connection has returned to the pool, so no connection waits.
    2. **A slot:** each server process renders at most 2 PDFs at once.
        - **The waiting line:** at most 4 more requests wait, each for up to 20 seconds.
        - **Busy:** a request beyond the waiting line, or one that waits 20 seconds, answers 503 `report_busy` with `Retry-After: 10`.
    3. **Rendering:** a new browser context of the warm Chromium (BR-F11-09), created with `serviceWorkers: 'block'`, no cookies, and a viewport as wide as the A4 content area (210 mm less the margins, 673 CSS px). The page emulates print media before it loads, so charts are sized for the page they print on.
        - **The token:** added as the header `X-Print-Token` to the document request only, through `page.route`, never in the URL.
        - **Other origins:** requests to any origin other than `APP_ORIGIN` are aborted.
        - **The page:** it opens `<APP_ORIGIN>/print/reports/<type>/<period>`. A status other than 200 answers 500 at once. Otherwise it waits up to 15 seconds for `[data-report-ready="true"]`.
    4. **A page that never becomes ready:** answers 500 `internal`. The page's errors and console output go to Sentry with the request id (P3). A page failing the same way every time therefore shows as an error, never as "busy".
    5. **The PDF:** `page.pdf()` with A4 portrait, 16 mm margins and `printBackground`. The header template shows the report title. The footer template shows "Generated 2 Nov 2026, 12:00 pm · Page 1 of 3", from the token's `generatedAt`, so page and footer agree.
    6. **Response:** `application/pdf`, `Content-Disposition: attachment; filename="daybook-monthly-2026-10.pdf"` and `Cache-Control: no-store`. The context is closed in every case.
- **BR-F11-09** **The warm browser.** Each server process launches one Playwright Chromium on its first PDF request and keeps it. A browser that disconnects is relaunched on the next request. It closes when the process exits. Chromium comes from `npx playwright install chromium`, which the setup steps run.
- **BR-F11-10** **The print route** `/print/reports/[type]/[period]` (P2, BR-P2-42; D-368):
    - **The proxy** (P2, BR-P2-29): never redirects `/print/*`. It checks the token's signature and expiry and the allow-list itself, with no database call, answering 401 or 404 before the page runs.
    - **The allow-list:** these three patterns, and no other route, accept a token: `/print/reports/monthly/YYYY-MM`, `/print/reports/quarterly/YYYY-Qn` and `/print/reports/annual/YYYY`. The token's `report` and `period` must match the URL.
    - **Reading:** the page reads through `readForPrint(token, fn)` (P2, BR-P2-42), which builds the context for the token's user with no catch-up, sets the request clock to the token's `generatedAt`, and opens one read transaction. A capability missing by then gives 404 through Next.js's `notFound()`, with no `loading.tsx` or Suspense above the check, so the status is decided before anything streams.
    - **Layouts** (D-382): Daybook's root layout renders only `<html>`, `<body>`, fonts and the theme script. The app shell and its providers live in `app/(app)/layout.tsx`, and the public shell in `app/(public)/layout.tsx`. The print route sits outside both, in `app/print/`, so it has no boot sequence, write queue, service-worker registration, `/api/me` query, 401 handling, Sentry replay or `<Gate>`.
    - **Data:** the server component reads the report, the profile's `numberLocale` and `dateLocale`, and the token's `generatedAt`, and passes them to the report components as props. Those components fetch nothing, so the PDF formats money exactly as the screen does.
    - **Rendering:** the light theme, ECharts' SVG renderer and no animation (D-124; F09, BR-F09-14).
    - **Readiness:** the expected chart count comes from the same predicate each chart uses to decide whether it renders, such as a donut needing at least one positive slice (F09, BR-F09-05). An empty or refund-only period therefore expects none. Each chart's `finished` listener is attached before its option is set. When every expected chart has fired and `document.fonts.ready` has resolved, the page sets `data-report-ready="true"` on `<body>`.
    - **Headers:** `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. The service worker never caches it (P1).

**The CSV files (D-53, D-122)**

- **BR-F11-11** **Format** (D-341). RFC 4180:
    - UTF-8 with a byte order mark, so spreadsheet apps detect the encoding;
    - CRLF line endings, and a header row;
    - a field holding a comma, quote, CR or LF is quoted, with quotes doubled.

    **Cell types:**
    - **Numbers:** amounts and percentages, written as plain numbers with `.` as the decimal mark. Amounts are in major units with the currency's fixed decimals (`-18000.00`, `-1500` in JPY, `-12.500` in KWD). Percentages have one decimal. Numbers are never neutralized.
    - **Dates:** ISO (`2026-10-01`).
    - **Everything else is text:** a text cell that begins with `=`, `+`, `-`, `@`, a tab or a carriage return gets a leading `'` (formula neutralization).
- **BR-F11-12** **Transactions** (`GET /api/reports/[type]/[period]/csv?part=transactions`). One row per confirmed Transaction in the period, ordered by `occurred_on`, then `occurred_at`, then `id`, oldest first.

    | Column | Type | Content |
    | --- | --- | --- |
    | `date` | Date | `occurred_on` |
    | `time` | Text | Local time `HH:MM` (24-hour), empty for Subscription charges, which show "Auto" on screen |
    | `type` | Text | `expense`, `income`, `refund`, `goal_contribution` or `goal_withdrawal` |
    | `category` | Text | The category's label (CAT-1), empty for Goal rows |
    | `goal` | Text | The Goal's name, for Goal rows |
    | `payee`, `description`, `note` | Text | As stored |
    | `amount` | Number | Signed (D-231): plus for income, refunds and withdrawals; minus for expenses and contributions |
    | `currency` | Text | The profile currency |
    | `source` | Text | `manual` or `subscription` |
    | `subscription` | Text | The Subscription's name, for charges whose Subscription still exists |
    | `id` | Text | The Transaction id |

    - **Streaming:** the file streams in keyset pages of 1,000 rows, in P2's streaming mode (BR-P2-15). The stream owns one read transaction, and commits and releases it when the file ends. The first page is read before the response starts, so an early error still answers with the error envelope.
    - **Failure:** a database error mid-file aborts the response, so the browser marks the download failed instead of saving a truncated file. A client that disconnects rolls the transaction back.
    - **The name:** `daybook-transactions-2026-10.csv`.
- **BR-F11-13** **Summary** (`/csv?part=summary`, D-342, D-369). A long table with columns `section`, `item`, `metric` and `value`, in the report's order.
    - **`item`:** always text.
    - **`value`:** a number or text, as the metric's type says.
    - **Missing values:** a metric whose value is "—" (a zero denominator) is left out, as is a metric a row does not have.

    | `section` | `item` | `metric` (type) |
    | --- | --- | --- |
    | `summary` | empty | `income`, `spending`, `net_savings`, `to_goals`, `savings_rate_percent` (numbers) |
    | `category` | Category label | `spending`, `share_percent` (numbers) |
    | `budget` | Category label, or `Overall` | `limit`, `spent`, `utilization_percent` (numbers); `state` (text: F04's `ok`, `warning` or `over`) |
    | `budget` | `Unbudgeted` | `spent` (number) |
    | `goal` | Goal name | `progress`, `target`, `percent` (numbers); `completed_on` (date) |
    | `subscription` | Subscription name | `charges` (number) |
    | `subscription_deleted` | empty | `charges` (number) |
    | `subscription_total` | empty | `charges`, `current_monthly_cost` (numbers) |
    | `largest_expense` | Rank `1` to `10` | `date` (date); `payee`, `category` (text); `amount` (number, gross and positive) |
    | `month` | `YYYY-MM` (quarterly and annual) | `income`, `spending`, `net_savings`, `to_goals`, `savings_rate_percent` (numbers) |

    Its name is `daybook-summary-monthly-2026-10.csv`.
- **BR-F11-14** Both CSV endpoints check the same capability as the PDF, through `assertCan` for the requested type. They answer `text/csv; charset=utf-8` with `Content-Disposition: attachment` and `Cache-Control: no-store`.
- **BR-F11-15** **Downloading.** The CSV buttons are plain links with `download`, so the browser streams the file and marks it failed itself if the response aborts. Download PDF uses `fetch`, so the page can show "Preparing PDF…", "Reports are busy right now…" or "The download failed.", then saves the returned file.

## 5. Calculations

**Golden** ([03-golden-dataset.md, October monthly report](../03-golden-dataset.md#october-monthly-report)), generated on 2 November, so complete:

- **Summary:** income 85,000.00; spending 31,168.00; net savings 53,832.00; To Goals 7,000.00; savings rate 63.3%.
- **Spending by category:**
    - housing 18,000.00 (57.8%);
    - food 6,220.00 (20.0%);
    - shopping 3,000.00 (9.6%);
    - entertainment 2,148.00 (6.9%);
    - transportation 1,800.00 (5.8%).
- **Budget against actual:**
    - entertainment 2,148.00 of 1,000.00 (214.8%, Over budget);
    - food 6,220.00 of 5,000.00 (124.4%, Over budget);
    - shopping 3,000.00 of 3,000.00 (100.0%, Over budget);
    - transportation 1,800.00 of 2,000.00 (90.0%, Nearing limit);
    - overall 13,168.00 of 11,000.00 (119.7%), with unbudgeted 18,000.00.
- **Goals at 31 October:** Emergency fund 10,000.00 of 100,000.00 (10.0%); Vacation 5,000.00 of 30,000.00 (16.7%).
- **Subscription costs:** Sunrise Apartments 18,000.00, Amazon Prime 1,499.00 and Netflix 649.00, total 20,148.00. Current monthly cost 20,273.92.
- **Largest expenses:** golden's list of 9, since October has only 9 expenses.

Shares are of total spending, each rounded once: 18,000 ÷ 31,168 = 57.75% → 57.8%; 6,220 → 19.96% → 20.0%; 3,000 → 9.63% → 9.6%; 2,148 → 6.89% → 6.9%; 1,800 → 5.78% → 5.8%. Rounded shares need not sum to 100.0%.

**Transactions CSV, October** (14 rows; ids left out here):

```text
date,time,type,category,goal,payee,description,note,amount,currency,source,subscription,id
2026-10-01,,expense,Housing,,Sunrise Apartments,,,-18000.00,INR,subscription,Sunrise Apartments,…
2026-10-01,10:05,income,Salary,,Acme Corp,,,85000.00,INR,manual,,…
2026-10-02,08:00,goal_contribution,,Emergency fund,,,,-5000.00,INR,manual,,…
2026-10-04,20:30,expense,Food,,Zomato,,,-2300.00,INR,manual,,…
2026-10-05,,expense,Entertainment,,Netflix,,,-649.00,INR,subscription,Netflix,…
2026-10-07,11:45,expense,Shopping,,Croma,,,-4500.00,INR,manual,,…
2026-10-09,16:20,refund,Shopping,,Croma,,,1500.00,INR,manual,,…
2026-10-11,09:10,expense,Transportation,,Indian Oil,,,-1800.00,INR,manual,,…
2026-10-12,,expense,Entertainment,,Amazon Prime,,,-1499.00,INR,subscription,Amazon Prime,…
2026-10-14,19:00,expense,Food,,BigBasket,Monthly groceries,,-2900.00,INR,manual,,…
2026-10-15,09:30,goal_contribution,,Vacation,,,,-3000.00,INR,manual,,…
2026-10-18,17:45,goal_withdrawal,,Vacation,,,,1000.00,INR,manual,,…
2026-10-19,22:15,expense,Food,,Swiggy,,,-640.00,INR,manual,,…
2026-10-31,23:50,expense,Food,,Swiggy,,,-380.00,INR,manual,,…
```

The amounts net to 46,832.00: income and refunds less expenses give net savings of 53,832.00, and Goal money moves −7,000.00 of it. That equals October's unallocated savings.

**Summary CSV, October** (first rows):

```text
section,item,metric,value
summary,,income,85000.00
summary,,spending,31168.00
summary,,net_savings,53832.00
summary,,to_goals,7000.00
summary,,savings_rate_percent,63.3
category,Housing,spending,18000.00
category,Housing,share_percent,57.8
```

**Quarterly, Q4 2026 to date** (on 2 November; covered months October and November, D-373):
- **Summary:** income 85,000.00; spending 49,588.00; net savings 35,412.00; To Goals 7,000.00; savings rate 41.7%.
- **Spending by category:** housing 36,000.00 (72.6%); food 6,640.00 (13.4%); shopping 3,000.00 (6.0%); entertainment 2,148.00 (4.3%); transportation 1,800.00 (3.6%).
- **Budget against actual** (limits over October and November):
    - entertainment 2,148.00 of 2,000.00 (107.4%, Over budget);
    - food 6,640.00 of 10,000.00 (66.4%, On track);
    - shopping 3,000.00 of 6,000.00 (50.0%, On track);
    - transportation 1,800.00 of 4,000.00 (45.0%, On track);
    - overall 13,588.00 of 22,000.00 (61.8%), with unbudgeted 36,000.00.
- **Subscription costs:** Sunrise Apartments 36,000.00, Amazon Prime 1,499.00 and Netflix 649.00, total 38,148.00. Current monthly cost 20,273.92.
- **Largest expenses:** Sunrise Apartments 18,000.00 on 1 Nov, then on 1 Oct (a tie, newest first); Croma 4,500.00; BigBasket 2,900.00; Zomato 2,300.00; Indian Oil 1,800.00; Amazon Prime 1,499.00; Netflix 649.00; Swiggy 640.00; Swiggy 420.00. Swiggy 380.00 is 11th.
- **Month by month:**
    - October: income 85,000.00, spending 31,168.00, net 53,832.00, To Goals 7,000.00, rate 63.3%;
    - November: income 0.00, spending 18,420.00, net −18,420.00, To Goals 0.00, rate "—".
- **Goals at today:** Emergency fund 10,000.00 (10.0%); Vacation 5,000.00 (16.7%).

## 6. Screens and states

**`/reports`.** BR-F11-01 to BR-F11-03.

| State | What the user sees |
| --- | --- |
| Loading | The form, and a skeleton report with fixed chart heights |
| Empty | The report with zeros and "No Transactions in October 2026." |
| Error | "The report could not be loaded." with Retry; a failed download shows "The download failed. Try again." |
| Offline | "You're offline. Reports need a connection." in place of the report; the actions are disabled (P1, BR-P1-39) |
| Pending | n/a: reports show confirmed data only |
| Locked (Premium) | P4's locked card for quarterly and annual (BR-F11-03) |
| Read-only | n/a |
| Downloading | The pressed button shows "Preparing PDF…" until the file arrives |

## 7. Flows

**7.1 Monthly PDF.** The user opens `/reports` and gets October 2026 by default. They read the report and select Download PDF. The server renders the print route and the browser saves `daybook-monthly-2026-10.pdf`, whose figures equal the screen. When the process is busy, the button shows "Reports are busy right now. Try again in a moment."; when the render fails, "The download failed. Try again."

**7.2 Quarterly as a Free user.** Choosing Quarterly shows the locked card, with no request. After upgrading (F12), the same choice loads the Q4 report.

**7.3 Transactions CSV.** Download Transactions saves `daybook-transactions-2026-10.csv`. Opened in a spreadsheet, the payee `=HYPERLINK(...)` of a malicious row shows as text: `'=HYPERLINK(...)`.

**7.4 The current month.** Choosing November on 2 November shows "November 2026 · to date" with figures to today.

## 8. Validation and messages

| Situation | Message shown |
| --- | --- |
| Invalid `type` or `period` | Some filters in this link weren't valid and were removed. |
| No Transactions | No Transactions in October 2026. |
| Locked | Get quarterly and annual reports with Daybook Premium. |
| 503 `report_busy` | Reports are busy right now. Try again in a moment. |
| Load failure | The report could not be loaded. |
| Download failure | The download failed. Try again. |
| Offline | You're offline. Reports need a connection. |
| Preparing | Preparing PDF… |

## 9. Plan gating

| Code | Gates | Server refusal |
| --- | --- | --- |
| `reports.quarterly.generate` | Quarterly report, PDF, CSVs, print route | 403 `premium_required` |
| `reports.annual.generate` | Annual report, PDF, CSVs, print route | 403 `premium_required` |

The monthly report is free. A Premium lapse locks quarterly and annual again (F12, BR-F12-25).

## 10. Offline behavior

Online only (root 7.3). Nothing is saved for offline use, and the page shows its offline state.

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency |
| --- | --- | --- | --- | --- | --- |
| `/api/reports/[type]/[period]` | GET | none | The report as JSON (section 3), with `currency`, `partial`, `generatedAt` | 400, 401, 403 `profile_required` or `premium_required` | Read |
| `/api/reports/[type]/[period]/pdf` | GET | none | The PDF | 400, 401, 403, 500, 503 `report_busy` | Read |
| `/api/reports/[type]/[period]/csv` | GET | `part=transactions` or `part=summary` | The CSV | 400, 401, 403 | Read |
| `/print/reports/[type]/[period]` | GET (page) | Header `X-Print-Token` | The print page | 401 for a bad or expired token, 403, 404 for a route outside the allow-list | Read |

**Error code added by this spec**

| Status | Code | Default message | Write queue does |
| --- | --- | --- | --- |
| 503 | `report_busy` | Reports are busy right now. Try again in a moment. | Never queued (reads only) |

**Modules.**
- `server/reports/data.ts`: `reportData`.
- `server/reports/pdf.ts`: the warm browser, slots and rendering.
- `server/reports/csv.ts`: escaping, neutralization and streaming.
- `app/print/reports/[type]/[period]/page.tsx` and its layout: the print route (D-382).

## 12. Cross-feature effects

- **F03:** `rollup` gains `by: subscription` for charges per Subscription. The list query serves the largest expenses.
- **F04 to F06, F09:** their shared functions and chart components fill the report.
- **F08:** the report's summary equals the dashboard's for the same month (golden invariant 2).
- **P2:** the print token, and the proxy exemption for `/print/*` (BR-P2-29).
- **P1:** `/print/*` is never cached.
- **P4, F12:** quarterly and annual gates, with Upgrade.
- **P3:** measures PDF render time.

## 13. Edge cases

- **A long annual report:** the PDF holds tables and charts only, never the Transaction list, so it stays a few pages. The Transactions CSV streams.
- **Chromium crashes mid-render:** the request answers 500 `internal`, and the next request relaunches the browser.
- **A token after 60 seconds:** refused; each render signs its own. A token is never placed in a URL, so it cannot leak through history or `Referer`.
- **A Goal created after the period:** not listed. A Goal archived during the period: listed with its progress at the period's end.
- **A refund larger than a category's spending:** a negative category shows its negative value in the table and none in the donut (D-185).
- **A Subscription renamed since:** charges show under its current name.
- **Text with emoji or right-to-left characters:** exported as UTF-8. The PDF uses the bundled fonts, with system fallbacks for scripts they lack.
- **The user's time zone changed:** periods follow `occurred_on`, so the report does not move (TIME-3).

## 14. Acceptance criteria

- **AC-F11-01** (integration) On golden, `GET /api/reports/monthly/2026-10` returns every figure in section 5. Its summary equals check A's header and the October dashboard (golden invariant 2).
- **AC-F11-02** (integration) The Transactions CSV for October equals section 5's rows, with the BOM, CRLF endings and the given order.
- **AC-F11-03** (unit) CSV escaping:
    - `=1+1`, `+1`, `-1`, `@x`, a leading tab and a leading CR in text fields get a leading `'`;
    - a negative amount does not;
    - commas, quotes and line breaks are quoted.
- **AC-F11-04** (integration) A Free user gets 403 `premium_required` from the quarterly JSON, PDF and CSV, and a print page for a token minted before a lapse gives 404. A Premium user gets each.
- **AC-F11-05** (integration) The print route refuses an expired token, a bad signature, a token whose period differs from the URL's, and a token sent in the URL instead of the header. A route outside the allow-list answers 404. The page loads no `/api/me` and registers no service worker.
- **AC-F11-06** (E2E) Download PDF saves a PDF whose text contains "Daybook monthly report · October 2026", "85,000.00" and "Page 1 of".
- **AC-F11-07** (integration) PDF capacity:
    - a third concurrent PDF request in one process waits for a slot, holding no database connection;
    - a request that waits 20 seconds, or arrives beyond the 4 waiting, gets 503 `report_busy` with `Retry-After`;
    - a print page that never becomes ready gives 500.
- **AC-F11-08** (integration) The annual Transactions CSV on the stress account streams without loading every row into memory, measured as a memory ceiling in the test. A database error after the first page aborts the response.
- **AC-F11-09** (unit) The summary CSV:
    - for October, it starts with section 5's rows and holds one `budget` row per metric per budgeted category;
    - a payee `=HYPERLINK(1)` in `largest_expense` becomes `'=HYPERLINK(1)`, while `net_savings` of `-18420.00` stays a number;
    - November's `savings_rate_percent` row is left out.
- **AC-F11-10** (accessibility) `/reports` passes axe with no serious or critical violations. Each chart offers View as table (F09).
- **AC-F11-11** (integration) `GET /api/reports/quarterly/2026-Q4` on golden, with Premium, returns section 5's Q4 figures.
- **AC-F11-12** (E2E) The PDF of a month with no Transactions, and of a month whose only expense is refunded in full, each render with no charts expected and no 15-second wait.

## 15. Illustrations

Illustrative, the on-screen report's top:

```text
Daybook monthly report · October 2026              Generated 2 Nov 2026, 12:00 pm
Prepared for Golden · INR
[ Download PDF ] [ Download Transactions (CSV) ] [ Download summary (CSV) ]
Income ₹85,000.00 · Spending ₹31,168.00 · Net savings ₹53,832.00 · Savings rate 63.3%
```
