# POC Application 4: Personal Finance and Investment Dashboard (Revised Specification)

Oct 15, 2026 · @Himanshu

## About this document

This document replaces the original POC 4 brief: it keeps all 17 original requirements as the floor, extends them where the brief had gaps, and records both what was decided and what was considered and rejected.

Every decision carries a status tag:

| Tag | Meaning |
| --- | --- |
| Decided | You confirmed it explicitly in the design discussion. |
| Assumed | Proposed with reasoning and not objected to, but never confirmed explicitly. Confirm or change it. |
| Open | Not decided yet. The current lean is stated. |

Facts about tools, versions and platform behavior were checked against sources through October 2026 (see Verification log). Where a point is reasoning rather than a verified fact, the text says so.

Database schemas are out of scope here and will be designed in a separate chat. This document only lists the decisions that constrain them (Decision log).

The names Transactions, Subs, Budgets and Goals are used exactly as defined in Terms.

## Portal summary and objective

POC 4 is a multi-user personal finance and investment dashboard on a real backend, built to teach dashboard architecture, data visualization, state management and offline behavior on data that must be correct.

**Summary (three lines)**

1. Users manage Transactions (income and expenses), Budgets, Subs and Goals, and view a mock investment portfolio, through a dashboard of metrics and charts.
2. A Next.js backend with Neon Postgres (row-level security), Better Auth and Stripe in test mode (Premium plan) serves real user data. Investments, prices and AI insights are mocked and seeded.
3. The client is an installable PWA: it shows its latest cached data offline, queues offline writes and replays them when the network returns, and is measured for performance.

**What changed from the original brief**

| Original statement | Revised | Why |
| --- | --- | --- |
| Mocked APIs through JSON Server | Real Postgres behind a Next.js backend. Only investments, prices and AI insights stay mocked. | JSON Server v1 is still in beta and cannot authenticate users, isolate their data, aggregate, or accept client-generated IDs. Stripe, auth and offline writes need a real server. |
| Focuses on data visualization and frontend architecture rather than financial calculations | Still the focus, but calculations exist and must be correct: net savings, budget utilization, Subscriptions totals, investment growth. They run in SQL on the server. | A database only filters and stores. Every dashboard number is a calculation, and a wrong one is the worst failure a finance app can have. |
| Success means relying almost entirely on mocked JSON Server data | Success means user finances are real, isolated data and only the listed items are mocked. | A production-grade dashboard cannot be judged on a data path that has no auth, isolation or consistency. |

**Project objective.** Build a data-intensive dashboard that teaches:

- Dashboard development
- Data visualization
- Complex state management
- Filtering
- Reporting
- Frontend performance optimization

Added by this revision:

- Correct money handling (exact amounts, calendar-date logic)
- Per-user data isolation enforced by the database
- An offline write path that cannot lose or duplicate changes
- Performance that is measured against stated budgets, not asserted

## Terms

Four names are fixed and used everywhere: Transactions, Subscriptions, Budgets and Goals. The other terms below are defined once so they mean one thing.

| Term | Meaning |
| --- | --- |
| Transactions | Records of money in or out. Each has one type (income, expense or goal contribution), one amount, one date and, for income and expense, one category. Replaces the original brief's "expenses". |
| Subscriptions | Recurring subscriptions the user pays to third parties (for example a streaming service), tracked by FR-4. Unrelated to Stripe or to the Premium plan. |
| Budgets | Spending limits per expense category per calendar month (FR-3). |
| Goals | Savings targets such as Vacation, Car purchase or Emergency fund (FR-5). Progress is the sum of the goal contributions linked to the Goal. |
| Premium plan | The app's own paid tier, billed through Stripe. It is an entitlement the server checks, not a user role. |
| Net savings | Income minus expenses in a period. Goal contributions are not counted as expenses. |
| Confirmed | Data the server has accepted and stored. |
| Pending | A change made offline or still in flight that the server has not yet accepted. Shown separately from confirmed numbers, never merged into them. |
| Offline write queue | The IndexedDB store of pending changes, replayed in order when the network returns. |
| Private data | Per-user data: Transactions, Budgets, Subs, Goals, the numbers derived from them, and the mock portfolio. |
| Public content | CMS content (articles, market news, investment guides) that is the same for every user. |
| Data access layer | The single server module every database read and write passes through. It resolves the session and sets the database user context before any query runs. |

## Technology stack

The original stack is the floor: every original layer is kept or replaced with a stated reason, and layers the brief did not name are added.

| Layer | Original | Revised | Status | Reason |
| --- | --- | --- | --- | --- |
| Frontend framework | Next.js | Next.js 16, App Router, latest patch release | Decided (framework), Assumed (version pin) | Next.js 16 is the current stable major. Release 16.2.6 (May 2026) patched 13 security advisories at once, so the latest patch must be tracked. Needs Node 20.9+ and TypeScript 5.1+. |
| Language | TypeScript | TypeScript | Decided | Unchanged. |
| Backend | JSON Server | Next.js route handlers and server code | Decided | Stripe webhooks, auth, entitlements and per-user isolation need server code. Next.js already provides it, so there is no extra service to run. |
| Database | JSON Server file | Postgres on Neon (managed, free tier) | Decided | Real transactions, exact decimals, constraints and row-level security. Managed because no local Postgres or Docker is used. |
| Data access | none | Drizzle ORM on its stable 0.x line | Assumed | Aggregation expressions, check constraints and RLS policies are expressible in the schema and query builder. See Considered but not taken for Prisma. |
| Auth | none | Better Auth, email and password only | Decided | Sessions live in your own Postgres and can be revoked. Auth.js has been security-patch-only since September 2025 and its Credentials provider requires JWT sessions. |
| Server data on the client | not specified | TanStack Query, persisted to IndexedDB | Decided | Server data has its own lifecycle (staleness, invalidation, retries, offline persistence) that a UI store would have to reimplement. |
| UI state | Zustand | Zustand for UI state only, one store per request through a provider | Assumed | Zustand's docs recommend a per-request store and say server components should not read from or write to it. |
| Filters | not specified | Committed filters live in URL search params | Assumed | Views become shareable and survive refresh and back-navigation, and server components can read them. |
| Charts | Apache ECharts | Apache ECharts 6 with modular imports | Decided (kept) | Native dark-theme switching, zoom, image export and a calendar heat map. |
| List virtualization | not named | TanStack Virtual | Assumed | Renders only visible Transactions rows. |
| CMS | Headless CMS | Not chosen. Hosted CMS is allowed. | Open | See FR-8. |
| Payments | Stripe | Stripe test mode: Checkout, Billing, Customer Portal, Entitlements. Webhooks forwarded with the Stripe CLI. | Decided (test mode, CLI), Assumed (Entitlements) | Test cards only. Entitlements keep plan features separate from application code. |
| PWA | Service Workers | Service worker through Serwist (Turbopack setup) | Assumed (tooling), Decided (behavior in FR-14) | Next.js 16 builds with Turbopack by default and Serwist has a guide for it. |
| Error monitoring | Sentry | Sentry cloud, free tier | Assumed | Hosted services are acceptable. |
| Code quality | SonarQube | SonarQube Cloud Free via GitHub Actions | Assumed | Supports pull-request analysis; the self-hosted Community Build does not. |
| Testing | Playwright | Playwright (E2E), Vitest (unit), MSW (client integration), real-Postgres tests for server code | Assumed | FR-17 needs three levels and Playwright covers one. |
| PDF generation | none | Playwright's Chromium on the server | Assumed | Reuses the on-screen report; see FR-10. |
| Hosting and CI | none | Local build and preview; GitHub repository with Actions | Decided | PWA install works on localhost; Stripe CLI forwards webhooks locally. |
| Mock data | JSON Server | Seeded into Postgres by a deterministic generator | Decided | Only investments, prices and AI insights are mocked. |

## Architecture decisions

The browser never touches the database: every private read and write goes through a Next.js server layer that resolves the session and sets the database user context before any query runs.

&#91;embedded content: architecture: browser, Next.js server, Neon Postgres, external services\]

The service worker holds only the shell, pages and public content. Private data is cached once, by TanStack Query.

### Server boundary

- **Data access layer is the gate (Assumed).** Authorization is checked where data is read or written, not only at the edge. `proxy.ts` (the Next.js 16 replacement for `middleware.ts`, which runs on the Node.js runtime) is used for optimistic redirects only. CVE-2025-29927 (March 2025) let attackers skip middleware with a crafted header, and guidance since then is that middleware is not a security boundary.
- **Queued writes are route handlers (Assumed, fact verified).** Server Action IDs are non-deterministic and can change between builds, so a queued Server Action call from an older build fails after a redeploy. Every mutation that can be queued offline is a `POST`/`PATCH`/`DELETE` route handler carrying a client-generated UUID as an idempotency key; a repeated key is a no-op. Server Actions are allowed only on online-only screens such as billing and settings.
- **CSRF for route handlers (Assumed, reasoning).** Server Actions get origin checking from Next.js; route handlers do not. Mutating handlers use SameSite session cookies plus an Origin header check.

### Where the numbers come from

- **Dashboard numbers, reports and insights come from SQL on the server (Decided).** The client does not hold the user's whole history.
- **Transactions are listed server-side (Assumed, accepted implicitly).** Filters, text search and cursor pagination run in SQL. The same filter definition drives the list, the dashboard numbers and the reports, so they cannot disagree. Each list shows its count and total from one small query that uses the same filter.
- **Mock data** (investments, prices) is seeded into Postgres and read through the same layer.

