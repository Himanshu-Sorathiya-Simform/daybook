# POC Application 4: Personal Finance and Investment Dashboard (Brief)

15 Oct 2026 · @Himanshu

This is the short brief of the revised POC 4. Every decision, rejected option, reason and verification detail is in the Revised Specification; section names below refer to its headings.

## At a glance

POC 4 is a multi-user personal finance and investment dashboard on a real backend, built to teach dashboard architecture, data visualization, state management and offline behavior on data that must be correct.

1. Users manage Transactions (income and expenses), Budgets, Subs and Goals, and view a mock investment portfolio, on a dashboard of metrics and charts.
2. A Next.js backend with Neon Postgres (row-level security), Better Auth and Stripe in test mode (Premium plan) serves real user data. Investments, prices and AI insights are mocked and seeded.
3. The client is an installable PWA that shows its latest cached data offline, queues offline writes and replays them on reconnect, and is measured for performance.

**What changed from the original brief**

- JSON Server is removed. Auth, Stripe and per-user isolation need a real server.
- The brief's "no financial calculations" no longer holds: every dashboard number is a calculation, and they run in SQL on the server.
- Success is judged on real, isolated user data, with only the three mocks above.

**Terms.** Transactions are income, expense or goal contribution, each with one category. Subs are subscriptions the user pays to third parties and tracks. The Premium plan is the app's own paid tier. See Terms in the spec.

## Project objective

Build a data-intensive dashboard that teaches the original six skills and four added ones.

- Dashboard development
- Data visualization
- Complex state management
- Filtering
- Reporting
- Frontend performance optimization

Added: correct money handling, per-user data isolation enforced by the database, an offline write path that cannot lose or duplicate changes, and performance measured against stated budgets.

## Technology stack

The original stack stays the floor; changes and additions are below. Each choice's status (Decided or Assumed) and reasoning is under Technology stack in the spec.

| Layer       | Original          | Revised                                                                                      |
| ----------- | ----------------- | -------------------------------------------------------------------------------------------- |
| Frontend    | Next.js           | Next.js 16, App Router                                                                       |
| Language    | TypeScript        | TypeScript                                                                                   |
| Backend     | JSON Server       | Next.js route handlers and server code                                                       |
| Database    | none              | Postgres on Neon (managed, free tier) with row-level security                                |
| Data access | none              | Drizzle ORM (to confirm)                                                                     |
| Auth        | none              | Better Auth, email and password only                                                         |
| State       | Zustand           | Zustand for UI state, TanStack Query for server data persisted to IndexedDB, URL for filters |
| Charts      | Apache ECharts    | Apache ECharts 6                                                                             |
| CMS         | Headless CMS      | Not chosen yet; hosted is allowed                                                            |
| Payments    | Stripe            | Stripe test mode with Entitlements; webhooks through the Stripe CLI                          |
| PWA         | Service Workers   | Service worker through Serwist, offline reads and offline writes                             |
| Monitoring  | Sentry, SonarQube | Sentry cloud; SonarQube Cloud through GitHub Actions                                         |
| Testing     | Playwright        | Playwright, Vitest, MSW and an RLS test suite                                                |
| PDF         | none              | Playwright's Chromium on the server                                                          |

## User roles and the Premium plan

There is one user role. Premium is an entitlement from the user's Stripe subscription, checked on the server. Details are under User roles and the Premium plan in the spec.

| Feature                                        | Free    | Premium plan |
| ---------------------------------------------- | ------- | ------------ |
| Dashboard widgets, Transactions, Budgets, Subs | Yes     | Yes          |
| Goals                                          | Up to 3 | Unlimited    |
| Line, bar and donut charts                     | Yes     | Yes          |
| Calendar heat map and comparative charts       | No      | Yes          |
| Monthly report                                 | Yes     | Yes          |
| Quarterly and annual reports                   | No      | Yes          |

When Premium lapses, data stays visible, extra Goals become read-only, and premium charts and reports show an upgrade prompt.

## Functional requirements

FR-1 to FR-17 are the original requirements, revised; FR-18 to FR-20 are added. The heading with the same FR number in the spec holds the original text, status tags and rejected options.

