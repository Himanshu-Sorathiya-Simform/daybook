# P3 Observability, performance and quality

18 Oct 2026 · @Himanshu

This spec covers how Daybook is watched, measured and checked:

- **Monitoring:** errors, traces and web vitals go to Sentry with no personal or financial data, and a request id links a browser error to the server request behind it.
- **Logs:** every API request leaves one structured log line.
- **Performance:** the budgets of root 11.1 are measured the same way every time, with results recorded before and after each optimization.
- **Accessibility:** checked automatically on every core page, and by hand on every core flow.
- **CI:** it runs lint, types, tests, the RLS suite and the build on every push, with SonarQube's quality gate.
- **Release:** a checklist maps each success criterion of root 15 to the run that proves it.

| Item       | Value                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M0 (Sentry, logs, CI, SonarQube) and M7 (the performance runs, the accessibility pass, the release checklist). Session replay is Stretch (M8)                                                                                                                                                                             |
| Plan       | n/a; flag `monitoring.sessionReplay` (Stretch)                                                                                                                                                                                                                                                                            |
| Depends on | [P2](P2-data-access-and-security.md) (request ids, `Server-Timing`, the error envelope, the CSP, environment validation), [P1](P1-offline-and-pwa.md) (production builds with the worker), [F15](../features/F15-demo-and-seed-data.md) (the stress account), every feature spec's accessibility and performance criteria |
| Decisions  | D-02, D-03, D-59 to D-61, D-63, D-161 to D-166, D-196, D-294, D-354 to D-360, D-379 to D-381, D-386                                                                                                                                                                                                                       |

## 1. User stories

- As the developer, I want every error with enough context to fix it, and nothing a user typed or spent.
- As the developer, I want to follow a failed request from the browser to the server log.
- As the developer, I want to know whether the app meets its performance budgets, measured the same way each time.
- As the developer, I want CI to stop a change that breaks tests, types, data isolation or the build.
- As a user of assistive technology, I want every core flow to work.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                        | Stretch (M8)                                                              | Out                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentry for browser and server, through the tunnel, with data collection set explicitly, scrubbing, sampling, releases and source maps; request-id linking; structured server logs; the performance runs and their records; the accessibility pass; CI and SonarQube; dependency and secret hygiene; the release checklist | Session replay (`monitoring.sessionReplay`, masking every text and input) | A local Postgres or Docker (D-02, D-03); uptime monitoring and alerting beyond Sentry's defaults; log shipping or a log service; other monitoring vendors; load testing beyond the stress account |

## 3. Concepts and fields

**Sentry environments.** `development` (`next dev`), `production` (a local production build) and `ci`. The release is the build id (`BUILD_ID`). Both values are inlined into the browser bundle at build time, through `NEXT_PUBLIC_SENTRY_ENVIRONMENT` and `NEXT_PUBLIC_BUILD_ID` (root SEC-9).

**The performance run** (D-294, D-357, D-379). One manual GitHub Actions workflow, `perf.yml`, runs everything on one runner:

- the app as a production build, with the service worker;
- a Postgres service container seeded with the stress account;
- Chromium for the browser measures and the PDF.

| Part                 | Measures                                      | Held to                                                                                                                 |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| The server measures  | Server time per endpoint, and PDF render time | The 300 ms p95 and the 5 s PDF p95. The runner and its database share a machine, which is D-294's "same region"         |
| The browser measures | LCP, CLS, INP and first-load JavaScript       | Root 11.1's browser budgets. The page and its server share the machine, so no distance to a remote database is measured |

Nothing runs Docker or Postgres on the developer machine (D-02, D-03); the service container is GitHub's. Learn reads the real Sanity project, whose project id and dataset are public repository variables.

**Environment variables added by this spec**

