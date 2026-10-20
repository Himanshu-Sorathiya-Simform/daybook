# POC 4 Daybook: Review Round 2

16 Oct 2026 · @Himanshu

> **Historical record.** This round's questions are all answered, and its answers are recorded in [02-decisions.md](../02-decisions.md), whose Ref column cites the question IDs here. Where this file and the decisions log or the specs differ, they win.

Round 1 is settled except for one conflict (J1) and the unanswered Budgets group (F1 to F8). Your answers raised 29 new questions, 8 of them Root.

> **Update, 16 Oct:** every question in this file is now answered; see [Answers to round 2](#answers-to-round-2) at the end, including the capabilities recommendation. Nothing blocks the root spec. Below: what changed in the repo, your answers recorded as decisions, my replies to every question you asked back, and the new questions.

## What changed in the repo

All docs now live in `docs/`. Subs and Sub are now Subscription(s) in the round-1 review. I left the old brief and spec unchanged because both get rewritten into `00-brief.md` and `01-root-spec.md` (B7 asks what happens to them after).

```text
docs/
  POC-4-personal-finance-dashboard-brief.md   current brief, rewritten as 00-brief.md
  POC-4-personal-finance-dashboard-spec.md    current spec, split into 01 and 02
  reviews/
    round-1-spec-review.md
    round-2-answers-and-follow-ups.md          this file
  (to come)
  00-brief.md
  01-root-spec.md
  02-decisions.md
  03-golden-dataset.md
  features/F01-auth-and-account.md ... F15
  platform/P1-offline-and-pwa.md ... P4
  verification.md
```

Your T8 answer adds a platform spec: **P4 Capabilities** (Premium entitlements, feature flags and permission codes). See the T8 reply below.

## Decisions recorded

"Claude's call" marks the questions you handed to me; the reason for each is in round 1 or in the replies below. Rows marked Open come back in New questions.

| ID                     | Decision                                                                                                                                                       | Status                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| A1                     | You build with Claude Code, so specs are agent-ready: exact rules, messages, acceptance criteria                                                               | Decided                                   |
| A2                     | No fixed deadline; target 10 to 12 business days, quality first                                                                                                | Decided; plan in A8                       |
| A3                     | The app is Daybook                                                                                                                                             | Decided                                   |
| A4                     | Milestones M0 to M7; every item tagged                                                                                                                         | Decided                                   |
| A5                     | Phone layouts for entry, desktop layouts for analytics; Claude Design makes the UI                                                                             | Decided                                   |
| A6                     | English only; `Intl` for numbers, currency and dates                                                                                                           | Decided                                   |
| A7                     | Free tier for every service                                                                                                                                    | Decided; repo visibility still open (A7b) |
| B1 to B6               | Doc set, feature split, template, repo markdown, golden dataset, Stretch and Out tags                                                                          | Decided                                   |
| C1                     | Subscription(s) everywhere; the Stripe side is always Premium (Daybook Premium)                                                                                | Decided                                   |
| C2                     | Subscriptions cover any fixed recurring bill (rent, EMI, insurance)                                                                                            | Decided                                   |
| C3                     | No auto-generated income                                                                                                                                       | Decided                                   |
| D1                     | Curated currency list; integer minor units with an exponent lookup table                                                                                       | Decided; list in D8                       |
| D2                     | Formatting locale from region, browser as fallback                                                                                                             | Decided                                   |
| D3                     | Calendar years and quarters                                                                                                                                    | Decided                                   |
| D4                     | Week start is a setting, default from region                                                                                                                   | Decided; options in D10                   |
| D5                     | No future dates; at most 10 days back                                                                                                                          | Decided; exact rule in D9                 |
| D6                     | Amount above 0, at most 999,999,999.99 in major units; sign comes from type                                                                                    | Decided                                   |
| D7                     | date-fns 4 with `@date-fns/tz`                                                                                                                                 | Decided                                   |
| E1                     | Payee, description and note                                                                                                                                    | Decided; required fields in E15           |
| E2                     | A refund reduces its original category and Budget                                                                                                              | Decided                                   |
| E3                     | List header shows In, Out and To Goals                                                                                                                         | Decided                                   |
| E4                     | Sort by date and by amount                                                                                                                                     | Decided                                   |
| E5                     | UUIDv7 ids; Transactions also get a time of day                                                                                                                | Decided; time model in E14                |
| E6                     | Delete at once with a 5-second Undo                                                                                                                            | Decided                                   |
| E7                     | Bulk actions: maybe bulk delete                                                                                                                                | Open (E16)                                |
| E8                     | No import                                                                                                                                                      | Decided                                   |
| E9                     | Duplicate action                                                                                                                                               | Decided                                   |
| E10                    | No attachments now; keep a spot for them later                                                                                                                 | Open (E17)                                |
| E11                    | Filter object: date, type, categories, text, amount range, source, Goal                                                                                        | Decided                                   |
| E12                    | Entry in a dialog or sheet over the current page                                                                                                               | Decided                                   |
| E13                    | Defaults: expense, now; category is never preselected                                                                                                          | Decided                                   |
| F1 to F8               | Not answered                                                                                                                                                   | Open                                      |
| G1                     | Weekly, monthly, quarterly, yearly                                                                                                                             | Decided                                   |
| G2                     | Catch-up on boot, lazily once a day, and on create or edit                                                                                                     | Decided                                   |
| G3                     | Backfill toggle on create, default off                                                                                                                         | Decided                                   |
| G4                     | A price change applies to future charges only                                                                                                                  | Decided                                   |
| G5                     | A deleted charge becomes a tombstone and is never recreated                                                                                                    | Decided                                   |
| G6                     | Active and cancelled; no pause                                                                                                                                 | Decided                                   |
| G7                     | No free trials                                                                                                                                                 | Decided                                   |
| G8                     | Subscriptions page lists 30 days ahead; the insight covers 7                                                                                                   | Claude's call                             |
| G9                     | Deleting a Subscription keeps its past charges, unlinked                                                                                                       | Decided                                   |
| G10                    | One generated charge can be edited on its own                                                                                                                  | Decided                                   |
| H1                     | Withdrawals allowed, returning money to unallocated                                                                                                            | Decided                                   |
| H2                     | States: active, completed, archived; over-funding shown above 100%                                                                                             | Decided; completion rule in H9            |
| H3                     | The free cap counts active Goals; reopening needs a free slot                                                                                                  | Decided                                   |
| H4                     | After a lapse, the user picks which Goals stay editable                                                                                                        | Decided; default in H10                   |
| H5                     | Archive instead of delete, plus an explicit Delete with contributions                                                                                          | Decided                                   |
| H6                     | Required monthly amount shown                                                                                                                                  | Decided                                   |
| H7                     | Over-saving warning compares against all-time unallocated                                                                                                      | Decided                                   |
| H8                     | Icon and color per Goal from a fixed list                                                                                                                      | Decided                                   |
| I1                     | Every user gets a seeded portfolio                                                                                                                             | Decided; seeding detail in I6             |
| I2                     | Seeded-random prices caught up to today                                                                                                                        | Proposed below                            |
| I3                     | Metrics as proposed, no XIRR; "integrate" unclear                                                                                                              | Open (I3 again)                           |
| I4                     | About 24 mock assets                                                                                                                                           | Decided                                   |
| I5                     | Assets priced in the user's currency                                                                                                                           | Decided                                   |
| J1                     | Conflict: pushback 1 approved the month picker, J1 answered B (date ranges)                                                                                    | Open (J1 again)                           |
| J2                     | Widget list as proposed, plus Latest from Learn                                                                                                                | Decided                                   |
| J3                     | Dashboard filter is the period only                                                                                                                            | Decided                                   |
| J4                     | Chart drill-down to Transactions                                                                                                                               | Decided                                   |
| J5                     | Separate Analytics page                                                                                                                                        | Decided                                   |
| J6                     | Server prefetch and hydrate                                                                                                                                    | Claude's call                             |
| J7                     | One onboarding panel until the first Transaction                                                                                                               | Decided                                   |
| K1 to K4               | Chart list, top 6 plus Other with fixed colors, PNG plus View as table, one-year heat map                                                                      | Decided                                   |
| K5                     | Locked card with a static sample picture                                                                                                                       | Claude's call                             |
| L1 to L4               | Savings-recommendation detector, follows the dashboard month, dismissible, top 5 plus a full page                                                              | Decided                                   |
| M1 to M4               | Sections as listed, two CSVs, period only, partial periods allowed                                                                                             | Decided                                   |
| M5                     | PDF from server-side Chromium (Playwright)                                                                                                                     | Claude's call                             |
| M6                     | Charts in the PDF, SVG renderer                                                                                                                                | Decided                                   |
| N1                     | Monthly and yearly prices, yearly discounted                                                                                                                   | Decided; discount in N8                   |
| N2                     | No trial                                                                                                                                                       | Decided                                   |
| N3                     | Price currency by country                                                                                                                                      | Open (N3 again)                           |
| N4                     | Stripe Elements instead of hosted Checkout pages                                                                                                               | Open (N9)                                 |
| N5                     | Cancel at period end                                                                                                                                           | Decided                                   |
| N6                     | Premium stays during payment retries and ends when Stripe cancels                                                                                              | Decided, verified                         |
| N7                     | Upgrade prompts at every locked spot                                                                                                                           | Decided                                   |
| O1 to O3, O5           | Command palette, quick actions, searched fields, articles included                                                                                             | Decided                                   |
| O4                     | Scoped search with tags                                                                                                                                        | Open (O6)                                 |
| P1 to P4               | All four entities offline, version check with 409, coalescing, sync panel                                                                                      | Decided                                   |
| P5                     | Warn before an offline logout loses queued items                                                                                                               | Decided; cookie fix in P13                |
| P6                     | Update flow with queued-item migration                                                                                                                         | Decided                                   |
| P7                     | Offline pages, plus a proper offline state on every unavailable page                                                                                           | Decided                                   |
| P8                     | App badge                                                                                                                                                      | Decided; scope below                      |
| P9                     | Push notifications                                                                                                                                             | Open (P12)                                |
| P10                    | One queue runner across tabs (Web Locks)                                                                                                                       | Decided                                   |
| P11                    | Serwist                                                                                                                                                        | Claude's call                             |
| Q1, Q3 to Q8, Q10, Q11 | Signup fields, change password, sessions list, deletion and export, reset data, 7-day sessions, profile timezone with a notice, auth role, Better Auth limiter | Decided                                   |
| Q2                     | Upper, lower, number and special required                                                                                                                      | Open (Q12)                                |
| Q9                     | Onboarding asks country and timezone; no editing for now                                                                                                       | Open (Q13)                                |
| R1 to R4               | Realistic demo, stress data, demo only into empty accounts, several seeded accounts                                                                            | Decided; account list in R5               |
| S1                     | Sanity                                                                                                                                                         | Decided                                   |
| S2                     | Public Learn, with some content limited                                                                                                                        | Open (S7)                                 |
| S3, S5, S6             | One Post type, about 12 seeded posts, Latest from Learn widget                                                                                                 | Decided                                   |
| S4                     | Revalidation on localhost                                                                                                                                      | Open; lean Sanity Live                    |
| T1 to T7               | Budgets, local measurement, accessibility, browsers, headers                                                                                                   | Claude's call; CI in T9, CSP in T10       |
| T8                     | Flags, permissions and Premium gating as one system                                                                                                            | Open (T11)                                |
| U1 to U4               | Tailwind with React Aria Components, Zod with TanStack Form, lucide, sonner, next-themes, Claude Design                                                        | Decided                                   |
| Pushback 16            | Mutations accept JSON only                                                                                                                                     | Decided                                   |

**My calls, with T settled**

- **T1:** On the dashboard, LCP at most 2.5 s and CLS at most 0.1. INP at most 200 ms for filtering and adding. First-load JavaScript for the dashboard route at most 200 KB compressed, with charts loaded lazily. Server time p95 under 300 ms with a warm database.
- **T2:** Measured locally: Lighthouse for LCP and CLS, a scripted Playwright interaction for INP, and web vitals sent to Sentry.
- **T4:** 80% coverage on domain modules only (money, dates, filters, capability checks, insight detectors).
- **T5:** WCAG 2.2 AA for core flows, with axe checks in Playwright.
- **T6:** Latest Chrome, Edge and Firefox, plus Playwright's WebKit as the Safari stand-in. Real iOS behavior is marked unverified.
- **T7:** Security headers and a CSP, set in `proxy.ts`.

## Replies to your questions

### Can we add CI, and is it free?

It is simple: one YAML file of about 30 lines that installs, lints, type-checks, runs unit tests and builds, in roughly 3 to 5 minutes a run. The RLS and integration tests need a database; a Postgres service container adds about 15 lines and runs on GitHub's machine, not yours.

It is free, with one limit. Public repositories get unlimited minutes on GitHub's hosted runners. Private repositories on the Free plan get about 2,000 Linux minutes a month (Windows counts double, macOS ten times) and 500 MB of artifact storage, which is around 400 runs at 5 minutes each. These figures come from [GitHub's December 2025 changelog](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/) and third-party pricing summaries; I did not open GitHub's billing page.