| FR    | Requirement                         | Revised, in one line                                                                                                                                      |
| ----- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-1  | Dashboard                           | Five widgets from SQL: monthly spending, net savings with a Goals split, budget utilization, Subs costs, investment growth.                               |
| FR-2  | Transaction tracking                | Add, edit and delete Transactions (income, expense, goal contribution), one category each from expanded hard-coded lists, in a server-side infinite list. |
| FR-3  | Budgets                             | One Budget per expense category per month, effective-dated, with alerts at 80% and 100%.                                                                  |
| FR-4  | Subs                                | Track recurring subscriptions; renewals become expense Transactions through a server-side catch-up. Stripe is not involved.                               |
| FR-5  | Goals                               | Progress comes from linked goal contributions; 3 Goals free, unlimited with Premium.                                                                      |
| FR-6  | Investment portfolio                | Stocks, ETFs, crypto and mutual funds, all mock and seeded.                                                                                               |
| FR-7  | Dynamic charts                      | ECharts 6 line, bar, donut, calendar heat map (primary) and comparative charts, with filter, zoom and image export.                                       |
| FR-8  | CMS                                 | Articles, market news and guides from a headless CMS (choice open), public content only.                                                                  |
| FR-9  | AI insights                         | Simulated: five rule-based detectors over SQL aggregates, labeled as simulated.                                                                           |
| FR-10 | Report builder                      | Monthly free, quarterly and annual Premium; on-demand PDF (server-side Chromium) and CSV; no stored files.                                                |
| FR-11 | Premium subscription                | Stripe test mode, Entitlements through a verified webhook, enforced on the server.                                                                        |
| FR-12 | Search and filtering                | A Transactions text filter plus a global search over Transactions, Subs and Goals; tags folded into categories.                                           |
| FR-13 | Theme and layouts                   | Light, dark or system per device; widget show/hide and reorder stored per account.                                                                        |
| FR-14 | PWA                                 | Installable; latest cached data offline; offline writes replayed on reconnect; Background Sync only as a Chromium enhancement.                            |
| FR-15 | Monitoring                          | Sentry with scrubbed PII; SonarQube Cloud on pull requests.                                                                                               |
| FR-16 | Performance                         | React Compiler, virtualization, code splitting and lazy loading against numeric budgets (values open).                                                    |
| FR-17 | Testing                             | Unit, integration and E2E tests, plus an RLS suite and invariant tests.                                                                                   |
| FR-18 | Authentication and profile (added)  | Better Auth with email and password; profile holds region, currency and timezone.                                                                         |
| FR-19 | Data security and isolation (added) | RLS on every private table, three database roles, user context set per transaction.                                                                       |
| FR-20 | Seed and demo data (added)          | A deterministic generator of tens of thousands of Transactions; new users start empty and can load demo data.                                             |

## Stretch goals

- Drag-and-drop dashboard widgets: decided as a stretch. The baseline is show/hide and reorder from a settings list.
- Session replay: stretch; Sentry's masking defaults stay.
- Feature flags: not discussed.
- Dashboard customization: show/hide and reorder are baseline; resizing and saved presets are stretch.
- Widget marketplace: not planned.

## Success criteria

The application behaves like a production-grade financial dashboard on real, isolated user data; only investments, prices and AI insights are mocked. It is accepted when these can be demonstrated (full wording under Success criteria in the spec):

- Dashboard, list totals and reports agree for the same filter.
- Another user's data cannot be read or written, proven by the RLS suite.
- Offline: the app opens with last-known data, an offline Transaction syncs exactly once, and a rejected one is shown.
- A test-card purchase unlocks Premium, and a lapse locks it, enforced by the server.
- PDF and CSV reports match the screen, and CSV formulas do not execute.
- The stress seed meets numeric performance budgets (values open).
- No secrets in the client, cross-origin writes rejected, SonarQube gate and tests passing on pull requests.
- The app installs from a production build on localhost.

## Open items

Six of the 14 open items are listed here with the current lean; the rest, and the 29 Assumed decisions awaiting confirmation, are under Open items and Decision log in the spec.

| Item                                  | Current lean                          |
| ------------------------------------- | ------------------------------------- |
| CMS choice                            | A hosted CMS                          |
| Which entities can be written offline | Transactions, Budgets, Subs and Goals |
| Drizzle versus Prisma                 | Drizzle                               |
| Global search interface               | Command palette (Ctrl or Cmd plus K)  |
| Numeric performance budgets           | Set before the first measurement      |
| Accessibility target                  | WCAG 2.2 AA for core flows            |