| Variable                                               | Purpose                                                             | Required at startup               |
| ------------------------------------------------------ | ------------------------------------------------------------------- | --------------------------------- |
| `SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `development`, `production` or `ci`, for the server and the browser | No                                |
| `SENTRY_ORG`, `SENTRY_PROJECT`                         | Source-map upload at build, with `SENTRY_AUTH_TOKEN` (root 13)      | No                                |
| `NEXT_PUBLIC_BUILD_ID`                                 | The release, in the browser                                         | Yes, set from `BUILD_ID` at build |

P2's startup validation (BR-P2-38) treats the Sentry variables, `SANITY_WRITE_TOKEN` and `SANITY_READ_TOKEN` as optional. `ci.yml` sets placeholder values for the required ones it does not use, such as the Sanity project id, and its tests mock the Sanity client. `perf.yml` uses the real Sanity project id and dataset.

## 4. Business rules

**Sentry (NFR-12, SEC-12, D-59, D-196, D-354)**

- **BR-P3-01** **Setup.** `@sentry/nextjs`, pinned to major version 11:
    - **Server:** initialized in `instrumentation.ts` for the Node.js runtime, which also exports `onRequestError = Sentry.captureRequestError`, so errors in server components and route rendering are reported. There is no edge initialization, since `proxy.ts` runs on Node.js in Next.js 16 and no route uses the edge runtime.
    - **The user on the server:** the route wrapper calls `Sentry.setUser({ id })` on the request's isolation scope once the session step passes (P2, BR-P2-17).
    - **Browser:** initialized in `instrumentation-client.ts`, which also exports `onRouterTransitionStart`.
    - **The tunnel:** `withSentryConfig` sets `tunnelRoute: "/monitoring"`, so browser events go to Daybook's own origin and the CSP lists no Sentry host (P2). `proxy.ts` skips `/monitoring` (P2, BR-P2-28).
    - **Transport:** the browser uses Sentry's offline transport (`makeBrowserOfflineTransport`), so events raised offline are sent on reconnect. Its requests use `credentials: 'omit'`, so the same-origin tunnel never carries Daybook's cookies on to Sentry.
    - **No DSN, no Sentry:** without a DSN the SDK is not started, so the app runs with no Sentry account.
    - **Source maps:** uploaded at build when `SENTRY_AUTH_TOKEN` is set, then deleted from the build output (`deleteSourcemapsAfterUpload`), so they are never served.
- **BR-P3-02** **Sampling.**
    - **Errors:** 100%.
    - **Traces:** 20% in `production` and `ci`, none in `development`.
    - **Web vitals:** Sentry's browser tracing records LCP, CLS and INP on sampled page loads.
    - **Profiling:** off.

    The performance runs do not depend on Sentry's numbers (BR-P3-09).

- **BR-P3-03** **Data collection** (D-380). Version 11's `dataCollection` option is set explicitly on browser and server, never left at its defaults:
    - `userInfo: false`, `cookies: false`;
    - `httpHeaders: { request: { allow: ["user-agent", "x-request-id"] }, response: false }`;
    - `httpBodies: []`, so no request or response body is collected;
    - `urlQueryParams: { allow: <the allow-list of BR-P3-04> }`;
    - `databaseQueryData: false`, so no bound parameter, written value or result row is collected;
    - `stackFrameVariables: false`;
    - `genAI: { inputs: false, outputs: false }`, `graphQL: { document: false, variables: false }`, `queues: false`;
    - `frameContextLines` left at its default, since source lines hold no user data.

    **Spans:** `traceLifecycle` is pinned to `'stream'`, version 11's default, and the `beforeSendSpan` scrubber handles that streamed span shape. AC-P3-12 proves it actually runs.

    **The user:** the only user field sent is `{ id }`. The browser sets it after `/api/me` answers, and the server per request (BR-P3-01).

- **BR-P3-04** **Scrubbing** (SEC-12, D-356). One scrubber runs in `beforeSend`, `beforeSendSpan` and `beforeBreadcrumb`, on browser and server, as a second line behind data collection:
    - **URLs:** in every URL it finds (events, spans, breadcrumbs), the path is kept. Query parameters are kept only from an allow-list: `month`, `from`, `to`, `type`, `cat`, `goal`, `goals`, `sub`, `src`, `sort`, `dir`, `range`, `period`, `part`, `year`, `scope`, `kind`, `topic`, `page`, `txn`, `open`, `limit`. Every other value becomes `[Filtered]`. That includes `q`, `min`, `max`, `cursor` (it can encode an amount), `token`, `session_id` and `next`.
    - **Keys:** each key is normalized to lower case without `_`, `-` and spaces. A value is replaced with `[Filtered]` when its normalized key is one of `payee`, `payeename`, `description`, `note`, `email`, `password`, `token`, `q`, `displayname`, `name`, `body`, `before`, `label`, `title` or `message`, or when the key starts with `amount` or ends with `minor`. `label` covers the queue item's label, which holds a payee and an amount (P1).
    - **Where:** the key rule recurses through nested objects and arrays in event extras, tags, contexts other than Sentry's own (`browser`, `os`, `runtime`, `device`, `app`, `trace`), span attributes and breadcrumb data.
    - **Elements:** Sentry describes a clicked or typed-in element, and the element behind an INP or LCP span, by a selector that includes its `aria-label`, `title`, `name` and `alt` values, and those can hold a payee or an amount. So:
        - in `beforeBreadcrumb`, a `ui.*` breadcrumb's message becomes the element path's tag names only, such as `main > div > button`;
        - in `beforeSendSpan`, INP span names and element attributes such as the LCP element get the same reduction.
    - **Console breadcrumbs:** dropped in `production` and `ci`.
- **BR-P3-05** **Error messages** (D-381). A database error is reported by its SQLSTATE code, table, and constraint name (or column, for a NOT NULL violation) only. Its message, `detail`, `where`, `query`, bound parameters and `cause` are dropped before the event or log line is built. That applies to Postgres errors and Drizzle's wrapped query errors alike, since they carry the failing row and the parameters. Other errors keep their name and message, passed through BR-P3-04's key rule.
    - **Errors Daybook reports itself** (the wrapper's 500s, the log line): built from those fields only.
    - **Errors Sentry captures on its own** (`onRequestError` for server components, unhandled errors): `beforeSend` checks `hint.originalException` and its `cause` chain. When any of them is a database error, the event's exception value becomes, for example, `SQLSTATE 23502 on transactions (amount_minor)`, and the linked `cause` exceptions that the linked-errors integration added are dropped. A Drizzle error's message, which holds the query and its parameters, therefore never leaves the server.
- **BR-P3-06** **What is reported.**
    - **Errors:** unhandled errors in the browser and on the server, and every 500 `internal` (P2, BR-P2-24).
    - **Security events:** P2's RLS `WITH CHECK` failures.
    - **Feature events:** the named events of F12 (billing), F11 (print pages that never become ready), P2 (catch-up and daily-pass failures), P1 (queue migration failures) and F01 (Have I Been Pwned timeouts).
    - **Not reported:** expected 4xx answers such as validation, conflicts and refusals.
- **BR-P3-07** **Request ids** (P2, BR-P2-30). The server tags every event with `request_id` from `x-request-id`. The browser tags an error from a failed API call with the `requestId` in its error envelope, so both sides share one id. The sync panel's details for a refused item also show it (P1).

**Logs (D-355)**

- **BR-P3-08** Each API request writes one JSON line to stdout through `server/log.ts`, a small module with no dependencies:
    - **Fields:** `time`, `level`, `requestId`, `method`, `route` (the route pattern, never the URL), `status`, `durMs`, `dbMs` and `userId` (when known). A streamed response (P2, `stream: true`) writes its line when the stream ends.
    - **Errors:** add the error's name and, for database errors, BR-P3-05's fields. Other errors add a message passed through BR-P3-04's key rule, and the stack at level `error`.
    - **Never:** query strings, bodies, emails, names or bound parameters.

**The performance runs (root 11.1, NFR-1 to NFR-3, D-294, D-357, D-379)**

- **BR-P3-09** **Measures:**

    | Measure               | Budget                        | Run     | How                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
    | --------------------- | ----------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Server time           | p95 under 300 ms per endpoint | Server  | `npm run perf:api`: per endpoint, 20 warm-up requests, then 200 sequential requests as the stress user. The p95 of `Server-Timing` `app;dur`, which P2 times from the wrapper's first step to the response, or to the commit for an `afterCommit` route (D-386), so the session, profile and capability steps count. The p95 of `db;dur` is recorded beside it (root 15, criterion 8)                                                                                                           |
    | PDF render            | p95 under 5 s (D-357)         | Server  | `perf:api` also requests the previous month's PDF 20 times, with Chromium warm (F11). Each sample is the wall time from sending the request to receiving the last byte, measured on the runner                                                                                                                                                                                                                                                                                                  |
    | LCP, CLS              | 2.5 s or less; 0.1 or less    | Browser | Lighthouse's Node API (npm `lighthouse`) with its default mobile emulation, median of 3 runs, on `/dashboard`, `/transactions` and one `/learn/[slug]`, with the worker in control (BR-P3-11). Each sample records its TTFB beside LCP                                                                                                                                                                                                                                                          |
    | INP                   | 200 ms or less                | Browser | Playwright on Chromium with 4× CPU throttling and `web-vitals`, over 5 repetitions of two interactions: applying a category filter on Transactions, and saving a Transaction. The worst value counts                                                                                                                                                                                                                                                                                            |
    | First-load JavaScript | 200 KB compressed or less     | Browser | Playwright, with service workers blocked so every script comes from the network and is counted, loads `/dashboard` and waits until the network has been idle for 2 seconds after `load`. It sums the Resource Timing `encodedBodySize` of every script loaded, except the chunks that the build's loadable manifest lists for the chart wrapper's `next/dynamic` import, which root 11.1 exempts. Lazily loaded widget code therefore counts. Next.js 16's build output no longer reports sizes |

    `perf:api`'s endpoints:
    - `/api/me`;
    - `/api/transactions`, default and with a category filter, and its summary;
    - `/api/dashboard`;
    - `/api/budgets`, `/api/subscriptions` and `/api/goals`;
    - each `/api/analytics/*` endpoint over a 5-year monthly range, except the heat map with `year` set to the current year, and Goal progress with the 5 oldest active Goals;
    - `/api/investments/*` with `range=1y`;
    - `/api/insights`;
    - `/api/search` with `q=swi`, every scope. Its Learn call runs after the commit and is timed apart as `after;dur` (D-386; F13, AC-F13-10);
    - the monthly report JSON.

- **BR-P3-10** **`perf.yml`** (`workflow_dispatch`), one job:
    1. **Database:** a Postgres service container of the Neon project's major version.
    2. **Environment:** the same block as `ci.yml`'s integration job. That covers the owner and three role URLs pointing at the container, the role passwords, `BETTER_AUTH_SECRET`, `PRINT_TOKEN_SECRET`, a placeholder `sk_test_` key, `BUILD_ID` and `NEXT_PUBLIC_BUILD_ID` from the commit, and `APP_ORIGIN=http://localhost:3000`. Learn's project id and dataset come from repository variables.
    3. **Setup:** `db:bootstrap`, `db:migrate` and `db:seed -- --only stress`, then `npx playwright install --with-deps chromium`.
    4. **The app:** a production build, started on the runner.
    5. **Sign-in:** `perf:api` and `perf:browser` each sign in once as the stress user, sending `Origin: APP_ORIGIN`, and reuse that session. Better Auth's limiter allows 3 sign-ins per 10 seconds (F01, BR-F01-08).
    6. **Warm-up:** `GET /api/me` (NFR-2), and one load of each measured page.
    7. **Measures:** `perf:api`, then `perf:browser`. The results are uploaded as an artifact.

    The stress account lives only in this job's container, so the INP run's saved Transactions need no cleanup. The account has no Stripe Customer, so the lazy billing check never calls Stripe.

- **BR-P3-11** **The browser measures** (`npm run perf:browser`):
    - **The browser:** one Chromium launched by Playwright with a remote-debugging port, which Lighthouse's Node API drives.
    - **The session cookie:** set in that browser for `APP_ORIGIN` only, so it never reaches Sanity or any other origin.
    - **The worker:** Lighthouse runs with `disableStorageReset`, after the warm-up has installed the service worker, so the LCP, CLS and INP loads run with the worker in control, as a returning user's would (P1). Documents are still network-first, so each load renders on the server. Only the JavaScript-size measure blocks the worker.
- **BR-P3-12** **Records** (NFR-3). Each run writes `perf/results/<date>-<short sha>-<run>.json` with every measure, and appends a row to `perf/RESULTS.md`: date, commit, run, and each measure with pass or fail. An optimization adds a "before" and an "after" row that name it. A failed budget blocks the release checklist (BR-P3-20), not CI.

**Accessibility (NFR-4 to NFR-6, D-163, D-358)**

- **BR-P3-13** **Automated.** `@axe-core/playwright` scans each core page and dialog, in the light and dark themes, at 360 px and 1280 px wide. A serious or critical violation fails the test. The pages are:
    - `/signup`, `/login`, `/onboarding`;
    - `/dashboard`, `/transactions` (and the entry dialog), `/budgets`, `/subscriptions`, `/goals`, `/goals/[id]`, `/investments`;
    - `/analytics` (with a View as table open), `/insights`, `/reports`, `/settings/billing`;
    - `/settings/profile`, `/settings/appearance`, `/settings/security` and `/settings/dashboard`;
    - the billing payment form, in an `@stripe` test, with Stripe's cross-origin iframe excluded from the scan, since Daybook cannot change it;
    - the command palette, the sync panel and the conflict view;
    - `/learn` and a post page.
- **BR-P3-14** **Contrast.** `tokens/contrast-pairs.ts` lists every text, icon, border and focus-ring color pair the design actually uses, in both themes. A unit test checks the WCAG contrast ratio of each: 4.5:1 for body text, and 3:1 for large text, meaningful icons, component borders and focus indicators (WCAG 1.4.3 and 1.4.11).
- **BR-P3-15** **By hand,** at M7, for each core flow (NFR-4), recorded in `docs/a11y-checklist.md` with the date and result:
    - completing the flow with the keyboard alone, with focus always visible;
    - 200% zoom at a 1280 px window;
    - reflow at 320 CSS px wide with no two-dimensional scrolling (WCAG 1.4.10);
    - reduced motion;
    - a screen-reader pass with Orca and Firefox on Linux.

    VoiceOver on iOS is marked unverified (NFR-7).

**CI and code quality (TST-5 to TST-7, D-60, D-162, D-166, D-359)**

- **BR-P3-16** **`ci.yml`** runs on every push and pull request, on Node from `.nvmrc` (26, Active LTS from 28 October 2026, the version the development machine runs), with `npm ci` cached. Its jobs:
    1. **check:** lint, typecheck, the dependency audit (BR-P3-19), and the unit and client-integration (MSW) tests with coverage;
    2. **integration:** a Postgres service container of the Neon project's major version; `db:bootstrap`, `db:migrate` and `db:verify`; then the integration tests and the RLS suite, with coverage;
    3. **coverage:** merges the coverage of jobs 1 and 2 and applies BR-P3-17's thresholds once, to the merged result;
    4. **build:** `next build` with `BUILD_ID` set to the commit. Source maps are uploaded only when the Sentry token secret exists;
    5. **sonar:** SonarQube Cloud's CI-based analysis with the merged `lcov` report. Its quality gate must pass (root 15, criterion 11). It is skipped for pull requests from `dependabot[bot]`, which receive no repository secrets.

    Branch protection on `main` requires check, integration, coverage, build and sonar to pass before merging.

- **BR-P3-17** **Coverage** (D-162). 80% of lines on the domain modules, measured on the merged coverage:
    - `shared/**`;
    - `server/**`, except `server/reports/pdf.ts` (it needs Chromium, which `ci.yml` does not install) and `server/db/pools.ts`;
    - `client/queue/**` and `client/persist/**`.

    SonarQube's `sonar.coverage.exclusions` lists everything outside these globs, so its gate holds new code to 80% on the same modules.

- **BR-P3-18** **End-to-end tests** run locally against the Neon development database (TST-6), with `npm run test:e2e` on a production build.
    - **Manual tags:** `@stripe` tests need Stripe test keys and the CLI (F12); `@sanity` tests need the seeded Sanity project (F14). Both run by hand before a release.
    - **CSP:** every E2E test fails on a CSP violation in the console.
- **BR-P3-19** **Dependencies and secrets.**
    - **Dependabot:** proposes updates weekly for npm and GitHub Actions.
    - **Audit:** `scripts/audit.ts` runs `npm audit --omit=dev --json`. Any high or critical advisory fails the `check` job, unless it is listed in `audit-allowlist.json` with a reason and a review date that has not passed. next-sanity 13 declares `sanity` and `styled-components` as required peer dependencies, so the Studio's packages are in the production tree and audited too. An advisory in Studio-only code may be allow-listed for that reason.
    - **The repository:** GitHub secret scanning and push protection are on, since it is public (D-04).
    - **CI secrets:** only `SONAR_TOKEN` and, optionally, `SENTRY_AUTH_TOKEN` and the Sentry DSN. Sanity's project id and dataset are public, so they are repository variables, not secrets.

**Release checklist (D-360)**

- **BR-P3-20** M7 ends when every row of section 5's checklist passes. Each row is recorded in `docs/release-checklist.md` with its date, commit and result.

**Stretch**

- **BR-P3-21** **Session replay** (`monitoring.sessionReplay`, off by default) adds Sentry's replay with every text and input masked. It is built only at M8.

## 5. Calculations

**The release checklist** (root 15):

| Root 15 criterion   | Proven by                                                                                                                                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Agreement         | TST-2 invariants on golden; AC-F08-02, AC-F09-02, AC-F11-01                                                                                                                                                            |
| 2 Time              | AC-F03-04 (row 26 counts in November) and AC-F03-32                                                                                                                                                                    |
| 3 Isolation         | The RLS suite (TST-1) and `db:verify`, green in CI; and by hand at release, both run against a Neon test branch (TST-6), which checks the role attributes Neon's own roles carry (SEC-6)                               |
| 4 Offline, read     | AC-P1-12, then by hand: the app installed (AC-P1-23) and opened with the network off                                                                                                                                   |
| 5 Offline, write    | AC-F08-03 and AC-F03-02 (the pending badge and annotation); AC-P1-06 and AC-P1-07 (exactly once); the conflict journey (AC-P1-23) and AC-F03-19; AC-P1-25 (a rejected item with its reason); AC-P1-14 (offline logout) |
| 6 Premium           | AC-F12-13 and AC-F12-15 (`@stripe`, test clock); AC-P4-08                                                                                                                                                              |
| 7 Reports           | AC-F11-01 (matches the screen), AC-F11-02, AC-F11-03, AC-F11-06 and AC-F11-09                                                                                                                                          |
| 8 Performance       | A passing `perf.yml` run, recorded in `perf/RESULTS.md` with the `db;dur` p95 per endpoint (AC-P3-04)                                                                                                                  |
| 9 Accessibility     | BR-P3-13 green, and BR-P3-15 recorded, including keyboard-only Transaction entry and search                                                                                                                            |
| 10 Security hygiene | AC-P2-17 (no secret in the client bundle), AC-P2-10 (cross-origin and non-JSON mutations), AC-P2-15 (nonce CSP), AC-P2-29 and AC-P4-08 (route handlers called with no proxy in front still refuse)                     |
| 11 Quality gates    | CI green with the SonarQube gate passed, and AC-P3-10 (a scrubbed test error seen in Sentry)                                                                                                                           |
| 12 Install          | AC-P1-23 on a production build at localhost                                                                                                                                                                            |

**p95.** Nearest rank: for n samples sorted ascending, p95 is the value at rank ⌈0.95 × n⌉. For 200 samples that is the 190th, and for the PDF's 20 samples the 19th.

## 6. Screens and states

None for users. Developers see Sentry's issues and traces, `perf/RESULTS.md`, `docs/a11y-checklist.md`, `docs/release-checklist.md` and CI's checks.

| State                                                      | What the user sees         |
| ---------------------------------------------------------- | -------------------------- |
| Loading, Empty, Error, Offline, Pending, Locked, Read-only | n/a: no user-facing screen |

## 7. Flows

**7.1 Follow an error.** A user's save fails with 500. The toast shows the generic message. Sentry has the browser error tagged `request_id=0192…`, and the server event and log line carry the same id, with the route, the SQLSTATE, and the database time.

**7.2 A performance run.**

1. The developer starts `perf.yml` from GitHub's Actions tab.
2. The runner seeds the stress account, builds, and runs `perf:api` and `perf:browser`.
3. `/api/analytics/budget-actual` fails at 340 ms, and the developer adds an index.
4. A rerun records the before and after rows.

**7.3 A pull request.** CI runs check, integration, coverage, build and sonar. Merged coverage on `client/queue` drops to 76%, the coverage job fails, and branch protection keeps the pull request open until tests are added.

## 8. Validation and messages

None user-facing. CI and the scripts report failures in their own output, naming the measure, budget and value: "server time p95 /api/dashboard 312 ms > 300 ms".

## 9. Plan gating

None. `monitoring.sessionReplay` is a Stretch flag (P4).

## 10. Offline behavior

Sentry's offline transport stores events raised offline and sends them on reconnect, through the tunnel (BR-P3-01). Nothing in this spec affects the user offline.

## 11. Server surface

| Route         | Purpose                                                                                                                                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/monitoring` | Sentry's tunnel (`tunnelRoute`): a Next.js rewrite to Sentry's ingest host for the organization and project its query names. It accepts any project, so it is an open relay to Sentry, not a Daybook endpoint. Browser events reach it without cookies (BR-P3-01). The proxy skips it |

**Scripts:**

- `npm run perf:api`: server time and PDF; run by `perf.yml`.
- `npm run perf:browser`: LCP, CLS, INP and JavaScript size; run by `perf.yml`, and locally for exploration only.
- The CI workflows `ci.yml` and `perf.yml`.

## 12. Cross-feature effects

- **P2:** request ids, `Server-Timing` (`app;dur` timed from the wrapper's first step), the error envelope's `requestId`, the CSP's tunnel, the proxy's `/monitoring` exclusion, optional variables at startup. The RLS suite and `db:verify` run in CI.
- **Root SEC-9:** allows the Sentry environment and the build id as public variables.
- **P1:** the browser measures use production builds with the worker in control; the queue's migration failures are reported, with the item's label filtered.
- **F15:** the stress account is the performance run's data.
- **Every feature spec:** its accessibility ACs run in BR-P3-13, and its performance ACs in BR-P3-09.

## 13. Edge cases

- **Sentry unreachable:** the transport keeps events until it can send them, within its storage limit; the app is unaffected.
- **An ad blocker:** the tunnel keeps browser events flowing, since they go to Daybook's origin.
- **Browser measures near their budget:** a measure within 5% of its budget is rerun once before it is recorded as failed. Its TTFB shows whether the server or the page was slow.
- **Runner noise in the server measures:** each endpoint's 200 samples follow 20 warm-up requests. A failing endpoint is rerun once in the same job before it is recorded as failed.
- **A dependency advisory with no fix yet:** allowed by `audit-allowlist.json` until its review date passes (BR-P3-19).

## 14. Acceptance criteria

- **AC-P3-01** (integration) A thrown server error produces a Sentry event, captured through a test transport, with:
    - `request_id`;
    - user `{ id }` only;
    - no request body.

    Its log line has the same `requestId`.

- **AC-P3-02** (unit) The scrubber:
    - replaces `q`, `min`, `max`, `cursor`, `token` and `next` in a URL, and keeps `month` and `cat`;
    - replaces `payee`, `amountMinor`, `signedAmountMinor`, `displayName`, a queue item's `label` and a nested `body.note`;
    - turns a click breadcrumb on `<button aria-label="Delete Chai Point" title="−₹300.00">` into its tag path only;
    - renames an INP span whose element has such a `title` to its tag path;
    - leaves `contexts.browser.name` and `request_id` alone.
- **AC-P3-03** (unit) The log line for a request holds the route pattern, not the URL, and no query string.
- **AC-P3-04** (manual, M7) A `perf.yml` run passes every row of BR-P3-09, recorded in `perf/RESULTS.md`.
- **AC-P3-05** (E2E) BR-P3-13's scans pass on every listed page, in both themes, at both widths.
- **AC-P3-06** (unit) Every pair in `tokens/contrast-pairs.ts` meets BR-P3-14's ratio for its kind.
- **AC-P3-07** (CI) Branch protection blocks a pull request that drops merged domain-module coverage below 80%, fails a test, breaks types, or fails `db:verify`.
- **AC-P3-08** (manual, M7) `docs/release-checklist.md` records every row of section 5 as passed.
- **AC-P3-09** (build) No source map is served by `npm run start`, and no Sentry host appears in the CSP.
- **AC-P3-10** (manual, M7) With a real DSN, a forced error on `/transactions?q=swiggy` reaches Sentry. Its event and its page-load span show `q=[Filtered]`, with no cookie, body or email.
- **AC-P3-11** (integration) Database errors:
    - a forced NOT NULL violation (SQLSTATE 23502) on a Transaction insert answers 500, and its Sentry event and log line report the SQLSTATE, table and column;
    - a forced CHECK violation (23514) and a business unique violation (23505), whose `detail` names the key's value, answer 422, so they send no Sentry event (BR-P3-06), and their log lines report the SQLSTATE, table and constraint;
    - none of these carries a bound value, the `detail` or the query.
- **AC-P3-12** (integration) A span sent through the test transport from a page URL holding `q` and `min` shows both as `[Filtered]`.
- **AC-P3-13** (integration) A server component whose `readAsUser` query throws a Drizzle error with bound parameters is captured through `onRequestError` into the test transport. The event's exception shows only the SQLSTATE, table and constraint, with no linked cause and no parameter.

## 15. Illustrations

Illustrative, a log line:

```json
{
	"time": "2026-11-02T06:30:01.234Z",
	"level": "info",
	"requestId": "0192f0c4-…",
	"method": "GET",
	"route": "/api/dashboard",
	"status": 200,
	"durMs": 184,
	"dbMs": 121,
	"userId": "0192f0c4-…"
}
```

Illustrative, `perf/RESULTS.md` rows:

```text
| 2026-12-02 | a1b2c3d | server  | API p95 max 241 ms (/api/dashboard) ✓ | PDF p95 3.1 s ✓ |
| 2026-12-02 | a1b2c3d | browser | LCP 1.9 s ✓ | CLS 0.02 ✓ | INP 140 ms ✓ | JS 186 KB ✓ |
```