Without CI, SonarQube Cloud still works: [Automatic Analysis](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/automatic-analysis/) reads the repository directly and analyzes main and pull requests. It cannot import coverage, so the coverage target would be checked locally. The success criterion "suites run in GitHub Actions" would become "run locally before every merge".

**My lean (T9): add the minimal CI anyway.** Claude Code will write most of the code, and an automatic check on every push is the cheapest guard against a silent regression. Setup is about an hour. E2E stays local.

### I2: Can prices be random?

Yes, as **seeded randomness**. A pseudo-random generator seeded with the asset and the date produces a random walk that looks real (drift, volatility by asset type, crypto swinging most), but the same asset and date always give the same price.

That buys three things that `Math.random` cannot:

- Tests can assert exact values.
- A catch-up after a week offline produces the same days on every machine.
- Rebuilding the database does not rewrite history.

Prices become global reference data, one series per asset shared by every user, scaled to each currency by a fixed mock factor. Holdings stay private under RLS. Writing prices needs the system role, because they belong to no single user.

### E5: Store times as UTC and show them local?

Yes for instants, with one addition. Here is what goes wrong with UTC alone.

You buy coffee at 00:30 on 1 November in India (UTC+5:30). In UTC that is 19:00 on 31 October. The server must convert with your timezone every time it buckets by month. That works until the timezone changes: in Dubai (UTC+4) the same instant is 23:00 on 31 October, so the coffee moves to October and October's Budget and report change after the fact.