### State ownership

- **TanStack Query owns server data on the client and is persisted to IndexedDB (Decided).** `gcTime` must be at least the persister's `maxAge`, and a build-hash `buster` invalidates stale persisted caches after a deploy. Only an allow-list of queries is persisted (dashboard numbers, the first pages of Transactions, Budgets, Subs, Goals).
- **Zustand holds UI state only (Assumed).** Theme, layout editing state and panel state, with one store per request created in a provider, and only in client components.
- **URL search params hold committed filters (Assumed).** A search box keeps a local draft and commits to the URL after a debounce.
- **Data path per screen (Assumed rule).** TanStack Query is used only where a screen needs client-driven refetching on interaction, optimistic or cross-widget updates, or an offline cache. Screens with none of these (billing, settings, CMS content) are server components.

### Offline and caching

The service worker handles the shell, pages and public content. The persisted TanStack cache owns private data, so there is exactly one offline copy and the app always knows what it is showing (Decided).

| Request | Strategy | Owner |
| --- | --- | --- |
| Hashed static assets, fonts, icons | Precache or cache-first (content is immutable) | Service worker |
| Documents and RSC payloads | Network-first with a timeout, falling back to the cached page or an offline page | Service worker |
| Private API GET data | Network first through TanStack; the persisted copy is used when the network fails; never cached by the service worker | TanStack Query |
| Public content (CMS) | Stale-while-revalidate with expiry and a size cap | Service worker |
| Auth, Stripe, billing and every mutation | Never cached | none |

- **Why the service worker does not cache private API data.** A service-worker hit is invisible to the app, pending writes cannot be reflected in it, and it would duplicate the TanStack copy with different freshness rules. The Cache API also does not honor HTTP cache headers, so `Cache-Control: no-store` does not stop a store, and entries are keyed by URL, not by user.
- **Serwist's default `/api` rule must not apply to private data.** Its Next.js defaults cache same-origin API GETs network-first with a 10-second timeout. That default is overridden or excluded.
- **Authenticated pages can embed user data.** Cached documents and RSC payloads are treated as per-user: every service-worker cache and the persisted TanStack cache are wiped on logout and on user switch.
- **Development builds do not cache.** Serwist's default cache is network-only outside production, so offline behavior is tested with build and preview.
- **Offline writes (Decided).** Changes made offline are stored in an IndexedDB queue and replayed in order when the network returns. Each queued item carries its idempotency key, payload, status, attempt count, last error and a schema version. Network errors and 5xx retry with backoff; 4xx business rejections (validation, premium cap reached, parent deleted) are marked rejected, shown to the user and never retried forever; a 401 pauses the queue until login without discarding items.
- **Replay triggers (Decided).** Everywhere: the `online` event, app start, the tab becoming visible, and backoff while open. Chromium only: a Background Sync registration whose handler runs the same queue runner, so replay works with the tab closed. Background Sync is unsupported in Safari and Firefox, so the interface shows "N changes waiting" there. `navigator.onLine` is a hint only; a failed request is the truth. Server-side idempotency makes concurrent replays safe.
- **Storage durability (Assumed).** The cache is disposable but the write queue is not. The app requests persistent storage and warns before logout if the queue is not empty.
- **Pending versus confirmed (Decided).** Confirmed numbers are always primary. Pending changes appear as a separate labeled annotation (for example "1,240.00 spent, 45.00 pending"), are never merged into confirmed totals, and never trigger budget alerts. Pending rows in lists carry a "Pending sync" badge (Assumed). After a successful sync the annotation stays until the affected queries have refetched.
- **Which entities can be written offline (Open).** Transactions only, or Transactions, Budgets, Subs and Goals. The mechanism is the same either way, so the decision is deferred.

### Security and database

