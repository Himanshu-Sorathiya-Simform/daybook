# Daybook: Brief

16 Oct 2026 · @Himanshu

Daybook is a multi-user personal finance and investment dashboard (POC 4) on a real backend. It is built to teach dashboard architecture, data visualization, state management and offline behavior on data that must be correct. This brief is the five-minute version; the contract is [01-root-spec.md](01-root-spec.md), and every decision with its reason is in [02-decisions.md](02-decisions.md).

## In three lines

1. Users record Transactions (income, expenses, refunds, Goal contributions and withdrawals) and manage Budgets, Subscriptions and Goals. A mock investment portfolio sits beside them, and a dashboard of metrics and charts sits on top.
2. A Next.js 16 backend with Neon Postgres (row-level security), Better Auth and Stripe in test mode (Daybook Premium) serves real, isolated user data. Investments, prices and AI insights are mocked and seeded.
3. The client is an installable PWA. It shows its last-known data offline, queues offline writes and replays them exactly once, and is measured against performance budgets.

## What changed from the original brief

| Original                         | Now                                                                            | Why                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Mocked APIs through JSON Server  | Real Postgres behind Next.js; only investments, prices and insights are mocked | Auth, Stripe, per-user isolation and offline writes need a real server                               |
| No financial calculations        | Calculations exist and must be correct; aggregation runs in SQL on the server  | Every dashboard number is a calculation, and a wrong one is the worst failure a finance app can have |
| Expenses in five categories      | Transactions of five types, one category each, from expanded fixed lists       | Income, refunds and Goals are needed for savings and Budgets to mean anything                        |
| Two roles, User and Premium User | One kind of user; Premium is a billing entitlement                             | Premium starts, lapses and returns; a role does not                                                  |

## Objectives

The six original skills: dashboard development, data visualization, complex state management, filtering, reporting, and frontend performance optimization.

Added: correct money and time handling, per-user isolation enforced by the database, an offline write path that cannot lose or duplicate changes, and performance measured against stated budgets.

## Features

| Area                      | What the user gets                                                        | Milestone |
| ------------------------- | ------------------------------------------------------------------------- | --------- |
| Auth and account          | Email and password, sessions list, change password, export, reset, delete | M0, M1    |
| Onboarding and settings   | Country, currency, timezone, week start, theme, dashboard layout          | M1        |
| Transactions              | Fast entry, infinite list, filters in the URL, In / Out / To Goals totals | M1        |
| Budgets                   | Monthly limits per category that carry forward, 80% and 100% alerts       | M2        |
| Subscriptions             | Any recurring bill; past charges written into Transactions automatically  | M2        |
| Goals                     | Contributions and withdrawals, 3 active Goals free, unlimited on Premium  | M2        |
| Investments               | A seeded mock portfolio with daily prices, gains and time-weighted return | M3        |
| Dashboard and Analytics   | Month dashboard of widgets; Analytics page with every chart               | M3        |
| Daybook Premium           | Stripe Elements purchase, Customer Portal management, entitlements        | M4        |
| Offline and PWA           | Installable, last-known data offline, queued writes, sync panel           | M5        |
| Reports, Insights, Search | PDF and CSV reports, rule-based insights, command palette                 | M6        |
| Learn                     | Articles, news and guides from Sanity, public and gated                   | M7        |
| Extras                    | Push, app badge, bulk delete, data export, drag-and-drop layout and more  | M8        |

## Free and Premium

| Feature                                                                                 | Free | Premium   |
| --------------------------------------------------------------------------------------- | ---- | --------- |
| Dashboard, Transactions, Budgets, Subscriptions, Investments, Insights, search, offline | Yes  | Yes       |
| Active Goals                                                                            | 3    | Unlimited |
| Line, bar and donut charts                                                              | Yes  | Yes       |
| Calendar heat map, comparative charts                                                   | No   | Yes       |
| Weekday-by-hour heat map (Stretch)                                                      | No   | Yes       |
| Monthly report (PDF and CSV)                                                            | Yes  | Yes       |
| Quarterly and annual reports                                                            | No   | Yes       |
| Learn: public posts                                                                     | Yes  | Yes       |
| Learn: members posts (Stretch)                                                          | Yes  | Yes       |
| Learn: Premium guides (Stretch)                                                         | No   | Yes       |

Prices: 399 INR or 4.99 USD a month; 3,990 INR or 49.90 USD a year. India pays in INR; everyone else in USD. When Premium lapses, nothing is deleted: extra Goals lock read-only and Premium views show an upgrade prompt.

## Stack

| Layer           | Choice                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------- |
| App and backend | Next.js 16 (App Router, route handlers, `proxy.ts`), TypeScript, React Compiler                   |
| Database        | Postgres on Neon (free tier), row-level security, Drizzle ORM                                     |
| Auth            | Better Auth, email and password                                                                   |
| Client data     | TanStack Query (persisted to IndexedDB), TanStack Form with Zod, TanStack Table, TanStack Hotkeys |
| UI state        | Zustand for UI state only; committed filters in the URL                                           |
| UI              | Tailwind CSS with React Aria Components; designed by Claude Design                                |
| Charts          | Apache ECharts 6                                                                                  |
| Payments        | Stripe test mode: Elements with Checkout Sessions, Customer Portal, Entitlements                  |
| CMS             | Sanity (free plan)                                                                                |
| PWA             | Serwist service worker; IndexedDB write queue                                                     |
| Quality         | Sentry, SonarQube Cloud, GitHub Actions CI, Vitest, MSW, Playwright                               |

## Success criteria

Daybook behaves like a production-grade finance dashboard on real, isolated data. It is accepted when each criterion in [01-root-spec.md, section 15](01-root-spec.md#15-success-criteria) can be demonstrated. In short:

- The dashboard, list totals and reports agree, and the golden dataset passes.
- No user can read or write another user's data.
- Offline data opens, syncs exactly once, and shows conflicts and rejections.
- Premium unlocks and locks correctly, enforced by the server.
- Reports match the screen, performance budgets are met, accessibility checks pass, and the app installs.

## Out of scope

Real bank connections, live market data and trading, a real language model, live payments and tax, multiple accounts and transfers, multi-currency, roles, passkeys and email verification, native apps, and Docker on the developer machine. The full list is in [01-root-spec.md, section 16](01-root-spec.md#16-out-of-scope).

## The docs

| File                                         | Holds                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [00-brief.md](00-brief.md)                   | This page                                                                                                  |
| [01-root-spec.md](01-root-spec.md)           | Cross-cutting rules: terms, routes, flows, conventions, architecture, API, security, capabilities, quality |
| [02-decisions.md](02-decisions.md)           | Every decision, its status and reason, and the options not taken                                           |
| [03-golden-dataset.md](03-golden-dataset.md) | A fixed dataset and the expected value of every number                                                     |
| `features/F01` to `F15`                      | One deep spec per feature, written from [features/_template.md](features/_template.md)                     |
| `platform/P1` to `P4`                        | Offline and PWA, data access and security, quality, capabilities                                           |
| [verification.md](verification.md)           | Sources behind every checked fact                                                                          |
| [reviews/](reviews/)                         | The question rounds that produced these decisions                                                          |