| Option           | Stores                                         | Month bucketing                            | Weakness                                                           |
| ---------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| A, current spec  | Calendar date only                             | The date                                   | No time of day                                                     |
| B, your proposal | UTC instant only                               | Converted with the timezone in every query | A timezone change rewrites history; every query does timezone math |
| C, my lean       | UTC instant plus the local date fixed at entry | The stored date, no conversion             | One extra column                                                   |

**Lean C (E14).** `occurred_at` is a UTC instant used for ordering and display. `occurred_on` is the calendar date in the profile timezone at the moment of entry, and every sum, Budget, report and heat map uses it. The server stays pure UTC for instants, and a date has no timezone at all, so no SQL timezone math is needed. Display converts `occurred_at` to the profile timezone.

Times of day also make a weekday-by-hour heat map possible, which was ruled out before (K6).

### Q10: The separate auth role, explained

Today's plan has three roles. The auth tables (user, session, account) sit outside RLS, because login reads them before any user is known. That means whichever role can read them sees every row. If the runtime role, which serves every finance request, has access to them, one bug anywhere in a finance endpoint could run:

```sql
select u.email, s.token from "user" u join session s on s.user_id = u.id;
```

That returns every user's email and live session token. Better Auth stores the session token in the session table and uses it as the cookie value ([source](https://www.better-auth.com/docs/concepts/session-management)), so a leaked token is a logged-in session as that user. RLS cannot stop this, because those tables are outside it by design.

The fix is a fourth role, so no single role sees both worlds.

| Role    | Used by                                              | Can touch                                        |
| ------- | ---------------------------------------------------- | ------------------------------------------------ |
| owner   | Migrations                                           | Everything (schema changes)                      |
| auth    | Better Auth only, through its own connection pool    | Auth tables only                                 |
| runtime | Every finance request, through the data access layer | Finance tables under RLS; nothing in auth tables |
| system  | Stripe webhook, seed scripts, global price catch-up  | Bypasses RLS, in one named module                |

A request then flows like this:

1. The data access layer asks Better Auth for the session; Better Auth reads it through the auth pool and returns the user id.
2. The layer opens a transaction on the runtime pool, sets `app.user_id`, and runs finance queries under RLS.

Finance tables can still reference `user.id` with a foreign key, because Postgres runs foreign-key checks with the table owner's rights, not the caller's. The cost is one extra pool and one extra role in migrations. The RLS suite gains one test: the runtime role cannot select from any auth table.

### P5: Offline logout

Your plan is right and matches my lean. If the queue is empty, wipe everything. If it is not empty, show a modal: "3 changes have not reached the server. Logging out now deletes them." with Cancel and Delete and log out. When online, try to sync first and show only what still fails.

There is one hole to close (P13). The session cookie is `httpOnly`, so JavaScript cannot delete it, and offline the server cannot be told. After the wipe, the next online visit still sends a valid cookie, so the user is logged straight back in. On a shared device, that is the next person getting in.