- **Row-level security is implemented on every private table (Decided).** Policies use both `USING` and `WITH CHECK` and every table is `FORCE`d so owners are subject to them.
- **Three database roles (Assumed).** An owner role runs migrations; a runtime role serves all user traffic and is not a superuser, an owner or a `BYPASSRLS` role; a system role with `BYPASSRLS` is used only in a small, clearly named module for the Stripe webhook and for seeding.
- **User context is transaction-local (Assumed, fact verified).** Each request opens a transaction and calls `set_config('app.user_id', …, true)`. Because the setting can linger as an empty string on a pooled connection, policies treat an empty value as no user (`nullif(…, '')`), so a request without a user matches nothing.
- **Fail-closed checks (Assumed).** A table with RLS and no policy returns zero rows to non-bypass roles, which is safe but easy to miss, so a test asserts that every private table has RLS enabled, forced and a policy.
- **No `SECURITY DEFINER` functions or views for user data (Assumed).** They run with their owner's rights and bypass RLS.
- **Entitlements are read-only for the runtime role (Assumed).** Only the Stripe webhook, through the system role, writes them, so an application bug cannot grant Premium.
- **Auth tables stay outside user-scoped RLS (Assumed).** Login must read user and session rows before any user context exists. Private tables reference the auth user id.
- **Neon specifics (Decided platform, Assumed handling).**
  - Roles created through the Neon Console, CLI or API, including the project's default role, belong to `neon_superuser`, which carries `BYPASSRLS`. The runtime role is therefore created with SQL.
  - The runtime connects with node-postgres over TCP to the pooled endpoint. The pooler (PgBouncer, transaction mode) does not support session-level `SET` or SQL `PREPARE`, but transaction-local `set_config` is fine. Neon's HTTP driver is for one-shot queries and is not used, because RLS needs a transaction held across statements.
  - Migrations run over the direct endpoint (reasoning from the pooler's limits).
  - On the free plan, compute scales to zero after 5 minutes idle, so the first request after idle is slower. Performance measurements start with a warm-up request and report database time separately.
  - Each request is a transaction plus a context call over the network to a cloud region, so round trips are measured rather than assumed to be negligible.

### Conventions

- **Money (Assumed).** Amounts are exact integers in minor units, never floats. The exponent per currency (JPY 0, USD 2, KWD 3) lives in one tested lookup table in code. Display uses `Intl.NumberFormat`.
- **Dates (Assumed).** A Transaction's date is a calendar date in the user's timezone, not an instant, so month bucketing has no timezone failure mode. Audit timestamps are UTC. Months are calendar months. Subscriptions renewal arithmetic clamps to month end (31 January plus one month is 28 or 29 February). The Temporal API is not yet stable in Safari as of the sources checked, so a polyfill is used if it is needed at all.
- **IDs (Assumed).** UUID primary keys, generated by the client for creates so offline items can reference each other.
- **Currency (Assumed).** One currency per user, taken from the profile. It cannot change once the user has Transactions, because a stored integer means different amounts under different exponents.

## User roles and the Premium plan

There is one user role. Premium is an entitlement that comes from the user's Stripe subscription and is checked on the server, so the original "Premium User" role becomes a state that can start, lapse and return.

**Free versus Premium (Decided)**

| Feature | Free | Premium plan |
| --- | --- | --- |
| Five dashboard widgets, Transactions, Budgets, Subscriptions | Yes | Yes |
| Goals | Up to 3 | Unlimited |
| Line, bar and donut charts | Yes | Yes |
| Calendar heat map | No | Yes |
| Comparative charts | No | Yes |
| Monthly report (PDF and CSV) | Yes | Yes |
| Quarterly and annual reports (PDF and CSV) | No | Yes |
| Simulated AI insights | Yes (Assumed) | Yes |
| Search, filters, theme, layout, offline mode | Yes | Yes |

The original brief's "advanced analytics" is mapped to the heat map and comparative charts (Assumed mapping).

**How the entitlement works**

- **Billing (Decided).** Stripe in test mode with test cards only. Hosted Checkout starts a subscription and the Customer Portal manages it. Webhooks are forwarded to the local server with the Stripe CLI.
- **Entitlements come from Stripe (Assumed, fact verified).** Stripe's Entitlements feature maps product features to feature keys and sends `entitlements.active_entitlement_summary.updated` when a customer's entitlements change. That event's payload carries at most 10 entitlements, so the full list is read with the List Active Entitlements API. The result is stored in the database when the webhook is processed.
- **The webhook is strict (Assumed).** It verifies the signature against the raw request body and processes events idempotently because Stripe can redeliver them. Only the system database role writes entitlements.
- **One `can(user, feature)` function (Assumed).** The server uses it as the authority, for example to enforce the Goals cap in the data layer. The client uses it only to decide what to show. Hiding a button is not enforcement.
- **Test clocks (Assumed).** Stripe test clocks exercise renewals, failed payments and the lapse into a downgrade without real money.
- **Billing currency is separate (Assumed).** The Premium plan has one Stripe price in one currency, independent of the user's finance currency.
- **Premium payments are not Transactions (Decided).** They are the app's revenue, not the user's tracked spending. Subs are a different feature and Stripe plays no part in them.

**When Premium lapses (Assumed)**

- Existing data stays visible.
- Goals beyond the free cap of 3 become read-only, not deleted, and new Goals past the cap are blocked.
- Premium charts and reports show an upgrade prompt.
- All of this is enforced on the server.

No admin role exists in the app. CMS editors work in the CMS itself, outside the app's roles.

## Functional requirements

FR-1 to FR-17 are the original requirements, revised. FR-18 to FR-20 are added because the original brief had no authentication, no data-isolation requirement and no seed data. Each requirement states the original text, the revision with status tags, and the options considered and not taken. The full reasoning for rejected options is in Considered but not taken.

### FR-1 Dashboard

**Original.** Display financial metrics: monthly spending, savings, budget utilization, subscription costs, investment growth.

**Revised.**

- **Monthly spending (Assumed).** The sum of expense Transactions in the selected calendar month. Goal contributions are not counted as spending.
- **Savings (Decided).** Net savings for the period (income minus expenses) shown with a split into "to Goals" and "unallocated". Example month: income 5,000, expenses 3,200, goal contributions 800 gives net savings 1,800, of which 800 went to Goals and 1,000 is unallocated. Goal progress is cumulative and is shown with Goals (FR-5).
- **Budget utilization (Assumed).** Spent versus limit per Budget and overall, for the selected month.
- **Subscription costs (Assumed).** Monthly and annual totals computed from Subs.
- **Investment growth (Assumed).** Computed from seeded holdings and prices. The headline is time-weighted return, which removes the effect of deposits and withdrawals; money-weighted return (XIRR) can be shown beside it (Open). The two answer different questions: time-weighted return measures how the investments performed, money-weighted return measures how the investor did including cash-flow timing, and they can disagree in sign.
- **Source of numbers (Decided).** All dashboard numbers are calculated in SQL on the server. Confirmed numbers are primary; offline, pending changes appear as a separate annotation (see Architecture decisions). Cached numbers carry an "as of" time.
- **Widget registry (Assumed).** Each widget is a registry entry (id, lazy loader, default size, Premium flag), so layout (FR-13), lazy loading (FR-16) and gating (FR-11) share one definition.
- **Date range (Assumed).** Calendar-date range with presets: this month, last 30 days, year to date, custom.

**Considered, not taken.** Computing numbers in the browser from the whole ledger; merging pending changes into totals; a Savings widget that shows goals only or net savings only.

### FR-2 Transaction tracking

**Original.** Add, edit and delete expenses in five categories: Food, Shopping, Transportation, Utilities, Entertainment.

**Revised.**

- **Transactions replace expenses (Decided).** Types are income and expense (Decided) and goal contribution, which is linked to a Goal and carries no category (Assumed).
- **One category per Transaction (Decided).** The category list grows beyond five. Income has its own separate set. Both are hard-coded and not user-customizable (Decided).
- **Proposed expense categories (Assumed).** The original five plus Housing, Health, Education, Travel, Insurance, Personal care, Gifts and donations, Fees and taxes, Other.
- **Proposed income categories (Assumed).** Salary, Freelance, Investments, Gifts, Refunds, Other.
- **Category storage (Assumed).** Stable keys defined in code and mirrored into a reference table by migration; labels, icons and colors live in code. A category is never renamed by changing its key.
- **Single account (Decided).** No account balances, no transfers.
- **History list (Assumed).** Filtering, text search and sorting run in SQL. Pagination is cursor-based, ordered by date then id, so rows added later do not shift pages. The screen is an infinite list built on TanStack's infinite query with row virtualization. `maxPages` caps the pages kept and refetched, because refetching an infinite query fetches all loaded pages in sequence. A visible "Load more" button backs up scroll loading for keyboard and screen-reader users. A header shows the count and total from one SQL query that uses the same filter as the list. Only the first pages are persisted for offline use.
- **Mutations (Assumed).** Route handlers with a client UUID as idempotency key. The cache is patched optimistically with rollback on failure, and the affected dashboard numbers, Budgets and Goals are invalidated.
- **Offline (Decided).** Cached pages stay readable, pending rows show a "Pending sync" badge, and a new filter or search needs a connection.

**Considered, not taken.** Several categories per Transaction (primary plus labels, split amounts, many-to-many); accounts and transfers; the whole ledger held on the client; numbered pages.

### FR-3 Budget management

**Original.** Create budgets, modify budgets, track spending limits.

**Revised.**

- **Shape (Assumed).** One Budget per expense category per calendar month, with a limit amount.
- **Effective dating (Assumed).** A changed limit applies from a chosen month, so past months keep the utilization they had.
- **Utilization (Assumed).** Calculated in SQL from expense Transactions. Alerts at 80% and 100% of a limit are produced as insights (FR-9).
- **Search (Assumed).** Budgets are not in global search because they have no user-written text. A search for "food" already finds Food Transactions.
- **Offline (Open).** Whether Budgets can be created or edited offline depends on the offline-write scope decision.

### FR-4 Subscription tracker (Subs)

**Original.** Track recurring subscriptions and display upcoming renewals, monthly costs and annual costs.

**Revised.**

- **Fields (Assumed).** Name, amount, cadence, next renewal date and category.
- **Subs appear in the Transactions list (Decided).** A server-side catch-up creates an expense Transaction linked to the Sub for each due date up to today. It is idempotent through a unique key on the Sub and due date, runs from a POST step at session start and when a Sub is created or edited, and covers months the user missed. Generated Transactions are flagged as coming from Subs and can be edited or skipped, because prices change and people cancel (Assumed). Future renewals are never stored as Transactions.
- **Upcoming renewals (Assumed).** Computed from the schedule, with month-end clamping.
- **Monthly and annual costs (Assumed).** Each Sub's monthly and yearly equivalents are summed.
- **Stripe is not involved (Decided).** Subs are charged by third parties outside the app. Stripe collects payment only for the Premium plan (FR-11).
- **Offline (Assumed).** The catch-up runs on the server, so after reconnecting the next session start creates any missed Transactions.

**Considered, not taken.** Simulating Subs as Stripe subscriptions; keeping Subs as a schedule only and out of Transactions.

### FR-5 Goal management

**Original.** Create savings goals such as Vacation, Car purchase, Emergency fund.

**Revised.**

- **Fields (Assumed).** Name, target amount and an optional target date.
- **Progress (Assumed).** The sum of goal contributions linked to the Goal, cumulative across months and never stored as a separate number.
- **Contributions beyond savings (Assumed).** Allowed with a warning, because there are no balances to check against. The unallocated amount can go negative.
- **Cap (Decided).** Free users have up to 3 Goals; Premium is unlimited. Behavior when Premium lapses is in User roles and the Premium plan.
- **Search (Assumed).** Goals are searchable by name.
- **Offline (Open).** Same open decision as Budgets.

### FR-6 Investment portfolio

**Original.** Support multiple asset types: Stocks, ETFs, Cryptocurrency, Mutual funds (mock).

**Revised.**

- **Everything is mock and seeded (Decided).** Assets, holdings and price history are generated, in the user's currency. There is no live market data.
- **Deterministic prices (Assumed).** Prices are a seeded daily history, so charts and tests are reproducible.
- **Four asset types (Decided).** Stocks, ETFs, cryptocurrency and mutual funds, shown as holdings, an allocation donut and value over time.
- **Growth needs history (Assumed, reasoning).** A current-price snapshot cannot show growth, because deposits would count as performance. Growth is calculated from dated holdings and the price series (see FR-1).
- **Quantities (Assumed).** Cryptocurrency needs more decimal places than money. Quantities use exact decimals, and price times quantity is rounded to minor units by one explicit rule.
- **User-added holdings (Open).** Seeded and read-only for now.

**Considered, not taken.** Live market-data APIs and real brokerage or bank connections.

### FR-7 Dynamic charts

**Original.** Line, bar, donut, heat map and comparative charts; users can filter, zoom and export.

**Revised.**

- **Library (Decided).** Apache ECharts 6 with modular imports, registering only the chart types and components used: line, bar, pie, heat map, calendar, data zoom, toolbox, tooltip, legend, dataset and the canvas renderer.
- **Heat map (Decided).** The calendar heat map of daily spending is the primary one, and it is a Premium feature. A category-by-month matrix is not planned. A weekday-by-hour grid is impossible because only calendar dates are stored, not times of day.
- **Comparative charts (Assumed definition).** Budget versus actual, and this period versus the previous period. Premium.
- **Filter, zoom, export (Assumed).** Charts follow the dashboard date range; time axes use data zoom; the toolbox exports a chart as an image. Data export is CSV (FR-10).
- **Theme (Assumed).** The live chart instance switches theme on light and dark changes. ECharts 6 supports dynamic theme switching, so charts are not disposed and recreated.
- **Loading (Assumed).** Charts are lazy, client-only chunks with stable option objects and resize handling.
- **Accessibility (Assumed).** Canvas is opaque to screen readers, so each chart has a data table or text summary beside it. The ECharts aria option is to be checked in its documentation.
- **Data source (Decided).** Charts read rollups computed in SQL.

**Considered, not taken.** A weekday-by-hour grid; a category-by-month matrix; charting from client-side aggregation.

### FR-8 CMS integration

**Original.** Use a headless CMS for financial education articles, market news and investment guides.

**Revised.**

- **CMS choice (Open).** Decide later. Hosted free-tier services are acceptable (Decided).
- **Candidates.** Sanity keeps content in a hosted Content Lake. Payload installs inside the Next.js app and needs its own tables. Strapi is a standalone Node service. The lean is a hosted CMS, because it demonstrates the real external-integration pattern (fetch, webhook-triggered revalidation, preview) and keeps CMS tables and roles out of the database where RLS applies (Assumed lean).
- **Market news (Assumed).** Editor-authored content in the CMS, not a live news feed.
- **Mechanics (Assumed).** Content is fetched on the server and cached with tags. A CMS webhook revalidates the tag so edits appear without a redeploy. Editors get draft preview.
- **Caching boundary (Assumed).** Only public content may use shared caching (`use cache` is an explicit opt-in in Next.js 16) and service-worker stale-while-revalidate. Per-user data never goes through a shared cache, because a badly keyed entry could serve one user's data to another.
- **Safety and offline (Assumed).** Rich text is rendered safely, never as raw HTML. Articles are cached offline with a size cap and expiry.
- **Search (Open).** Articles join global search later, if the chosen CMS offers search.

**Considered, not taken.** Payload and Strapi as the default (kept as candidates); shared caching for per-user data.

### FR-9 AI insights panel

**Original.** Display AI-generated insights such as spending trends, savings recommendations and budget alerts. Responses can be mocked.

**Revised.**

- **No model is called (Decided).** The mock stays a mock.
- **Rule-based, not canned (Assumed).** A deterministic generator runs on the server over the SQL aggregates, so insights agree with the charts.
- **Five detectors (Assumed).** Category spending versus the previous period; Budgets at 80% and 100%; savings rate versus last month; an outlier Transaction versus its category median; Subs renewals due in the next 7 days.
- **Contract (Assumed).** Each insight has a kind, severity, message and evidence (the numbers behind it), and the panel handles loading, empty, error and stale states. A real model could replace the generator behind the same contract.
- **Labeling (Assumed).** "Simulated AI insights" and "not financial advice". Free for all users.
- **If a model is ever added (Assumed).** Send aggregates, not raw Transactions, and keep recommendations to budgeting.

**Considered, not taken.** Static canned insights; a real language model.

### FR-10 Report builder

**Original.** Generate Monthly, Quarterly and Annual reports, exported as PDF and CSV.

**Revised.**

- **On-demand downloads only (Decided).** No stored files and no history. Each report shows a "generated at" time (Assumed). A regenerated report can differ if Transactions were edited since.
- **Plan gating (Decided).** Monthly is free; Quarterly and Annual are Premium. The check lives in the endpoint that generates the report (Assumed).
- **Connection required (Assumed).** Report numbers come from SQL, so reports are generated online.
- **Same queries as the screen (Assumed).** Reports use the dashboard's filter definition and queries, so a report cannot disagree with what the user saw.
- **PDF (Assumed).** A print-optimized route renders with the same queries and chart components as the screen. Playwright's Chromium opens it as the user and prints it to PDF. This requires Chromium at runtime (Playwright as a runtime dependency, not only a test one), the user's identity passed to the headless page (session cookie or a short-lived signed token), rendering only the app's own routes and never arbitrary URLs, and a synchronous request with a progress state, since generation takes seconds. It is heavy if the app ever moves to serverless hosting.
- **CSV (Assumed).** Escaped per RFC 4180. Spreadsheet programs treat cells that begin with `=`, `+`, `-` or `@` (and tab, carriage return and full-width variants) as formulas. OWASP notes there is no universal fix, and the Excel-resistant tab prefix inside the quoted field alters the data for programmatic re-import. The policy is to sanitize text columns (description, category) and write amounts as real numbers, since a negative amount legitimately begins with a minus sign. The tradeoff is documented.

**Considered, not taken.** A client-side PDF library; stored report history; asynchronous report jobs.

### FR-11 Premium subscription

**Original.** Integrate Stripe. Premium features: advanced analytics, additional reports, unlimited goals.

**Revised.**

- **Stripe setup (Decided).** Test mode, test cards only, webhooks forwarded with the Stripe CLI.
- **Feature mapping.** Unlimited Goals and additional reports (Quarterly and Annual) are Decided. "Advanced analytics" is mapped to the heat map and comparative charts (Assumed).
- **Mechanics.** Checkout, Customer Portal, Entitlements, the webhook and the `can()` function are described in User roles and the Premium plan.
- **Server enforcement (Assumed).** The runtime database role can only read entitlements. The webhook writes them through the system role.
- **Scenarios to test (Assumed).** Successful purchase, declined card, renewal, failed renewal, cancellation and the lapse behavior, using test cards and test clocks.

**Considered, not taken.** Better Auth's Stripe plugin (Stripe is kept direct so entitlement logic stays explicit); using Stripe subscriptions to represent Subs.

### FR-12 Search and filtering

**Original.** Global search, category filters, date filters, tag filters.

**Revised.**

- **Tag filters become category filters (Decided).** Tags were treated as categories, and each Transaction has one.
- **Date filters (Assumed).** Calendar dates, with presets and a custom range.
- **Transactions text filter (Decided).** Typing on the Transactions screen filters that list only. It combines with the date and category filters, lives in the URL, and runs in SQL (Assumed).
- **Global search (Decided).** A search available from any page. Command palette (Ctrl or Cmd plus K) versus a header search box is not decided (Open). It covers Transactions, Subs and Goals (Assumed). Budgets are excluded, and articles may join later.
- **How it runs (Assumed).** Server-side, using a `pg_trgm` trigram index, which Neon supports. It matches substrings and tolerates typos. A query needs at least 3 characters, because a pattern with no extractable trigrams degenerates into a full index scan. A numeric query also matches an exact amount through the currency's minor-unit conversion. Searches run in the user's RLS context.
- **Behavior (Assumed).** Debounced input, stale requests cancelled, results grouped by type, and an accessible combobox pattern.
- **Offline (Assumed).** Search needs a connection, and the interface says so instead of silently returning partial results.
- **URL state (Assumed).** Committed filters live in the URL. The text box keeps a local draft and commits after a debounce.

**Considered, not taken.** Searching a whole ledger held on the client.

### FR-13 Theme and layouts

**Original.** Light mode, dark mode, custom dashboard layouts; persist preferences using local storage.

**Revised.**

- **Theme (Assumed).** Light, dark or follow the system, stored per device in local storage. A small inline script sets it before first paint to avoid a flash. It is per device because people often want dark on a phone and light on a desktop.
- **Layout customization (Decided).** The user can show or hide widgets and reorder them from a settings list.
- **Layout storage (Assumed).** Stored per account in the database with local storage as a fast cache, so the layout follows the user across devices. This extends the original brief's local-storage statement.
- **Layout format (Assumed).** A versioned list of widget id, size and hidden flag, validated on load, with a "Reset to default" action. No per-breakpoint layouts.
- **Drag-and-drop and resizing (Decided).** A stretch goal. The widget registry means it adds a UI without changing the stored format.

**Considered, not taken.** Theme stored per account; per-breakpoint layouts; drag-and-drop in the first version; layout kept in local storage only.

### FR-14 Progressive Web Application

**Original.** Offline mode, local caching, installable application.

**Revised.**

- **Installable (Decided).** Web manifest and icons. Install is tested on localhost through a production build and preview.
- **Offline reading (Decided).** The app shows the latest data it cached before going offline, labeled with an "as of" time.
- **Offline writing (Decided).** Writes made offline are stored in IndexedDB and replayed when the network returns. Background Sync is Chromium-only, so replay also runs from page events everywhere else.
- **Strategies, queue behavior, replay triggers and pending display** are specified in Architecture decisions.
- **Tooling (Assumed).** Serwist with its Turbopack setup.
- **Cache hygiene (Assumed).** The persisted cache uses a build-hash buster and a `gcTime` of at least its `maxAge`. All service-worker caches and persisted data are wiped on logout and user switch.
- **Offline-write scope (Open).** Transactions only, or Transactions, Budgets, Subscriptions and Goals.
- **Browser support (Decided to handle).** Safari and Firefox do not support Background Sync, so those browsers show "N changes waiting" and replay when the app is opened online.

**Considered, not taken.** A service-worker cache for private API data; Server Actions for queued writes; Background Sync as the only replay path; sync engines such as PowerSync, Electric and Zero.

### FR-15 Monitoring

**Original.** Integrate Sentry and SonarQube.

**Revised.**

- **Sentry (Assumed).** Cloud free tier for errors, tracing and web vitals. User identity is sent as an id, not an email, and amounts and descriptions are scrubbed from events.
- **Session replay (stretch).** If enabled, the defaults stay: Sentry masks all text and blocks media by default, and any unmasking is selective. Sentry stores URLs by default and our filters put search text in the URL, so URLs are scrubbed.
- **SonarQube (Assumed).** SonarQube Cloud Free through GitHub Actions, using the official scan and quality-gate actions. It analyzes pull requests, within a 50K-line cap for private projects. Coverage appears only if the test runner emits a coverage report for it to read.

**Considered, not taken.** SonarQube Community Build, which analyzes only the main branch and has no pull-request decoration, and must be self-hosted.

### FR-16 Performance optimization

**Original.** Lazy loading, virtualization, memoization, code splitting.

**Revised.**

- **Memoization (Assumed).** The React Compiler is enabled; its built-in support is stable in Next.js 16. Manual memoization is kept only where the compiler does not reach: stable ECharts option objects, heavy derived computations and atomic Zustand selectors.
- **Virtualization (Assumed).** TanStack Virtual renders only the visible Transactions rows. It is meaningful only with a large seed (FR-20).
- **Code splitting and lazy loading (Assumed).** Routes split automatically. Charts, the report builder and any heavy dependency are split at component level, and below-the-fold widgets load lazily. The dashboard route never ships report-only code.
- **Budgets and measurement (Open values).** Numeric budgets for route bundle size, LCP and INP are set before measuring, and results are reported before and after each optimization. Web vitals go to Sentry.
- **Neon effects (Assumed).** Measurements begin with a warm-up request after idle, database time is reported separately through a `Server-Timing` header, and per-request round trips to the cloud region are measured.
- **Caching boundary (Assumed).** Cache Components are used for public content only.

**Considered, not taken.** Computing numbers in the browser from the whole ledger; shared caching for per-user data.

### FR-17 Testing

**Original.** Unit tests, E2E tests, integration tests.

**Revised (all Assumed).**

- **Unit (Vitest).** Pure functions: money and the exponent table, date and month bucketing, renewal arithmetic, filters, `can()`, CSV escaping, insight detectors.
- **Integration.** Route handlers against real Postgres; the Stripe webhook handler with signed fixture events; client components with MSW.
- **E2E (Playwright).** Sign up; add a Transaction and see the dashboard update; filter to URL to list; Premium upgrade with a test card; offline reload showing cached data; offline write and replay; report download and CSV content check.
- **RLS suite.** Runs as the runtime role against real Postgres. Cross-user reads and writes fail; a request with no context returns zero rows; the runtime role is not a superuser, owner or `BYPASSRLS` role; every private table has RLS enabled, forced and a policy.
- **Invariant tests.** Category totals equal the overall total; Goal progress equals the sum of its contributions; replaying a queued item twice produces one row; filtered list totals equal the SQL rollups for the same filter.
- **Charts.** Tests assert the option objects given to ECharts, not pixels.
- **Determinism.** A frozen clock and a deterministic seed, because "this month" changes on the first of the month.
- **Test databases (Open).** Neon branches could give each GitHub Actions run an isolated database; free-plan branch limits apply and need checking.
- **Coverage.** Reports feed SonarQube.

### FR-18 Authentication and profile (added)

**Original.** Not covered. The brief lists two roles but no way to identify a user.

**Revised.**

- **Better Auth with email and password only (Decided).** No passkeys, email verification, password reset, two-factor or social login (all Decided). Consequences: email addresses are unverified identifiers, and a forgotten password is fixed by a developer-side script.
- **Sessions (Assumed).** Stored in the database and revocable.
- **Profile (Decided that region is stored).** Region (country code), currency (ISO 4217, pre-filled from the region and overridable) and timezone (IANA name, detected and editable) are separate fields. Region is a default source, not the source of truth: countries span timezones, and moving must never change currency. Currency cannot change once the user has Transactions (Assumed).
- **Locale (Assumed).** Number and date formatting come from the browser or region and need no stored field yet.
- **Profile storage (Assumed).** A separate table keyed to the auth user, because library-managed tables change with upgrades. It is created during signup, and a user without a profile is sent to a short onboarding form.
- **No IP geolocation (Assumed).** Browser locale as a default plus an explicit choice is more accurate and avoids a privacy question.
- **Checks (Assumed).** `proxy.ts` does optimistic redirects only; the session is resolved in the data access layer. Better Auth is documented as having built-in rate limiting, which was not confirmed against its primary docs.
- **Expiry while offline (Assumed).** Cached data stays readable; queue replay that gets a 401 pauses until login.

### FR-19 Data security and isolation (added)

**Original.** Not covered.

**Revised.**

- **Specification.** Row-level security, database roles, user context, Neon handling, CSRF defense and the data access layer are specified in Architecture decisions (Security and database, Server boundary).
- **Secrets (Assumed).** Stripe secret keys and any future API keys exist only on the server.
- **Acceptance (Assumed).** The RLS suite in FR-17 passes, and no private table is reachable by any role other than the runtime role through RLS and the system role through the named module.
- **Not decided (Open).** Account data export and account deletion.

### FR-20 Seed and demo data (added)

**Original.** Not covered. FR-16 is meaningless on 50 rows.

**Revised.**

- **Deterministic generator (Assumed).** Tens of thousands of Transactions over about three years, in the user's currency, with realistic salary cadence, category patterns and Subs charges.
- **New users start empty (Decided).** A "Load demo data" action generates a demo dataset in their currency and runs in the user's own context.
- **Pre-seeded demo accounts (Decided).** A couple of accounts are created by a seed script that uses the system role, for performance testing.
- **Investments (Decided).** The portfolio and price history are seeded for every user who loads demo data.
- **Tests (Assumed).** Seeds are deterministic and the clock is frozen.

## Stretch goals

The baseline requirements already cover the first step of dashboard customization, so the stretch goals build on the widget registry instead of changing the data model.

| Stretch goal | Status | Notes |
| --- | --- | --- |
| Drag-and-drop dashboard widgets | Decided as stretch | The baseline is show/hide and reorder from a settings list (FR-13). Drag-and-drop adds a UI over the same stored layout format. The settings list stays as the keyboard-accessible way to reorder. |
| Session replay | Stretch | If enabled, Sentry's defaults stay: text masked, media blocked, selective unmasking only, URLs scrubbed (FR-15). |
| Feature flags | Not discussed | If built, flags should be evaluated on the server so a client cannot switch on a gated feature (reasoning). |
| Dashboard customization | Partly baseline | Show/hide and reorder are in FR-13. Resizing and saved presets are stretch. |
| Widget marketplace | Not discussed, not planned | It needs a widget contract (manifest, props schema, permissions). The widget registry is the foundation. Third-party widgets next to per-user financial data are also a security question. |

## Decision log

This log holds 63 decisions: 31 Decided (D-26 and D-30 only in part), 29 Assumed and 3 Open. Assumed rows are the ones to confirm or change first.

| ID | Area | Decision | Status | Reason |
| --- | --- | --- | --- | --- |
| D-01 | Platform | Next.js is the backend; JSON Server is removed | Decided | Auth, Stripe and per-user isolation need a real server, and JSON Server v1 is still in beta. |
| D-02 | Platform | Postgres on Neon, managed free tier | Decided | No Docker or local Postgres is used. Managed Postgres gives real transactions and RLS. |
| D-03 | Platform | Local build and preview, Stripe CLI, test cards only, no Docker | Decided | Matches how the project runs. Localhost supports PWA install. |
| D-04 | Platform | GitHub repository; hosted free-tier services allowed | Decided | Enables SonarQube Cloud, Sentry cloud and a hosted CMS. |
| D-05 | Platform | Mocked: investments, prices, AI insights. Everything else is real. | Decided | The original brief's mocks stay mocks. |
| D-06 | Platform | Drizzle ORM on the stable 0.x line | Assumed | Aggregation expressions, check constraints and RLS policies fit its schema. Its 1.0 is in beta. |
| D-07 | Platform | node-postgres over TCP to the pooled endpoint; migrations over the direct endpoint | Assumed | RLS needs a transaction across statements. The pooler limits session features. |
| D-08 | Platform | Next.js 16 latest patch, React Compiler on | Assumed | Current stable; a single patch fixed 13 advisories. |
| D-09 | Platform | Schemas are designed in a separate chat | Decided | Keeps this document at decision level. |
| D-10 | Security | Better Auth, email and password only | Decided | Revocable database sessions. Auth.js is security-patch-only. |
| D-11 | Security | No passkeys, email verification, password reset, 2FA or social login | Decided | POC scope. Consequences are recorded in FR-18. |
| D-12 | Security | RLS on every private table, forced | Decided | A missed filter returns nothing instead of leaking. It also protects writes. |
| D-13 | Security | Three roles: owner, runtime, system | Assumed | Superusers, BYPASSRLS roles and owners bypass RLS. |
| D-14 | Security | Runtime role created with SQL | Assumed | Neon roles made in its Console, CLI or API carry BYPASSRLS. |
| D-15 | Security | User context through a transaction-local setting, empty value treated as no user | Assumed | Pool-safe, and a leftover empty setting matches nothing. |
| D-16 | Security | Auth checks in the data access layer; proxy.ts optimistic only | Assumed | CVE-2025-29927 showed middleware is not a boundary. |
| D-17 | Security | SameSite cookies plus Origin check on mutating route handlers | Assumed | Route handlers lack Server Actions' origin checks (reasoning). |
| D-18 | Security | Entitlements writable only through the system role | Assumed | An application bug cannot grant Premium. |
| D-19 | Security | Auth tables outside user-scoped RLS | Assumed | Login reads them before any user context exists. |
| D-20 | Model | Transactions replace expenses (income and expense) | Decided | Income is needed for savings and Budgets. |
| D-21 | Model | Goal contribution is a third Transaction type linked to a Goal | Assumed | Lets Goals use Transactions without counting as spending. |
| D-22 | Model | One category per Transaction, expanded hard-coded lists, separate income set | Decided | Avoids double counting in totals and Budgets. |
| D-23 | Model | Tags are folded into categories | Decided | One filter, one meaning. |
| D-24 | Model | Single account; no balances or transfers | Decided | Scope. |
| D-25 | Model | Savings widget is net savings with a Goals split | Decided | Uses income and connects savings to Goals. |
| D-26 | Model | Subs appear in Transactions through a server-side catch-up | Decided (mechanism Assumed) | Monthly spending then includes them once. |
| D-27 | Model | Stripe is used only for the Premium plan | Decided | Third parties charge Subs, not the app. |
| D-28 | Model | Free versus Premium split | Decided | See User roles and the Premium plan. |
| D-29 | Model | Premium lapse keeps data visible, locks extra Goals, blocks new ones | Assumed | Nothing is deleted on a downgrade. |
| D-30 | Model | Region stored on the profile; currency pre-filled and fixed after the first Transaction; timezone separate | Decided (region), rest Assumed | Region is a default, not the source of truth. |
| D-31 | Model | Money as integer minor units with a per-currency exponent table | Assumed | Floats drift and currencies differ in decimals. |
| D-32 | Model | Calendar dates in the user's timezone, calendar months, UUID keys | Assumed | No timezone failure in month bucketing; offline creates can reference each other. |
| D-33 | Model | Budgets per category per month, effective-dated, alerts at 80% and 100% | Assumed | Changing a limit must not rewrite past months. |
| D-34 | Data | Aggregation runs in SQL on the server | Decided | One authoritative calculation shared by dashboard, reports and insights. |
| D-35 | Data | Transactions are listed server-side with cursor pagination | Assumed | The whole ledger on the client was considered and rejected. |
| D-36 | Data | Infinite list with virtualization, maxPages and a Load more button | Assumed | Suits a mobile PWA; cursors survive added rows. |
| D-37 | Data | TanStack Query owns server data on the client, persisted to IndexedDB | Decided | One offline copy that the app can reason about. |
| D-38 | Data | Zustand for UI state only; committed filters in the URL | Assumed | Server data has its own lifecycle; URLs are shareable. |
| D-39 | Data | Mutations are route handlers with a client UUID idempotency key | Assumed | Server Action IDs change per build. |
| D-40 | Data | Confirmed numbers first, pending shown separately and labeled | Decided | The app must not show something that has not happened. |
| D-41 | Offline | Show the latest cached data when offline | Decided | Brief requirement, refined. |
| D-42 | Offline | Offline writes stored in IndexedDB and replayed on reconnect | Decided | Chosen scope for FR-14. |
| D-43 | Offline | Background Sync as a Chromium enhancement, page-level replay everywhere | Decided | Background Sync is unsupported in Safari and Firefox. |
| D-44 | Offline | Service worker owns shell, pages, public content; TanStack owns private data | Decided | Avoids two disagreeing caches. |
| D-45 | Offline | Network-first for most GET requests | Decided | The server is the source of truth; applied within the split above. |
| D-46 | Offline | Which entities can be written offline | Open | Mechanism is the same either way; deferred. |
| D-47 | Features | Both a Transactions text filter and a global search | Decided | They are different scopes. |
| D-48 | Features | Global search covers Transactions, Subs, Goals; server-side with pg\_trgm | Assumed | Budgets have no user-written text. |
| D-49 | Features | Calendar heat map is the primary heat map | Decided | Clear and native in ECharts. |
| D-50 | Features | Comparative charts are budget versus actual and period over period | Assumed | The brief left the term undefined. |
| D-51 | Features | Reports are on-demand downloads with no stored files | Decided | Storing PDFs needs file storage and a regenerated report can differ. |
| D-52 | Features | PDFs come from Playwright's Chromium on the server | Assumed | Reuses the on-screen report. |
| D-53 | Features | CSV policy: sanitize text columns, write amounts as numbers | Assumed | No universal formula-injection fix exists. |
| D-54 | Features | Layout is show/hide and reorder; drag-and-drop is a stretch | Decided | Meets FR-13 at the lowest cost. |
| D-55 | Features | Theme per device in local storage; layout per account in the database | Assumed | Different devices, different preferences. |
| D-56 | Features | Insights from five rule-based detectors, labeled simulated | Assumed | Agrees with the charts and needs no model. |
| D-57 | Features | CMS choice | Open | Decide later. |
| D-58 | Features | Investment growth headlines time-weighted return | Assumed | Deposits must not count as performance. |
| D-59 | Quality | Sentry cloud; replay is a stretch with default masking | Assumed | A finance app must not record text. |
| D-60 | Quality | SonarQube Cloud Free through GitHub Actions | Assumed | Pull-request analysis, which the Community Build lacks. |
| D-61 | Quality | Vitest, MSW, Playwright, an RLS suite and invariant tests | Assumed | Covers the three FR-17 levels plus isolation. |
| D-62 | Quality | New users start empty; Load demo data; demo accounts; deterministic seed | Decided | Realistic starts and reproducible performance tests. |
| D-63 | Quality | Numeric performance budgets | Open | Values not yet chosen. |

## Considered but not taken

Every option below was discussed and rejected or deferred, with the reason and the condition that would reopen it. Facts are verified unless the text says otherwise.

### Backend and data

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| JSON Server as backend or dev adapter | The original brief | v1 is still in beta, ignores client-provided IDs, and cannot authenticate users, isolate their data or aggregate. | An assessor requires it for the original success criterion. |
| Browser talking directly to a mock API | Simplest path for a frontend POC | Secrets, Stripe webhooks, entitlement enforcement and per-user isolation cannot live in the browser. | Never for private data. |
| Local Postgres or Docker | Common development setup | Not used in this project, so managed Neon was chosen. | Postgres is installed locally later. |
| Prisma | Strong ergonomics, and you know it | Aggregations need raw SQL or TypedSQL. To my knowledge its schema language cannot declare check constraints or RLS (not verified). Its `BigInt` values do not serialize to JSON without conversion. Version 7 requires driver adapters, and one source reports npm's `latest` tag resolving to an 8.0 release candidate in September 2026. | The app becomes mostly relation-heavy CRUD. |
| Drizzle 1.0 beta | Newest API | Still beta. It removes the relational-query v1 API and changes the migrations folder structure. | 1.0 reaches stable. |
| Neon's HTTP serverless driver | Designed for serverless | HTTP is for one-shot queries, and RLS needs a transaction held across statements. | Statements can be batched without logic between them. |
| RLS skipped, filters in code only | Less plumbing | A forgotten filter leaks another user's data. RLS fails closed and also protects writes and entitlements. | Never for private data here. |
| Running the app as Neon's default role | Easiest connection string | That role and Console-created roles carry `BYPASSRLS`. | Never. |
| `SECURITY DEFINER` views and functions for user data | Convenient shared logic | They run with their owner's rights and bypass RLS. | A narrow, reviewed case. |
| Whole ledger on the client with local search and aggregation | Instant filtering and offline search; makes virtualization central | Two places would compute numbers and could disagree. It turns into sync-engine work (version checks or deltas). First load and storage grow with history. The user's full history sits in browser storage. The benefit is narrow, because offline needs are met by cached data and queued writes without a full copy. | Fully offline search over all history becomes a requirement. |
| Same TypeScript calculations on client and server | One implementation of the math | The server would have to load every Transaction to build reports, leaving SQL unused. Moot once Transactions are server-side. | The whole-ledger-on-client option returns. |
| Stored report PDFs and history | Users could re-download | Needs file storage beyond the database, and a regenerated report can differ if rows were edited. | Auditable, reproducible reports become a requirement. |
| Sync engines (PowerSync, Electric, Zero) | Offline sync | Heavy, and it changes the whole data layer. Zero reached 1.0, but its own docs say it does not support offline writes. | A variant of the POC is about local-first. |
| Delta endpoint or version checks for ledger freshness | Would keep a local ledger fresh | Moot once Transactions are server-side. | The whole-ledger-on-client option returns. |

### State and data fetching

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| Zustand for server data | The brief names Zustand for state | It would reimplement staleness, invalidation, retries and persistence. | Never; Zustand stays for UI state. |
| A global Zustand store in Next.js | Simplest setup | Zustand's docs recommend against global stores and say server components should not read from or write to the store. | Never. |
| SWR instead of TanStack Query | Lighter | TanStack's persistence and offline-mutation docs were verified; SWR's equivalents were not checked. | SWR proves equivalent. |
| Server components and Server Actions only | Idiomatic, fewer moving parts | The dashboard and Transactions need client-driven refetching per filter, cross-widget optimistic updates and an offline cache. | Offline and filter interactivity are dropped. |
| Numbered pages for Transactions | Jump to page N, known totals | Offsets shift when rows are added, causing duplicates and skips. Cursor-based numbered pages lose the jump-to-page advantage. | An auditing screen needs fixed pages. |
| Filters held in Zustand | Simple | Not shareable, not readable by server components, lost on refresh. | Never for committed filters. |

### Offline and PWA

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| Service-worker cache for private API data | Your network-first baseline | A service-worker hit is invisible to the app, pending writes cannot be reflected in it, and it duplicates the TanStack copy. The Cache API ignores HTTP cache headers and keys by URL, not user, and Serwist's default `/api` rule would cache private responses. | A showcase of service-worker strategies is required, with per-user cache names, a marker header and a wipe on logout. |
| Server Actions for queued writes | Idiomatic mutations | Action IDs change between builds, so stale queued calls fail after a redeploy. | Never for queued writes. |
| Background Sync as the only replay path | Standard API | Not supported in Safari or Firefox. It is used as an enhancement. | Safari and Firefox ship it. |
| Merging pending changes into totals | Makes offline feel complete | It shows something that has not happened, and alerts could fire on unconfirmed data. | Never; replaced by a separate annotation. |
| Hiding pending rows from lists | Avoids showing unconfirmed data | A row the user entered vanishing offline feels like data loss. | User feedback says otherwise. |

### Authentication

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| Auth.js (NextAuth) | It is the best-known library for Next.js. Next.js itself ships no auth library. | Security-patch-only since September 2025 under the Better Auth team. Its Credentials provider requires JWT sessions, so there are no database session rows, no revocation and no session list. Its documented middleware pattern breaks on Next.js 16's `proxy.ts` rename. The guides checked still install v5 through the `@beta` tag. | It becomes actively maintained again. |
| Hand-rolled sessions following the Next.js guide | Educational, no dependency | Password hashing, rate limiting and any later two-factor all become the project's own code. | Auth internals become a learning goal. |
| Hosted auth (for example Clerk) | Least code | An external account and network dependency, with user data held by the vendor. Overkill for a local POC. | A production deployment. |
| Better Auth's Stripe plugin | Less Stripe code | Stripe is kept direct so entitlement logic stays explicit and is a strength to demonstrate. It can be evaluated separately. | The plugin handles entitlements cleanly. |

### Product model and data

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| Several categories per Transaction (primary plus labels, split amounts, many-to-many) | The brief's tag filters | You chose one category. Many-to-many counts the full amount in each category, so donut totals exceed real spending and two Budgets are charged for one purchase. | Split Transactions become a requirement. |
| Accounts, balances and transfers | Realistic for finance | A single account was chosen. Transfers need exclusion logic so they are not counted as spending or income. | Multi-account scope. |
| Savings widget as goals-only or net-savings-only | Two readings of the brief | Goals-only ignores income. Net-savings-only disconnects savings from Goals. | Never; the combined widget was chosen. |
| Subs represented as Stripe subscriptions | Reuse Stripe's renewal handling | Semantically wrong, since the app would bill users for services it does not provide. It couples FR-4 to FR-11 and breaks adding a Sub offline. | Never. |
| Subs kept as a schedule only, outside Transactions | Simpler | Monthly spending would exclude them, and you decided they appear in the Transactions list. | Never. |
| Per-Transaction currency, multi-currency | Future scope | Needs exchange rates and reporting rules. Adding the column later is a trivial backfill while every row equals the profile currency. | Multi-currency scope. |
| Changing currency after Transactions exist | Flexibility | A stored integer means different amounts under different currency exponents. | Never. |
| IP geolocation for region | Auto-fill | Less accurate than browser locale plus a choice, and it raises a privacy question. | Never. |
| Live market-data APIs | Real prices | You chose mock and seeded. Most free tiers deliver data delayed 15 to 20 minutes and are capped (one comparison lists Alpha Vantage at 25 requests a day, Twelve Data 800 a day, Finnhub 60 a minute). One comparison says some free tiers are non-commercial only, and displaying market data in a product has its own licensing. | A live-data demo is wanted behind the same interface. |
| Real bank aggregation | Real products ingest bank data | Outside the brief. Plaid's Sandbox is free with unlimited test items and pending/posted simulation, but adds server-side token handling and webhooks. | A bank-ingestion lesson is added. |
| Real language model for insights | The brief says AI-generated | The mock stays a mock, and a rule-based generator is enough. | A model is wanted. Send aggregates only. |
| Static canned insights | Cheapest mock | Text that contradicts the charts destroys credibility. | Never. |

### Reports, charts, search and layout

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| Weekday-by-hour heat map | A common heat map | Only calendar dates are stored, not times of day. | Times of day are captured. |
| Category-by-month matrix heat map | Better for seasonal patterns | Not planned. The calendar heat map is primary. | It is wanted as a Premium extra. |
| Client-side PDF library | No server work, and it could run on cached data | It duplicates the report layout in the library's own system, charts must be rasterized, and arbitrary periods still need server data. | Reports are needed fully offline. |
| Asynchronous report jobs | Long reports | Adds queue and state. Synchronous generation with a progress state is enough here. | Reports exceed request timeouts. |
| Per-breakpoint layouts | Responsive control | Roughly triples layout complexity. | A requirement for it appears. |
| Drag-and-drop in the first version | Visual appeal | A stretch goal. Show/hide and reorder meet FR-13. | The stretch goal is pulled in. |
| Theme stored per account | Consistency | People want different themes on different devices. | Never. |
| Layout in local storage only | The brief's wording | It is per device and does not follow the user. | Never. |

### Tooling and platform

| Option | Why considered | Why not taken | Would reopen if |
| --- | --- | --- | --- |
| SonarQube Community Build | Free and self-hosted | Per third-party comparisons it analyzes only the main branch and has no pull-request decoration, and it needs hosting that is not available here. | A self-hosted server appears. |
| `middleware.ts` as the only auth gate | A common pattern | CVE-2025-29927 showed middleware can be bypassed. | Never. |
| Shared caching (`use cache`) for per-user data | Performance | A badly keyed entry could serve one user's data to another. | Never. |
| Session replay in the first version | Debugging aid | Finance data, and it is a stretch goal. Sentry's masking defaults would be kept anyway. | The stretch goal is pulled in. |

## Open items

These are not decided yet. The 29 Assumed rows in the Decision log are also waiting for confirmation, and the two largest of them (server-side Transactions, D-35, and the infinite list, D-36) matter most because other decisions depend on them.

| Item | Choices | Current lean | Why it matters |
| --- | --- | --- | --- |
| CMS choice (D-57) | Sanity (hosted), Payload (inside the app), Strapi (separate service), another hosted CMS | A hosted CMS | It shows the real integration pattern and keeps CMS tables and roles away from the RLS database. Free-plan limits of any candidate are unchecked. |
| Offline-write scope (D-46) | Transactions only, or Transactions, Budgets, Subscriptions and Goals | All four | The mechanism is the same, so offline editing of Budgets or Subs feels broken if blocked. |
| Drizzle confirmation (D-06) | Drizzle, or Prisma | Drizzle | The whole data layer and the RLS and aggregation work depend on it. |
| Global search interface (D-47) | Command palette (Ctrl or Cmd plus K) or a header search box | Command palette | A palette can also hold quick actions such as adding a Transaction. |
| Performance budgets (D-63) | Numeric limits for route bundle size, LCP and INP | Choose before the first measurement | FR-16 cannot be shown to be met without numbers. |
| Accessibility target | For example WCAG 2.2 AA for the dashboard, Transactions and search | WCAG 2.2 AA for core flows | Not discussed. Charts, infinite scroll and the command palette each need explicit work. |
| Investment growth display | Time-weighted return only, or beside money-weighted return (XIRR) | Time-weighted return headline, XIRR optional | They answer different questions and can disagree in sign. |
| User-added holdings | Seeded read-only, or users add holdings | Seeded read-only | Adds forms and validation over mock data. |
| Account export and deletion | In scope or out | Out of scope for the POC | Not discussed. A real product needs both. |
| Test databases in CI | Neon branches per run, or one shared test database | Neon branches | Free-plan branch limits are unchecked. |
| PWA tooling | Serwist, or a hand-written service worker | Serwist | You know PWAs well and may prefer to hand-write it. |
| Neon region | Any available region | The one closest to the developer | Every request makes several round trips to it. |
| Better Auth rate limiting | Confirm it against Better Auth's primary documentation | Confirm | Only a documentation summary mentioned it. |
| Goals projected completion date | Show or skip | Skip | Not discussed. It needs a contribution-rate rule. |

## Verification log

Six load-bearing facts were checked by opening the source page, and the rest were checked through search results only, so they should be re-checked before the project relies on them. All checks are as of 15 October 2026.

### Checked by opening the source page

| Claim | Source | Note |
| --- | --- | --- |
| Roles created in the Neon Console, CLI or API (including the project's default role) join `neon_superuser`, which carries `BYPASSRLS`. Roles created with SQL do not. | [Neon docs: Manage roles](https://neon.com/docs/manage/roles/) | `BYPASSRLS` applies to projects created after 15 August 2023. |
| Next.js Server Action IDs are non-deterministic and can change between builds. | [Next.js docs: Failed to find Server Action](https://nextjs.org/docs/messages/failed-to-find-server-action) | The page also covers self-hosting keys and Vercel skew protection. |
| Zustand recommends a per-request store, no global stores, and server components not reading or writing it. | [Zustand docs: Setup with Next.js](https://zustand.docs.pmnd.rs/guides/nextjs) | The docs also say a Zustand store is module state, so context is optional. This is a recommendation, not a hard rule. |
| Stripe fires `entitlements.active_entitlement_summary.updated` on changes, the payload holds at most 10 entitlements (the full list comes from a URL in the payload or the List Active Entitlements API), and Stripe recommends persisting entitlements internally. | [Stripe docs: Entitlements](https://docs.stripe.com/billing/entitlements.md?dashboard-or-api=api) | Stripe notes pricing and entitlement changes may carry legal requirements. |
| The Cache API does not honor HTTP caching headers, key matching depends on `Vary`, and browsers may delete an origin's cache storage. | [MDN: Cache](https://developer.mozilla.org/docs/Web/API/Cache) | Page last modified 11 September 2026. |
| Zero does not support offline writes and is not local-first. | [Zero docs: When to use](https://zero.rocicorp.dev/docs/when-to-use.md) | Zero 1.0 being stable comes from an InfoQ report seen in search results. |

### Checked through search results only

| Claim | Source | Note |
| --- | --- | --- |
| Next.js 16: Cache Components, `proxy.ts` on the Node.js runtime, stable React Compiler support; 16.2 stabilized Build Adapters; 16.2.6 (7 May 2026) patched 13 advisories; Node 20.9+ and TypeScript 5.1+. | [Next.js 16 announcement](https://nextjs.org/blog/next-16), [Makerkit summary](https://makerkit.dev/blog/md/tutorials/nextjs-16) | The 16.2.x facts come from the third-party summary. |
| JSON Server v1 is still beta (beta.15 listed); beta.14 ignores client-provided IDs and uses random base64url IDs. | [JSON Server release notes](https://newreleases.io/project/github/typicode/json-server/release/v1.0.0-beta.14) | Release trackers are third-party. |
| Serwist's Next.js defaults use network-first for pages and RSC, a `/api` rule with a 10-second timeout, and network-only outside production. `networkTimeoutSeconds` falls back to cache on a slow network. | [Serwist NetworkFirst docs](https://serwist.pages.dev/docs/serwist/runtime-caching/caching-strategies/network-first), [@serwist/next source](https://app.unpkg.com/@serwist/next@9.5.6/files/dist/index.worker.js) | Read from source snippets. |
| Background Sync is unsupported in Safari and Firefox. | [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/background-sync), [caniuse](https://caniuse.com/wf-background-sync) | Browser support changes. |
| Temporal ships in Chrome 144 and Firefox 139 but not in stable Safari. | [web-features explorer](https://web-platform-dx.github.io/web-features-explorer/features/temporal) | Mid-2026 status. Safari may have moved. |
| TanStack Query: refetching an infinite query fetches all pages in sequence, `maxPages` limits that, `gcTime` must be at least the persister's `maxAge`, paused offline mutations retry in order, and persisted ones need a default mutation function to resume. | [Infinite queries](https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries), [persistQueryClient](https://tanstack.com/query/v5/docs/framework/react/plugins/persistQueryClient) | Read from search excerpts of the official docs. |
| Drizzle supports check constraints and RLS policies in the schema; 1.0 removes Relational Queries v1 and changes the migrations folder; 0.45.2 was stable and 1.0 in beta in September 2026; the team joined PlanetScale in March 2026. | [Drizzle RLS](https://orm.drizzle.team/docs/rls), [Upgrading to v1](https://orm.drizzle.team/docs/upgrade-v1), [Makerkit comparison](https://makerkit.dev/blog/md/tutorials/drizzle-vs-prisma) | Version and company facts come from the third-party comparison. |
| Prisma 7 made the Rust-free client the default and requires driver adapters; one source reports npm's `latest` resolving to an 8.0 release candidate in September 2026. | [Prisma 7 changelog](https://www.prisma.io/changelog/2025-11-19), [Makerkit comparison](https://makerkit.dev/blog/md/tutorials/drizzle-vs-prisma) | The release-candidate claim is single-source. |
| Auth.js has been security-patch-only under the Better Auth team since September 2025; its Credentials provider requires JWT sessions; its documented middleware pattern breaks on Next.js 16's `proxy.ts`. | [Auth.js announcement](https://github.com/nextauthjs/next-auth/discussions/13252), [LogRocket comparison](https://blog.logrocket.com/best-auth-library-nextjs-2026/) | Behavior reports are third-party. |
| Better Auth ships email and password, TOTP and passkey plugins, Drizzle and Prisma adapters and a Stripe plugin. | Documentation-derived summary pages | Not confirmed against Better Auth's own docs. Rate limiting is unconfirmed. |
| CVE-2025-29927 (March 2025) let a crafted header skip Next.js middleware, and guidance is to check authorization near the data. | [OffSec write-up](https://www.offsec.com/blog/cve-2025-29927) | Fixed in patched versions. |
| Neon's pooled endpoint runs PgBouncer in transaction mode; session `SET` and SQL `PREPARE` do not work there; the free plan scales to zero after 5 minutes idle; `pg_trgm` is supported; HTTP is for one-shot queries and WebSockets for transactions. | [Neon pooling guide](https://neon.com/faqs/managed-postgres-services-serverless-connections), [Neon pg\_trgm](https://neon.com/docs/extensions/pg_trgm) | The "hundreds of milliseconds" cold-start figure is from a third-party summary. |
| Sentry Session Replay masks all text and blocks media by default, and stores URLs by default. | [Sentry privacy docs](https://docs.sentry.io/platforms/javascript/session-replay/privacy/) |  |
| OWASP lists `=`, `+`, `-`, `@` (plus tab, carriage return, full-width variants) as formula prefixes, says no universal sanitization exists, and describes a tab prefix inside quotes as Excel-resistant but data-altering. | [OWASP: CSV Injection](https://owasp.org/www-community/attacks/CSV_Injection) |  |
| SonarQube Community Build lacks branch analysis and pull-request decoration; Cloud Free offers pull-request analysis within 50K lines. | [Third-party review](https://aicodereview.cc/blog/sonarqube-review) | Confirm on Sonar's own pricing page. |
| Time-weighted return removes the effect of cash flows; money-weighted return (XIRR) includes their timing; the two can differ in sign. | [Asora explainer](https://www.asora.com/blog/time-weighted-vs-money-weighted-return), [Sharesight example](https://sharesight.com/blog/time-weighted-vs-money-weighted-rates-of-return/) | A standard method; the example figures vary by source. |
| Free market-data tiers are mostly delayed 15 to 20 minutes and capped; one comparison says some are non-commercial only. | [Market-data comparison](https://qveris.ai/guides/stock-quote-api-for-ai-agents/) | Vendor limits change. The non-commercial claim is unverified. |
| Plaid's Sandbox is free, with unlimited test items and pending/posted simulation. | [Plaid docs](https://plaid.com/docs/sandbox/index.html.md) |  |
| Payload installs inside a Next.js app, Strapi is a standalone Node service, and Sanity keeps content in a hosted Content Lake. | [Payload vs Strapi](https://www.cosmicjs.com/blog/payload-vs-strapi), [CMS comparison](https://www.thefrontendcompany.com/posts/best-cms-for-nextjs) | Third-party comparisons. |

### Reasoning, not verified

These points are engineering judgment or known behavior that was not checked against a source in this review:

- Prisma's schema language cannot declare check constraints or RLS.
- Route handlers lack the origin checks Server Actions get.
- Running migrations over Neon's direct endpoint.
- Per-request round-trip cost against a cloud database.
- The ECharts aria option and long-series downsampling options.
- Stripe test clocks, and PWA installability on localhost.
- Product and UX judgments: infinite scroll with a Load more button, the pending-row badge, theme per device, and the CSV sanitization policy.

## Success criteria and non-functional requirements

**Original.** The application should behave like a production-grade financial dashboard while relying almost entirely on mocked data from JSON Server.

**Revised.** The application behaves like a production-grade financial dashboard on real, isolated user data; only investments, prices and AI insights are mocked. It is accepted when each check below can be demonstrated.

1. **Agreement.** For the same filter, the dashboard numbers, the Transactions header total and the report show identical figures.
2. **Isolation.** The RLS suite passes: another user's rows cannot be read or written, a request with no user context returns nothing, and the runtime role is not a superuser, owner or `BYPASSRLS` role.
3. **Offline.** With the network off, the installed app opens and shows last-known data labeled "as of". A Transaction added offline appears with a pending badge, syncs exactly once on reconnect, and a rejected item is shown to the user.
4. **Premium.** A test-card purchase unlocks the Premium features through the webhook. A lapse locks them as specified, and a direct request without the entitlement is rejected by the server.
5. **Reports.** The PDF and CSV for a chosen period match the on-screen numbers, and a CSV cell beginning with a formula character does not execute when opened.
6. **Performance.** The stress seed (FR-20) meets the numeric budgets chosen for bundle size, LCP and INP (D-63, Open), with measurements taken after a warm-up and database time reported separately.
7. **Security hygiene.** No secret is present in the client bundle, mutating route handlers reject cross-origin requests, and `proxy.ts` is never the only check.
8. **Quality gates.** Pull requests pass the SonarQube quality gate, the unit, integration and E2E suites run in GitHub Actions, and Sentry receives errors with amounts and descriptions scrubbed.
9. **Install.** The app installs from a production build served on localhost.

**Non-functional notes**

- **Browsers (Assumed).** Modern evergreen browsers. Safari and Firefox lack Background Sync, so offline replay there runs only when the app is open.
- **Accessibility (Open).** A target is not yet set. Charts, the infinite list and the command palette each need explicit work.
- **Privacy (Open).** Account export, account deletion and data retention are not decided.

## Out of scope

The following are not part of this POC. Each is either a decision above or was not discussed.

- **Database schemas.** Designed in a separate chat. This document only constrains them.
- **Real bank connections and aggregation.** Outside the brief.
- **Live market data, trading and brokerage connections.** Investments are mock and seeded.
- **A real language model.** Insights are simulated.
- **Live Stripe mode, real payments and tax handling.** Test mode and test cards only.
- **Passkeys, email verification, password reset, two-factor and social login.** A decision, with consequences recorded in FR-18.
- **Multiple accounts, balances and transfers.** A single account.
- **Multi-currency and exchange rates.** One currency per user.
- **Stored report files and report history.** Reports are on-demand downloads.
- **Budget rollover or envelope budgeting.** Not discussed. Budgets are per category per calendar month.
- **Native mobile apps.** The PWA is the mobile story.
- **Widget marketplace.** Not planned; see Stretch goals.
- **Docker and a local Postgres.** Not used; the database is managed.