The fix: an offline logout writes a small "logout pending" marker that holds no user data. On start, the app sees it and shows the login screen without using the session. On the first successful network request it calls sign-out, which revokes the session and clears the cookie, then removes the marker.

### H3: Completed Goals and the cap

Agreed: active Goals count toward the 3, and a completed or archived Goal reopens only when a slot is free. That leaves one rule to settle (H9): does reaching 100% complete a Goal automatically?

**Lean: no. At 100% the app offers "Mark as completed".** Withdrawals (H1) can push a Goal back under 100%, so automatic completion would move Goals in and out of the cap without the user doing anything. Completed Goals are read-only: no contributions and no withdrawals.

For the lapse (H4, user picks): until the user chooses, the 3 oldest active Goals stay editable and the rest are locked read-only, with a banner "Choose which 3 Goals stay editable" (H10).

### M5: The best way to make PDFs

**Server-side Chromium through Playwright.** It renders the same React components and charts as the screen, so a PDF cannot disagree with what you saw. It gives a real download button, page numbers and header/footer templates. Playwright is already a dependency for E2E.

The other options each break something:

- A print stylesheet goes through the print dialog, and output varies by browser.
- `@react-pdf/renderer` needs a second layout system, with charts redrawn in its own primitives.

To keep Chromium safe and fast:

- Keep one warm browser instance.
- Turn chart animation off on the print route, and signal "ready" when ECharts reports it has finished rendering.
- Pass a short-lived signed token instead of the user's cookie.
- Render only an allow-list of the app's own routes.

### Pushback 16, and proxy.ts in general

Yes. `proxy.ts` (Next.js 16's renamed middleware) gets four jobs:

1. Optimistic redirects: no session cookie on a private page sends you to `/login`; a logged-in user on `/login` goes to `/dashboard`.
2. Security headers and the CSP.
3. An early reject of cross-origin or non-JSON mutating requests. The route-handler wrapper repeats this check, because proxy is never the only gate.
4. A request id, for logs and Sentry.

It never authorizes data access; the data access layer does.

One tradeoff to decide (T10). A strict CSP uses a per-request nonce, and [Next.js documents](https://nextjs.org/docs/app/guides/content-security-policy) that nonces force every page to render dynamically: no static generation, no ISR, and no Partial Prerendering. App pages are dynamic anyway (per-user data), so the cost lands on Learn. The options:

| Option                            | Strength                   | Cost                                                        |
| --------------------------------- | -------------------------- | ----------------------------------------------------------- |
| Nonce CSP everywhere              | Strictest                  | Learn is rendered per request; CMS data can still be cached |
| Experimental SRI (hash-based CSP) | Strict, keeps static pages | Marked experimental by Next.js                              |
| `'unsafe-inline'` scripts         | Weak                       | None                                                        |

**Lean: nonce CSP everywhere.** On localhost, rendering Learn per request costs little.

### D1: Store the smallest unit, render by currency

Yes, that is the plan (D-31): amounts are integers in the smallest unit, and one lookup table says how to read them.

| Code | Exponent | Stored | Shown (en-IN) |
| ---- | -------- | ------ | ------------- |
| INR  | 2        | 124050 | ₹1,240.50     |
| JPY  | 0        | 1240   | ¥1,240        |
| KWD  | 3        | 1250   | KWD 1.250     |

Each row also carries demo-data magnitudes and a default region. Rendering goes through `Intl.NumberFormat` with the region's locale.

One nuance on "like Stripe": use **ISO 4217 exponents**, which is what `Intl` uses, not Stripe's rules. Your finance amounts never go to Stripe. Stripe's quirks (its zero-decimal list, three-decimal currencies that must end in 0) matter only for the Premium price. A unit test asserts that the table agrees with `Intl` for every listed currency. Which currencies, though, is still open (D8).

### D4: Week start

Yes: a "Week starts on" setting stored per account, so reports and the heat map agree across devices. The default comes from the region via CLDR data, with a small fallback table where the browser lacks it. Note that CLDR's default for India is Sunday (from memory, to check), so many users would see Sunday until they change it (D10).

### D5: The 10-day window, and validating edits

Anchor the window to when the Transaction was recorded, not to today (D9). The rule: the date must fall between the recording date minus 10 days and the recording date, where the recording date is `created_at` converted to the profile timezone.

- **On create:** recorded 16 Oct, so 6 to 16 Oct is allowed.
- **On edit, two months later:** the date can still move within 6 to 16 Oct. Payee, amount, category and note are always editable.
- **Offline:** created on 16 Oct and synced on 20 Oct, it is validated against 16 Oct and accepted.
- **Server check:** reject a `created_at` later than the server clock plus 5 minutes.
- **Exempt:** system-generated rows (Subscription charges, demo data) skip the window.

A changed device clock could game this. Since it is the user's own data, this rule is a guard against mistakes, not a security control.

### N1 and N3: Yearly discount and price by country

A yearly discount needs no coupon: make the yearly Price cheaper than 12 months, for example 10 months' price, shown as "2 months free" (N8). Promotion codes are optional; Stripe's Checkout Sessions API supports discounts natively.

Price by country also works. The same API supports manual currency prices (one Price with an amount per currency), and the form shows whatever total the session returns. Lean: INR for India, USD everywhere else, picked from the profile country (N3). Your Stripe sandbox's own country decides which currencies and payment methods it offers; check that when you create it.

### N4: Stripe Elements instead of Checkout pages

My mistake: the old spec tagged hosted Checkout as Decided, and I carried it forward. The four ways to collect the first payment:

| Option                                                  | What the user sees                                                              | Your code |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| Hosted Checkout                                         | Redirect to a Stripe page                                                       | Least     |
| Embedded Checkout                                       | Stripe's full form inside your page                                             | Little    |
| Elements with Checkout Sessions (`ui_mode: 'elements'`) | Your own form built from the Payment Element, styled through the Appearance API | Moderate  |
| Elements with Subscriptions API                         | Your own form; you create the subscription and confirm its first payment        | Most      |

**Lean: Elements with Checkout Sessions (N9).** Stripe calls it "the recommended approach for most integrations", with discounts and currency handling built in ([source](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=elements&api-integration=checkout)), and Claude Design gets full control of the form.

For managing the plan (cancel, switch monthly and yearly, update card, invoices), I lean to the hosted Customer Portal. It is a redirect, but building those screens in-app costs days.

The reconcile on return (round-1 N4) still applies. After payment, the server reads the session and calls List Active Entitlements, which Stripe recommends "to reconcile state after a webhook delivery failure" ([source](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api)).

### N6: Failed renewals, confirmed

Stripe revokes entitlements when a subscription is cancelled, "or their subscription is cancelled automatically due to failed payments" ([source](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api)). So Premium stays during payment retries and ends when the retries run out. Two things follow:

- Configure Stripe's retry settings to cancel after the final attempt.
- Show a "Payment failed, update your card" banner while the subscription is past due.

### O4: Search scopes and tags

O4 only asked how many results to show per group, but your idea is better. **Lean (O6):**

- The palette gets scope chips: All, Transactions, Subscriptions, Goals, Learn, Actions.
- Typing a prefix jumps to a scope: `t:`, `s:`, `g:`, `l:`, and `>` for actions, as in VS Code.
- A scoped search shows up to 20 results and a "See all" link.
- Field operators such as `amount:>500 category:food` are a stretch goal.

### P6: Can the queue hold items during an update?

Usually it is empty, but not always:

- Rejected items wait for the user even while online.
- A 401 pauses the queue until login.
- An update can be found at the moment of reconnecting, while replay is still running.
- A tab can stay on the old version, go offline again and queue more.

So before reloading, finish any in-flight replay. Items survive the reload and are migrated by schema version.

### P8: Where the badge appears

On the installed app's icon: taskbar, dock or home screen. It exists only when the app is installed. Support, from memory and to re-check in P1: Chromium on Windows, macOS and ChromeOS; Safari web apps on macOS; iOS home-screen apps after notification permission is granted.

**Proposed count:** changes waiting to sync plus rejected items needing action, the same number the header's sync indicator shows, and cleared at zero.

### P9: Should we provide push?

Not by default; the brief does not ask for it. Push needs VAPID keys, stored subscriptions per device and a server that sends messages. You built all of that in Outpost.

The catch is your setup. Event-driven pushes work whenever your server is running:

- A Budget crossing 100% when another device syncs a Transaction.
- Premium activated, or a payment failed, from the Stripe webhook.

Scheduled pushes, such as "Netflix renews tomorrow" at 9:00, only fire if the server happens to be running then. On iOS, push works only in installed home-screen apps.

**Lean (P12): opt-in, with those two event types plus renewal reminders, in M7 behind a flag.**

### Q2: Upper, lower, number, special

I would push back here (Q12). NIST's guidance (SP 800-63B) says not to require character classes, because they produce predictable passwords like `Password1!` and annoy users without adding much strength.

What works better:

- A minimum length (8, or 12 if you want it stricter).
- Blocking breached passwords. Better Auth has a [Have I Been Pwned plugin](https://www.better-auth.com/docs/plugins/have-i-been-pwned) that sends only the first 5 characters of the password's hash, never the password.
- A strength meter.

If you still want the four rules, they are one Zod refinement on signup and change-password.

### Q9: Country and timezone at onboarding

Yes, ask both. The timezone is pre-filled from the browser and limited to the zones of the chosen country, because India has one zone and the US has several. The currency is pre-filled from the country.

About editing (Q13): with time model C, changing the timezone no longer rewrites history, so allowing timezone edits is cheap and safe. The country can stay fixed.

### S1 and S2: Is Sanity free, and can public content be limited?

Free: [Sanity's Free plan](https://www.sanity.io/pricing) is $0 forever, with 20 seats, 10k documents, 250k API requests and 1M CDN requests a month, and 100 GB of bandwidth and of asset storage. It lists no overage charges, so going past a limit does not bill you. The one catch: datasets are public-only, so anyone can query normal documents through Sanity's API.

That still lets us limit content. In a public dataset, documents whose ID contains a dot are private and need a token (Sanity support threads, seen in search results only). So:

- Public posts use normal IDs.
- Members-only posts use `members.<id>`, and Premium posts use `premium.<id>`.
- Daybook's server checks the session or entitlement, then fetches gated posts with a read token that never reaches the browser.
- Images stay public either way.

Lean tiers (S7): public gets News and a few articles; members get all articles and guides; Premium gets in-depth guides. The last tier adds a Premium feature, so the Free vs Premium table changes.

### T8: Feature flags, permissions and Premium gating

You are right that this needs its own spec (P4). Three ideas usually get mixed up:

| Idea         | Answers                                 | Source in Daybook                                        |
| ------------ | --------------------------------------- | -------------------------------------------------------- |
| Entitlement  | What does the plan include?             | Stripe feature lookup keys                               |
| Feature flag | Is this feature switched on at all?     | A typed config file (lean) or a database table           |
| Permission   | May this user do this to this resource? | Row ownership through RLS; roles only if they ever exist |

**Lean (T11): one capability registry and one check, `can(user, code)`.**

- The registry is a typed list of codes shared by frontend and backend.
- The check combines the plan's entitlements, the flags, and later roles.
- The server is the authority. The client receives the resolved list at session start, for rendering only.
- Stripe feature lookup keys use the same codes, so the webhook stores them as they arrive.

```text
analytics.heatmap.view        Premium
analytics.comparative.view    Premium
reports.quarterly.generate    Premium
reports.annual.generate       Premium
goals.active.unlimited        Premium
learn.premium.read            Premium (if S7)
offline.writes                flag
sync.background               flag
push.notifications            flag
search.operators              flag
dashboard.dragAndDrop         flag (stretch)
insights.detector.<name>      flag, one per detector
monitoring.sessionReplay      flag
```

On "permission codes for everything": Daybook has one role, so every user would hold every permission and the codes would decide nothing. Row ownership is already enforced by RLS. If you foresee roles (a household member, a read-only viewer, an admin for flags), say so and P4 designs for them.

### U: React Aria, Zod, TanStack Form, and the TanStack suite

Tailwind with React Aria Components fits well. React Aria brings accessible behavior, and Claude Design styles it. The command palette can be built from React Aria's Autocomplete and Menu, so cmdk is not needed.

| Need                                    | Library                | Status                                                                          |
| --------------------------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| Server data, cache, offline persistence | TanStack Query         | Stable                                                                          |
| Forms                                   | TanStack Form with Zod | Stable                                                                          |
| Long-list virtualization                | TanStack Virtual       | Stable                                                                          |
| Report and Budget tables                | TanStack Table         | Stable                                                                          |
| Keyboard shortcuts                      | TanStack Hotkeys       | Alpha (0.8.0) per [its docs](https://tanstack.com/hotkeys/latest/docs/overview) |
| UI state                                | Zustand                | Stable; still the brief's required state library                                |

Two cautions (U5):

- **TanStack Hotkeys is alpha.** Pin the exact version and wrap it behind one hook, so it can be replaced with about 30 lines if it breaks.
- **React Aria and TanStack overlap on lists.** React Aria's Table and GridList bring their own keyboard navigation, selection and virtualization; TanStack Table plus TanStack Virtual do the same jobs headlessly. Using both on one list duplicates the selection state and fights over scrolling. **Lean:** the Transactions list uses React Aria's GridList with its own virtualizer, fed by TanStack Query's infinite pages. TanStack Table handles the report and Budget tables.

### R1: Seeded scenario accounts

Proposed set (R5). Each account proves something a test or demo needs.

| Account    | Plan            | Currency, timezone    | Data                      | Proves                                                                   |
| ---------- | --------------- | --------------------- | ------------------------- | ------------------------------------------------------------------------ |
| new        | Free            | INR, Asia/Kolkata     | Only the portfolio        | Empty states                                                             |
| student    | Free            | INR, Asia/Kolkata     | 6 months, about 600 rows  | Low income, overspent Food, 2 Goals                                      |
| family     | Premium yearly  | INR, Asia/Kolkata     | 3 years, about 6,000 rows | Every Budget, rent and EMI Subscriptions, 6 Goals                        |
| freelancer | Free at cap     | USD, America/New_York | 18 months                 | Irregular income, negative-savings months, 3 active and 2 archived Goals |
| lapsed     | Premium ended   | EUR, Europe/Berlin    | 2 years                   | 5 Goals with 2 locked, quarterly report blocked                          |
| yen        | Premium monthly | JPY, Asia/Tokyo       | 1 year                    | Exponent 0                                                               |
| dinar      | Free            | KWD, Asia/Kuwait      | 1 year                    | Exponent 3                                                               |
| stress     | Premium         | USD, UTC              | 100,000 rows over 5 years | Performance budgets                                                      |

Premium states are seeded directly through the system role. Real Stripe flows (renewal, failure, lapse) are exercised with test clocks instead.

### A2: Can this fit 10 to 12 business days?

Tight, but possible if the per-feature specs are written **just in time**: the root spec, decisions and golden dataset first, then each feature's spec on the morning its milestone starts. Writing all 19 specs upfront would spend 3 or 4 days before any code exists. Proposed plan (A8):

| Day    | Build                                           | Specs written first                                      |
| ------ | ----------------------------------------------- | -------------------------------------------------------- |
| 1      | none                                            | Root spec, decisions, golden dataset, P2, P4, F01 to F03 |
| 2      | M0 Foundation                                   | none                                                     |
| 3      | M1 Transactions, demo generator                 | F15                                                      |
| 4      | M2 Budgets, Subscriptions, Goals                | F04 to F06                                               |
| 5 to 6 | M3 Dashboard, Analytics, Investments            | F07 to F09                                               |
| 7      | M4 Premium                                      | F12                                                      |
| 8 to 9 | M5 Offline and PWA                              | P1                                                       |
| 10     | M6 Reports, Insights, Search                    | F10, F11, F13                                            |
| 11     | M7 Learn, push, performance                     | F14, P3                                                  |
| 12     | Buffer: accessibility, tests, scenario accounts | none                                                     |

The riskiest days are 7 (Stripe Elements) and 8 to 9 (offline writes); slips will land there. **Cut line, dropped first if late:** push, Learn access tiers, search operators, app badge, weekday-by-hour heat map, bulk delete, data export, drag-and-drop layout.

## New questions

Root questions block the root spec; Feature questions can wait for that feature's morning. Reply as before, for example `E14: C`.

### Root

- **J1 (again) · Dashboard period.** You approved the month picker in the pushbacks but answered B (date ranges) in the questions. (A) Month picker. (B) Date ranges with presets. (C) Month picker on the dashboard, date ranges on Transactions and Analytics. **Lean C:** Budgets need calendar months; free ranges belong where nothing is month-bound.
- **F1 · Budget carry-forward.** Does a limit repeat every month until changed? **Lean yes.**
- **F4 · Overall utilization.** Budgeted categories against the sum of their limits, with unbudgeted spending shown beside it? **Lean yes.**
- **F2, F3, F5 to F8.** If you are happy with all my round-1 leans for these, reply `F: lean`.
- **A8 · Plan.** Accept the 12-day plan, just-in-time feature specs and the cut line? **Lean yes.**
- **D8 · Currencies.** Send your list, or take INR, USD, EUR, GBP, JPY, KWD? **Lean mine,** unless you have a reason to add more.
- **E14 · Time model.** (A) Date only. (B) UTC instant only. (C) UTC instant plus the local date fixed at entry. Is a time required? What time do generated charges get? **Lean C;** time always present, defaulting to now and editable; generated charges show "Auto" instead of a time.
- **N9 · Payments UI.** Elements with Checkout Sessions for purchase, and the hosted Customer Portal for managing? **Lean yes.**
- **T9 · CI.** Add the minimal CI (lint, typecheck, unit and RLS tests with a Postgres container)? **Lean yes.**
- **T11 · Capabilities.** One registry and `can()` for entitlements and flags; flags in a typed config file; no roles unless you foresee them. Do you foresee roles? **Lean no roles.**
- **U5 · List components.** React Aria GridList with its own virtualizer for Transactions; TanStack Table for report and Budget tables; TanStack Hotkeys pinned and wrapped? **Lean yes.**
- **A7b · Repository visibility.** Public or private? Both fit the free tiers. Public means unlimited CI minutes; private means about 2,000 a month. **No lean.**

### Feature

- **D9 · Date window.** Date within 10 days before the recording date, edits anchored to that date, system rows exempt? And does "10 days" mean today plus the 10 days before? **Lean yes to both.**
- **D10 · Week start options.** Monday, Sunday and Saturday, stored per account? **Lean yes.**
- **E15 · Required text.** Payee optional (up to 80 characters), description required (up to 120), note optional (up to 500)? **Lean yes.**
- **E16 · Bulk delete.** In v1, using the list's selection mode, with one Undo for the batch? **Lean yes, as a cut-line item.**
- **E17 · "Received initials".** I read this as: reserve the leading spot in each row for an avatar with the payee's initials now, and a receipt thumbnail later. Right?
- **H9 · Completing a Goal.** Offered at 100% and confirmed by the user, never automatic; completed Goals are read-only? **Lean yes.**
- **H10 · Lapse default.** The 3 oldest active Goals stay editable until the user picks? **Lean yes.**
- **I3 (again) · "Integrate".** Did you mean: seed holdings with dated buys and sells, so time-weighted return is meaningful, and show it? **Lean yes, still no XIRR.**
- **I6 · Portfolio seeding.** Seeded when onboarding completes (once the currency is known), different for each user but stable, prices shared globally? **Lean yes.**
- **K6 · Weekday-by-hour heat map.** Now possible with times. Add as a Premium chart? **Lean yes, on the cut line.**
- **N3 (again) · Price.** INR for India and USD elsewhere? Which amounts? **No lean on amounts.**
- **N8 · Yearly discount.** Yearly costs 10 months' price; promotion codes too? **Lean the cheaper yearly price; promotion codes as stretch.**
- **O6 · Scoped search.** Scope chips plus prefixes now, field operators as stretch? **Lean yes.**
- **P12 · Push.** Opt-in push for Budget crossings, Premium and payment events, and renewal reminders, behind a flag in M7? **Lean yes, on the cut line.**
- **P13 · Logout marker.** Accept the "logout pending" marker? **Lean yes.** Without it, an offline logout does not actually log out.
- **Q12 · Password rules.** (A) Upper, lower, number and special required. (B) Length plus a breached-password check plus a strength meter. **Lean B.**
- **Q13 · Timezone edits.** Allow changing the timezone later, keep the country fixed? **Lean yes.**
- **R5 · Scenario accounts.** Accept the 8 accounts, or add some? **Lean accept.**
- **S4 · Revalidation.** Still open; lean Sanity Live.
- **S7 · Learn tiers.** Public, members and Premium tiers, with dotted IDs for the gated ones? **Lean yes.**
- **T10 · CSP.** Nonce CSP everywhere, making Learn dynamic? **Lean yes.**
- **B7 · Old brief and spec.** Once `00`, `01` and `02` exist: delete them (git keeps history) or move them to `docs/archive/`? **Lean delete.**

## Answers to round 2

Every Root question is answered, so the root spec can be written. Two answers carry a change I am adding, marked "see below": E15 (payee) and A8 (spec order).

| ID                                                                   | Decision                                                                                                                                                                                                                                                                                                                                       | Status                                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| J1                                                                   | Month picker on the dashboard; date ranges on Transactions and Analytics                                                                                                                                                                                                                                                                       | Decided                                                       |
| F1 to F8                                                             | Round-1 leans: limits carry forward; one-month override is Stretch; retroactive changes allowed with a warning; overall = budgeted categories against their limits, unbudgeted spending shown beside; removal ends from a chosen month; fixed 80% and 100%; alerts as insights plus card states; Subscription charges count and refunds reduce | Decided                                                       |
| A8                                                                   | No deadline. The day plan is dropped; milestone order stays; all specs are written before building                                                                                                                                                                                                                                             | Claude's call, see below                                      |
| D8                                                                   | INR, USD, EUR, GBP, JPY, KWD                                                                                                                                                                                                                                                                                                                   | Decided                                                       |
| E14                                                                  | UTC instant plus the local date fixed at entry; time always present, defaulting to now; generated charges show "Auto"                                                                                                                                                                                                                          | Decided                                                       |
| E15                                                                  | Payee required for income and expense, none for goal contributions; description optional; note optional                                                                                                                                                                                                                                        | Decided, see below                                            |
| E16                                                                  | Bulk delete with one Undo for the batch, tagged Stretch                                                                                                                                                                                                                                                                                        | Decided                                                       |
| E17                                                                  | Row avatar with the payee's initials now, receipt thumbnail later                                                                                                                                                                                                                                                                              | Decided                                                       |
| D9, D10, H9, H10, I3, I6, K6, N8, O6, P12, P13, Q13, R5, S4, S7, T10 | Round-2 leans                                                                                                                                                                                                                                                                                                                                  | Decided                                                       |
| N3                                                                   | INR for India, USD elsewhere. Amounts: 399 INR or 4.99 USD monthly, 3,990 INR or 49.90 USD yearly (10 months' price)                                                                                                                                                                                                                           | Claude's call; change freely, prices are Stripe configuration |
| N9                                                                   | Elements with Checkout Sessions for purchase; hosted Customer Portal for managing                                                                                                                                                                                                                                                              | Decided                                                       |
| Q12                                                                  | Minimum 12 characters, maximum 128, breached-password check, strength meter; no composition rules                                                                                                                                                                                                                                              | Decided; 12 is Claude's call                                  |
| T9                                                                   | Minimal CI: lint, typecheck, unit and RLS tests against a Postgres service container                                                                                                                                                                                                                                                           | Decided                                                       |
| T11                                                                  | In-house capability registry, below                                                                                                                                                                                                                                                                                                            | Claude's call                                                 |
| U5                                                                   | GridList for Transactions; TanStack Table for report and Budget tables; Hotkeys pinned and wrapped                                                                                                                                                                                                                                             | Decided                                                       |
| A7b                                                                  | Public repository. Secrets stay in an uncommitted `.env`, with a committed `.env.example`                                                                                                                                                                                                                                                      | Decided                                                       |
| B7                                                                   | Delete the old brief and spec once `00`, `01` and `02` exist                                                                                                                                                                                                                                                                                   | Decided                                                       |
| S1, S2                                                               | Learn content is mock, so gated-content security is not a requirement. Dotted IDs stay, since they cost nothing                                                                                                                                                                                                                                | Decided                                                       |

**E15: payee required.** Agreed. Every income and expense has a counterparty, and the payee drives search, the row initials (E17) and payee autocomplete. A goal contribution's counterparty is the Goal, so it has no payee. A Subscription charge takes the Subscription's name as its payee.

My change: with the payee required, the **description becomes optional**. Otherwise every quick entry needs two text fields ("Swiggy" and "Dinner"). The list shows the payee as the title and the description as the subtitle when present. Limits: payee 80 characters, description 120, note 500.

**A8: spec order without a deadline.** Write every spec before building, in the dependency order from round 1, then do one consistency pass across them. During building, any change in behavior updates its spec in the same commit. The round-2 cut line becomes Stretch tags.

### Capabilities: my recommendation (T11)

Build a small in-house capability system: one registry, a few sources, one check. The server evaluates it; the client caches the result for display and offline use. No hosted flag service, and no roles.

**Why in-house**

- **Offline.** The PWA must know what is switched on while offline. A hosted service's browser SDK cannot reach its server then, so we would cache its values ourselves anyway.
- **One place to ask "why is this hidden".** Premium and flags go through the same check.
- **Small.** No extra account, SDK or network call; roughly 150 lines.
- **Considered and not taken:** hosted services (PostHog, GrowthBook, Flagsmith, LaunchDarkly), the OpenFeature standard and Vercel's Flags SDK. Each adds an account or a layer of abstraction over a single provider, and none solves a problem we have. The flag source sits behind one small interface, so a provider can be plugged in later.

**The parts**

1. **Registry.** `capabilities.ts`, a typed `as const` list. Each entry has a code, a kind (`premium`, `flag`, or both), a description, a default for flags, and whether the client may see it.
2. **Sources.** Premium codes come from Stripe entitlements. Flags resolve through the layers below; each later layer overrides the earlier ones.

    | Layer                         | Example                          | Set by                                                  |
    | ----------------------------- | -------------------------------- | ------------------------------------------------------- |
    | Default                       | `push.notifications`: off        | The registry, in code                                   |
    | Rollout percentage (optional) | `search.operators`: 25% of users | The registry; a stable hash of user id and code decides |
    | Per-user override             | Push on for the family account   | A CLI script through the system role                    |
    | Kill switch                   | `FLAG_OFFLINE_WRITES=off`        | `.env`; beats everything                                |

3. **Server check.** `resolveCapabilities(user)` runs once per request (cached with React's `cache`). Route handlers and the data access layer call `can(code)` or `assertCan(code)`. A refusal is a 403 carrying a reason, `premium_required` or `feature_off`; only the first shows an Upgrade prompt.
4. **Client.** `/api/me` returns the profile and the resolved capabilities with their reasons. TanStack Query persists it, so it works offline with an "as of" time. `useCan(code)` and a `<Gate code>` component render the locked card (K5) for Premium and nothing for an off flag. The client never enforces anything.
5. **Stripe.** Each Premium code is the lookup key of a Stripe Feature attached to the Premium product, so the webhook stores keys as they arrive.
6. **Tests.** Every Premium code exists in the Stripe setup script, every gated endpoint has a test for its 403, and rollout hashing is stable.

Changing a flag means editing the registry or `.env` and restarting, or running a script such as `npm run flag -- push.notifications on --user family@daybook.test`. There is no admin page, because there is no admin role.

If a capability turns off while a user has queued writes that need it, replay gets a 403 `feature_off` and the item shows as rejected, like any other refusal. If roles ever arrive, they become one more input to the same check; call sites do not change.

## Sources

Opened on 16 October 2026:

- [Stripe: Build a subscriptions integration, Elements with Checkout Sessions](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=elements&api-integration=checkout)
- [Stripe: Entitlements (API)](https://docs.stripe.com/billing/entitlements?dashboard-or-api=api)
- [Sanity pricing](https://www.sanity.io/pricing)
- [Next.js: Content Security Policy](https://nextjs.org/docs/app/guides/content-security-policy)
- [SonarQube Cloud: Automatic analysis](https://docs.sonarsource.com/sonarqube-cloud/advanced-setup/automatic-analysis/)
- [Better Auth: Have I Been Pwned plugin](https://www.better-auth.com/docs/plugins/have-i-been-pwned)
- [Better Auth: Session management](https://www.better-auth.com/docs/concepts/session-management) (opened 15 October)

Seen in search results only, so re-check before relying on them:

- [GitHub changelog: Actions pricing update](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/) and third-party pricing summaries (minutes and storage figures)
- [Sanity: IDs and paths](https://www.sanity.io/docs/ids) and Sanity support threads (dotted IDs are private)
- [TanStack Hotkeys overview](https://tanstack.com/hotkeys/latest/docs/overview) (alpha status)
