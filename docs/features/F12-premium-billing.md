# F12 Premium and billing

17 Oct 2026 · @Himanshu

Daybook Premium is the paid plan, billed through Stripe in test mode.

- **Buying:** a Free user picks monthly or yearly on the billing page and pays in Daybook's own payment form, built from Stripe's Payment Element on a Checkout Session. Premium unlocks as soon as Stripe confirms the payment.
- **Managing:** cancelling, switching plans, updating the card and invoices live in Stripe's hosted Customer Portal.
- **Keeping in step:** Daybook keeps a copy of the user's plan and entitlements. One sync rereads them from Stripe, and the webhook, the app's reconcile call and a lazy billing check all run it. Purchases, renewals, failed payments and lapses therefore reach Daybook even when the Stripe CLI is not forwarding webhooks.

| Item       | Value                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M4. From M4, the locked card (P4) and the Goals limit message (F06) show Upgrade, and F15 seeds Premium states. Offline reading of the plan arrives with P1 (M5); report codes with F11 (M6)                                                                                                                                                                          |
| Plan       | Free and Premium. This feature sells Premium; it is gated by nothing                                                                                                                                                                                                                                                                                                  |
| Depends on | [P4](../platform/P4-capabilities.md) (entitlements, the resolver, `/api/me`), [P2](../platform/P2-data-access-and-security.md) (system module, webhook mode, CSP), [F02](F02-onboarding-profile-settings.md) (country, locale), [F01](F01-auth-and-account.md) (account deletion), [F06](F06-goals.md) (lapse locks), [F15](F15-demo-and-seed-data.md) (seeded plans) |
| Decisions  | D-18, D-27 to D-29, D-70, D-125 to D-132, D-167, D-184, D-199, D-201, D-297 to D-317                                                                                                                                                                                                                                                                                  |

## 1. User stories

- As a Free user, I want to see what Premium adds and what it costs in my currency, so that I can decide.
- As a Free user, I want to upgrade from the spot where I hit a locked feature, and have it unlock straight away.
- As a Premium user, I want to cancel, switch between monthly and yearly, update my card and see invoices.
- As a Premium user whose payment failed, I want to know, and to keep Premium while I fix it.
- As a user who cancelled, I want to keep Premium until the end of the period I paid for, and lose no data afterwards.
- As a developer, I want billing to work without the Stripe CLI running, and to test renewals and lapses without waiting a month.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                                                                                                                          | Stretch (M8)                                           | Out                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly and yearly prices in INR or USD; the billing page; the in-app payment form; the checkout, reconcile and portal endpoints; the webhook; the plan record and entitlements sync; the lazy billing check; activation; the header badge and past-due banner; Upgrade entry points; the Customer Portal configuration; `stripe:setup`, `stripe:listen` and `stripe:clock`; seeded plans; Stripe Customer deletion for F01 | Promotion codes (D-132, flag `billing.promotionCodes`) | Live mode and real payments; tax; free trials (D-126); Adaptive Pricing; in-app cancel or plan-switch screens (the portal does it); refunds; several plans or quantities; changing the price currency after the first purchase (the country is fixed, F02); Stripe's customer-configured Accounts v2 |

## 3. Concepts and fields

**Words** (NAM-1, D-70). In this spec, "subscription" in lower case means Stripe's object, which only billing code sees (root NAM-1 allows it there). Every text Daybook shows says "Premium" or "Daybook Premium". The Customer Portal's own wording is Stripe's and outside NAM-1.

**Plans** (`shared/billing/plans.ts`, D-125). The one source for amounts, lookup keys and plan copy. `stripe:setup` writes Stripe from it, and the billing page shows it.

| Interval | Price lookup key        | USD          | INR               | Shown as                       |
| -------- | ----------------------- | ------------ | ----------------- | ------------------------------ |
| `month`  | `daybook_premium_month` | 499 (4.99)   | 39900 (399.00)    | "a month"                      |
| `year`   | `daybook_premium_year`  | 4990 (49.90) | 399000 (3,990.00) | "a year", with "2 months free" |

Amounts are in Stripe's minor units, which for USD and INR match MON-1. Each Price is created in USD, with INR in its `currency_options`.

`plans.ts` also holds one line per Premium feature, each with its capability code and the milestone it ships in. The Compare plans table and the `from` headlines read these lines.

**Plan record** (private, system-written, one per user; P2 table "plan status"; D-297). Users read their own row through RLS and never write it, so it has no `version`.

| Field                               | Meaning                                                                                                    | Example                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `stripeCustomerId`                  | The user's Stripe Customer; unique; `null` until the first checkout, and after a Customer is cleared       | `cus_Q8...`                     |
| `customerGeneration`                | How many Customers have been cleared for this user; part of the creation key (BR-F12-05)                   | `0`                             |
| `source`                            | `stripe`, or `seed` for seeded plans (F15)                                                                 | `stripe`                        |
| `status`                            | `none`, `active`, `past_due` or `ended` (BR-F12-10)                                                        | `active`                        |
| `stripeSubscriptionId`              | The current Stripe subscription, or `null`                                                                 | `sub_1Q...`                     |
| `interval`                          | `month` or `year`, or `null`                                                                               | `year`                          |
| `priceCurrency`, `priceAmountMinor` | What the current subscription charges, or `null`                                                           | `INR`, `399000`                 |
| `currentPeriodEnd`                  | When the current period ends, or `null`                                                                    | `2027-10-17T09:12:00Z`          |
| `endsAt`                            | When a scheduled cancellation takes effect, or `null`                                                      | `null`                          |
| `scheduledInterval`, `scheduledAt`  | A plan switch Stripe will apply later, or `null`                                                           | `month`, `2027-10-17T09:12:00Z` |
| `endedAt`                           | Stripe's `ended_at` of the latest ended subscription, for display                                          | `null`                          |
| `lapseSeenAt`                       | The request clock when Daybook saw the latest end of Premium. F06 compares it with `goalsChosenAt` (D-313) | `null`                          |
| `duplicate`                         | More than one live subscription exists (BR-F12-13)                                                         | `false`                         |
| `closingAt`                         | When account deletion began, or `null`. A value less than 5 minutes old blocks billing calls (BR-F12-26)   | `null`                          |
| `syncSeq`, `lastSyncedAt`           | The sequence value and request clock of the sync that wrote the row (BR-F12-11)                            | `4812`, `2026-10-17T09:12:03Z`  |

A user who never checked out and was never seeded has no plan record. Every read treats that as `status: none`.

**Entitlements** (P4). Rows of `(userId, lookupKey, source, updatedAt)`. A sync replaces the user's set with Stripe's active entitlements.

**Processed events** (system table, P2). The ids of Stripe events already handled, kept for 30 days (D-308).

**The sync sequence.** `app.billing_sync_seq`, a Postgres sequence that orders syncs (BR-F12-11). The system role has `USAGE` on it (P2, section 3).

## 4. Business rules

**Plans and prices (D-125, D-126)**

- **BR-F12-01** Premium has two prices, monthly and yearly. The yearly price is ten months of the monthly one.
    - **Currency:** INR when the profile country is IN, USD for every other country. The country is fixed after onboarding (F02, BR-F02-17), so a Customer never needs a second currency.
    - **No trial, no tax:** there is no free trial (D-126) and no tax (root 16).
    - **Promotion codes:** Stretch, behind `billing.promotionCodes` (D-132).
- **BR-F12-02** A price is shown with `Intl.NumberFormat`, using the profile's `numberLocale` and the price's own currency, never the profile currency (MON-4).
    - **India:** ₹399.00 a month, or ₹3,990.00 a year.
    - **Germany, paying USD:** 4,99 $ a month.
    - **Kuwait, paying USD:** $4.99 a month (`en-KW`, F02).
    - **Yearly:** carries the badge "2 months free".

    Inside the payment form, the total shown is the one the Checkout Session reports, so Daybook never shows an amount that Stripe would not charge.

**The Stripe side (D-304, D-314)**

- **BR-F12-03** `server/billing/stripe.ts` is the only module that imports the Stripe SDK.
    - **API version:** it pins `apiVersion: '2026-09-30.endive'`, the current version when this spec was written, with the stripe-node release built for it.
    - **Customers:** Daybook uses Customers (v1), not customer-configured Accounts (v2).
    - **Keys:** test keys only. Startup refuses a live key (D-199; P2, AC-P2-16).
    - **Time budget:** every Stripe call has a timeout of 8 seconds or the time left in its request's budget, whichever is less. A handler's calls share a budget of 20 seconds. A call has one network retry when the budget allows. When the budget runs out, the request fails with 503 `billing_unavailable`.
- **BR-F12-04** Stripe errors map to responses this way, in handlers and in the webhook alike:

    | Stripe error                                                                                                      | Response                                                                                                                                                                                |
    | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
    | Connection error, timeout, 429, or Stripe 5xx (`StripeConnectionError`, `StripeRateLimitError`, `StripeAPIError`) | 503 `billing_unavailable`                                                                                                                                                               |
    | `resource_missing` for the stored Customer                                                                        | The Customer is cleared (BR-F12-12). Then checkout creates a new one; the portal answers 409 `no_billing_account`; reconcile answers with the cleared plan; a sync or the webhook stops |
    | `resource_missing` for a Checkout Session id                                                                      | 404 `not_found`                                                                                                                                                                         |
    | `resource_missing` when the webhook retrieves a Customer it does not know                                         | The event is recorded and answered 200                                                                                                                                                  |
    | A card error during confirm                                                                                       | Never reaches the server: Stripe.js returns it to the form (BR-F12-16)                                                                                                                  |
    | Anything else                                                                                                     | 500 `internal`, sent to Sentry with the request id and Stripe's request id                                                                                                              |

    No response or log ever contains card data, which Daybook never receives.

- **BR-F12-05** **The Stripe Customer** (D-311). Each user has at most one at a time. It is created on the user's first checkout (BR-F12-15):
    - **Request:** `email` and `metadata.userId` only. Both stay fixed: Daybook has no email change, and the display name is not sent, so a retry never sends different parameters under one key.
    - **Idempotency key:** `daybook-customer-<userId>-<customerGeneration>`. Two attempts within Stripe's 24-hour key window create one Customer, and a new generation after a clear gets a new Customer.
    - **Storing it:** through the system module, with `INSERT ... ON CONFLICT (user_id) DO UPDATE SET stripe_customer_id = coalesce(plan.stripe_customer_id, EXCLUDED.stripe_customer_id), source = 'stripe'`. An id already stored is never replaced, and a seeded record becomes a Stripe one.
- **BR-F12-06** **Setup** (`npm run stripe:setup`, D-303) is idempotent and refuses a live key. It finds Stripe objects by lookup key or metadata, never by ids in the environment:
    1. **Product:** "Daybook Premium", found by `metadata.daybook = premium`.
    2. **Features:** one Feature per `premium` and `limit` registry code, with `lookup_key` equal to the code, attached to the Product (P4, BR-P4-15).
    3. **Prices:** one active Price per interval, found by lookup key. When the amounts in `plans.ts` differ from Stripe's, it creates a new Price with `transfer_lookup_key: true` and archives the old one. Existing subscriptions keep their old Price.
    4. **Portal:** the Customer Portal configuration of BR-F12-19, found by `metadata.daybook = portal-v1`, created or updated.
    5. **INR check:** it creates a Checkout Session in INR and expires it at once. If Stripe refuses, it prints Stripe's message and exits with an error, since the sandbox's country decides which currencies it can present.
    6. **Checklist:** it prints the Dashboard-only settings (BR-F12-07) and the `stripe:listen` command.
- **BR-F12-07** **Dashboard-only settings** (D-315), which the Stripe API cannot set:
    - **Retries:** under Billing → Revenue recovery → Retries, Smart Retries are off and a custom schedule retries 3 times: 1, 2 and 3 days after the previous attempt. "If all retries for a payment fail" cancels the subscription (D-130). The last retry therefore falls 6 days after the first failure. Stripe does not retry India-issued cards, but still cancels on that schedule.
    - **Payment methods:** cards are on.
- **BR-F12-08** **Forwarding** (`npm run stripe:listen`) runs `stripe listen --events <the BR-F12-24 events> --forward-to <APP_ORIGIN>/api/webhooks/stripe`. The CLI prints the signing secret for `STRIPE_WEBHOOK_SECRET`.
- **BR-F12-09** **Billing handlers and transactions** (D-300, P2, BR-P2-10).
    - **The lock:** the three `/api/billing/*` handlers run `SET LOCAL lock_timeout = '10s'`, then take `pg_advisory_xact_lock(hashtextextended(user_id::text || ':billing', 0))` in their `withUser` transaction. They hold it while they call Stripe, so one user's billing calls never interleave.
    - **Waiting too long:** a lock wait that times out answers 503 `billing_unavailable`, never P2's `timeout`. Billing is never queued or retried by the client.
    - **After the lock:** they read the plan record. A `closingAt` less than 5 minutes old answers 409 `account_closing` (BR-F12-26).
    - **Writing:** they write the plan record and entitlements through the system module, whose functions open their own short system transactions.
    - **Contract:** they are online only and exempt from `Idempotency-Key`; Stripe calls carry Stripe's own keys (P2, BR-P2-16).

**State in Daybook (D-297, D-298, D-312)**

- **BR-F12-10** **Status.** A sync derives the plan record from the Customer's subscriptions.

    | Stripe subscription status         | Daybook status                     |
    | ---------------------------------- | ---------------------------------- |
    | `active`, `trialing`               | `active`                           |
    | `past_due`, `unpaid`, `paused`     | `past_due`                         |
    | `canceled`                         | `ended`                            |
    | `incomplete`, `incomplete_expired` | Ignored: no payment ever succeeded |
    - **Live subscriptions:** `active`, `trialing`, `past_due`, `unpaid` and `paused`. The current one is the live one with no scheduled end, then the one whose period ends last, then the newest by `created`.
    - **No live subscription:** the status is `ended` when a canceled subscription exists, and `none` otherwise. `stripeSubscriptionId`, `interval`, the price, `currentPeriodEnd`, `endsAt` and the scheduled switch are then `null`.
    - **`interval` and the price:** from the current subscription's Price, which the sync retrieves by id with `currency_options` and caches per process for 10 minutes. Stripe expands at most four levels, which is too few to read it through the subscription. The amount is in the subscription's currency, taken from `currency_options` when that is not the Price's default.
    - **`currentPeriodEnd`:** the item's `current_period_end`. Stripe keeps periods on subscription items since 2025-03-31.
    - **`endsAt`:** `cancel_at` when set. Otherwise the item's `current_period_end` when `cancel_at_period_end` is true. Otherwise `null`. Both fields are read because Stripe may express a cancellation either way.
    - **`scheduledInterval` and `scheduledAt`:** set when the subscription has a schedule. The next phase is the first one whose `start_date` is at or after the current phase's `end_date`. When its Price's interval differs from the current one, these hold that interval and the phase's `start_date`.
    - **`endedAt`:** the latest `ended_at` among canceled subscriptions.

- **BR-F12-11** **The sync** (`syncBilling(ctx, userId, customerId, { eventId? })`, in `server/system/billing`):
    1. **Order:** take `nextval('app.billing_sync_seq')` immediately before reading Stripe. This orders syncs by when they started, across processes, whatever their clocks. Any sync that starts after a change in Stripe therefore wins over every sync that started before it.
    2. **Read Stripe,** outside any transaction:
        - the Customer, which, if deleted or missing, leads to a clear instead (BR-F12-12);
        - its subscriptions, all statuses, newest first, with their schedules, every page of 100;
        - its active entitlements, every page;
        - any Price not in the cache.
    3. **Store,** in one system transaction:
        1. Lock the record with `SELECT ... WHERE user_id = $1 AND stripe_customer_id = $2 FOR UPDATE`. No row means the Customer was cleared or replaced meanwhile, so nothing is written.
        2. If the stored `syncSeq` is greater than this sync's, change nothing: a sync that started later has already stored.
        3. Otherwise write the BR-F12-10 fields, `source: stripe`, `syncSeq` and `lastSyncedAt` (`ctx.now`).
        4. Replace the user's entitlement rows with the active lookup keys, with source `stripe`.
        5. When the entitlements held a registry code before and hold none now, set `lapseSeenAt` to `ctx.now`.
        6. Record `eventId`, when given, in processed events with `ON CONFLICT DO NOTHING`. This happens even when nothing else was written.

    Seeded keys are replaced too, so a real purchase wins over the seed (P4, BR-P4-16). The sync reads Stripe's current state, never an event's payload, so events can arrive late, twice or out of order.

- **BR-F12-12** **Clearing a Customer** (`clearCustomer(ctx, userId, customerId, { eventId? })`, D-311). It runs on `customer.deleted`, and when Stripe reports the stored Customer deleted or missing. In one system transaction it locks the record with `WHERE user_id = $1 AND stripe_customer_id = $2`. With no such row, because that Customer was already cleared or replaced, it changes nothing but records `eventId`. Otherwise it:
    - sets `stripeCustomerId` to `null` and adds 1 to `customerGeneration`;
    - clears the subscription fields (`stripeSubscriptionId`, `interval`, the price, `currentPeriodEnd`, `endsAt`, the scheduled switch) and `duplicate`;
    - deletes the user's entitlements with source `stripe`;
    - records `eventId`, when given.

    The status becomes `ended` when it was `active` or `past_due`, or when `endedAt` is set; otherwise `none`. When it was `active` or `past_due`, `endedAt` and `lapseSeenAt` become `ctx.now`.

    Stripe deletes a test clock's Customers 30 days after the clock is created (BR-F12-28), so this path is routine in development. The next checkout creates a new Customer under the new generation's key.

- **BR-F12-13** **Duplicates** (D-299). If a race leaves more than one live subscription:
    - the current one follows BR-F12-10;
    - `duplicate` is true;
    - Sentry receives `billing.duplicate_subscription` once, when `duplicate` turns true;
    - the billing page says "You're paying for Daybook Premium twice. Cancel one in Manage billing."
- **BR-F12-14** **The lazy billing check** (D-310). After `GET /api/me` has answered, it runs a sync through Next.js `after()` when all of these hold:
    - the user has a Customer, and `closingAt` is `null` or at least 5 minutes old;
    - one of these is true:
        - `ctx.now` is past `endsAt`, `currentPeriodEnd` or `scheduledAt`;
        - `lastSyncedAt` is `null` or more than 24 hours before `ctx.now`;
        - the status is `active` or `past_due` while the entitlements hold no registry code, which catches entitlements that lagged a payment;
    - this server process has not checked this user in the last hour (a per-process note, like catch-up's, P2, BR-P2-14).

    When it schedules a sync, the response carries `billingCheck: true`, and the client fetches `/api/me` once more 5 seconds later (P4, BR-P4-12). An open app therefore sees the result without waiting for a refocus. A failure is logged to Sentry and changes nothing. Without webhooks, a renewal, failed payment, cancellation or lapse therefore reaches Daybook on the first `/api/me` after a known date passes, or after 24 hours without a sync. Server-side gating follows the stored entitlements meanwhile.

**Buying (D-127, D-128)**

- **BR-F12-15** `POST /api/billing/checkout-session { interval }` runs these steps, under the lock of BR-F12-09 (D-299):
    1. **A seeded plan:** if `source` is `seed` and `status` is `active`, refuse with 409 `already_premium`.
    2. **The Customer:** ensure it exists (BR-F12-05). A stored Customer is retrieved first. If it is deleted or missing, it is cleared (BR-F12-12) and a new one is created.
    3. **Live subscriptions:** list the Customer's subscriptions. If any is live, run the sync, so Daybook catches up, and refuse with 409 `already_premium`. This is Stripe's own guidance for custom forms.
    4. **Other sessions:** list every page of the Customer's open Checkout Sessions and expire each one. Only the newest session can then be paid, so two tabs cannot buy twice. An expiry that fails because the session is no longer open is ignored.
    5. **Create the session:**
        - `ui_mode: 'elements'`, `mode: 'subscription'`, `customer`;
        - `currency` (`inr` or `usd`, BR-F12-01), with `adaptive_pricing: { enabled: false }`;
        - one line item: the interval's Price, found by lookup key and cached per process for 10 minutes. A Price that Stripe reports inactive or missing refreshes the cache once;
        - `return_url`: `<APP_ORIGIN>/settings/billing?session_id={CHECKOUT_SESSION_ID}`;
        - `client_reference_id`, `metadata.userId` and `subscription_data.metadata.userId`, all set to the user id;
        - `expires_at` one hour from now.
    6. **Response:** `{ clientSecret, sessionId, interval, currency, amountMinor, expiresAt }`.

    A client that gets 409 `already_premium` refetches `/api/me`, invalidates every query, and shows the plan section for the user's real status.

- **BR-F12-16** **The payment form** (D-309).
    - **Loading Stripe.js:** only after the user picks a plan and selects Continue, so no other page loads it.
    - **The form:** `CheckoutElementsProvider` from `@stripe/react-stripe-js/checkout`, with the client secret and an `appearance` built from the design tokens. It renders the order summary from the session's `total`, the `PaymentElement`, and a Pay button reading "Pay ₹399.00".
    - **States from `useCheckoutElements()`:**
        - `loading` shows the form's skeleton;
        - `error` shows "The payment form could not load." with Start again, which creates a new session;
        - `success` shows the form.
    - **Paying:** the Pay button calls `checkout.confirm({ redirect: 'if_required' })`. It stays disabled until `canConfirm` is true, and while a confirm is running. Card payments therefore resolve in place; only payment methods that need a redirect leave the page.
    - **A confirm error:** shows Stripe's message under the form. The client then calls reconcile with the session id. If `checkout.status` is `expired`, it shows "This payment form expired. Start again." and returns to the plan picker. Otherwise the user can try again.
    - **Success:** starts activation (BR-F12-18) with the session id.
    - **Redirects:** a payment method that redirects returns to `return_url`. The billing page then starts activation with `session_id` from the URL and removes it from the URL.
    - **The theme:** the form takes the theme in force when it mounts. A theme change while it is open applies the next time it opens.
    - **Leaving:** "Choose another plan" closes the form. The session expires on its own, or at the next checkout (BR-F12-15 step 4).
- **BR-F12-17** `POST /api/billing/reconcile { sessionId? }` (D-128). `sessionId`, when sent, must match `^cs_(test|live)_[A-Za-z0-9]+$`, or the request gets 422 `validation_failed`.
    1. **A session id:** retrieve the session. If Stripe has no such session, or its `customer` is not the user's stored Customer, answer 404 `not_found`.
    2. **No Customer:** answer with the current plan; there is nothing to sync.
    3. **Otherwise:** run the sync (BR-F12-11).
    4. **Response:** `{ plan, checkout: { status } | null }`. `plan` has the shape of `/api/me`'s plan block, and `checkout.status` is the session's `open`, `complete` or `expired`.
- **BR-F12-18** **Activation** (D-301, root 5.5).
    1. After a successful confirm or a redirect return, the client calls reconcile with the session id.
    2. While the answer's plan has `premium: false`, it calls reconcile again 2 seconds after each answer, without the session id after the first call. It shows "Activating Premium…" meanwhile.
    3. Once `premium` is true, it refetches `/api/me` (P4, BR-P4-12), invalidates every query, and shows "You're on Daybook Premium. Everything is unlocked."
    4. If 30 seconds pass first, it stops and shows "Payment received. Premium is still activating; refresh this page in a minute." A webhook, the lazy billing check's entitlement trigger, or reopening the billing page completes it later.

    A 503 answer keeps the polling going. Any other error stops it and shows that error's message.

    A `checkout.status` of `expired` on the first answer shows the expiry message and returns to the plan picker.

**Managing (D-129, D-130)**

- **BR-F12-19** `POST /api/billing/portal` creates a Customer Portal session for the stored Customer and answers `{ url }`. The client navigates to it.
    - **Return:** to `<APP_ORIGIN>/settings/billing?portal=1`. The billing page's one reconcile on opening (BR-F12-20) covers it, and `portal` is then removed from the URL.
    - **No Customer:** 409 `no_billing_account`, which seeded plans get.
    - **The configuration** (D-302), passed by id when the session is created:
        - **Switching:** `subscription_update` is enabled for the Product's two Prices, with `default_allowed_updates: ['price']`. Monthly to yearly applies at once, with `proration_behavior: 'always_invoice'`. Yearly to monthly waits until the end of the paid year, through `schedule_at_period_end` with the condition `shortening_interval`.
        - **Cancelling:** `subscription_cancel` uses `mode: 'at_period_end'` and `proration_behavior: 'none'`, with cancellation reasons collected.
        - **Cards and invoices:** `payment_method_update` and `invoice_history` are on.
        - **Customer details:** `customer_update` is off; the email comes from Daybook.
        - **Headline:** "Daybook Premium".
- **BR-F12-20** **The billing page** (`/settings/billing`, D-305) shows, top to bottom:
    1. **The plan,** by status (section 6).
    2. **Actions,** by status:
        - the plan picker and Upgrade for `none` and `ended`;
        - Manage billing for `active` and `past_due` when `hasBillingAccount` is true;
        - nothing for a seeded plan.
    3. **Compare plans** (`#compare`): root 2's Free and Premium table, generated from the feature lines in `plans.ts`. It lists only features shipped in the current build's milestone.

    The page reads the plan from `/api/me`. When `hasBillingAccount` is true, it runs one reconcile on opening, so a missed webhook is repaired.

- **BR-F12-21** **`from`.** The locked card links to `/settings/billing?from=<code>` (P4).
    - **A known code:** a client-visible `premium` or `limit` code whose feature line is shipped names its feature in the headline. For example, `from=analytics.heatmap.view` gives "Unlock the calendar heat map with Daybook Premium."
    - **Any other value:** ignored.
- **BR-F12-22** **The header** (root 4, D-316) shows one of these:
    - with `premium` true: a "Premium" badge, linking to `/settings/billing`;
    - otherwise: an "Upgrade" link to `/settings/billing`;
    - before `/api/me` has answered: neither.

    Seeded Premium shows the badge.

- **BR-F12-23** **The past-due banner** (root 4, D-130, D-305). While `/api/me` reports `status: past_due`, every logged-in page shows "Your Daybook Premium payment failed. Update your card to keep Premium." with Update card.
    - **Update card:** calls the portal endpoint.
    - **Dismissing:** hides it until the next app start (Zustand `ui` store).
    - **Premium meanwhile:** stays, because Stripe keeps the entitlements during retries; AC-F12-15 checks it. If Stripe ever revoked them while past due, Premium would lock at that sync and `lapseSeenAt` would be set. The banner would stay until the status changed.

**The webhook (D-298)**

- **BR-F12-24** `POST /api/webhooks/stripe` runs in P2's `webhook` mode.
    - **Signature:** `stripe.webhooks.constructEvent` checks it against the raw body, with Stripe's default 300-second tolerance. A failure gets 400 `bad_request` and a Sentry warning.
    - **Handled events:** `customer.subscription.created`, `.updated`, `.deleted`, `.paused` and `.resumed`; `entitlements.active_entitlement_summary.updated`; and `customer.deleted`. Any other type answers 200 and is not recorded.
    - **Steps:**
        1. If the event id is in processed events, answer 200.
        2. Take the Customer id from `data.object.customer`, or from `data.object.id` for `customer.deleted`.
        3. Find the user whose record holds that Customer. If none, retrieve the Customer. When it exists and its `metadata.userId` names an existing user with no stored Customer, store the mapping (BR-F12-05). Otherwise record the event and answer 200. That covers a deleted account (F01, BR-F01-26), a Customer replaced by a newer generation, and a Customer Stripe no longer has.
        4. For `customer.deleted`, clear that Customer (BR-F12-12), which records the event.
        5. Otherwise, run the sync with the event id.
    - **Failures:** errors map as in BR-F12-04. On 503 or 500 nothing is recorded. Forwarding through `stripe listen` is not documented to deliver an event again, so the event can be lost. The lazy billing check (BR-F12-14) repairs what it leaves behind.
    - **Size:** the handled events are far below P2's 64 KB body limit. An event over it gets 413, and the lazy billing check repairs the state.

**Lapse, deletion, seeding and testing**

- **BR-F12-25** **A lapse** is a sync that leaves no Premium entitlements: the final retry failed, or a cancellation took effect.
    - **Capabilities:** Premium codes resolve `premium_required` and `goals.active.max` resolves to 3 (P4).
    - **Goals:** locks follow, and the lapse banner compares `goalsChosenAt` with `lapseSeenAt` (F06, BR-F06-12 and BR-F06-15).
    - **The client:** learns of it on its next `/api/me` fetch (P4, BR-P4-12), or from the first 403.
    - **Data:** nothing is deleted (D-29).
- **BR-F12-26** **Account deletion** (D-317). F01's before-delete hook always calls `deleteBillingCustomer(userId)` (BR-F01-24), whether or not a Customer is stored. In one system transaction it:
    1. **Takes the lock first:** `SET LOCAL lock_timeout = '10s'`, then the advisory lock of BR-F12-09, before touching any row. It therefore never holds a row lock while it waits for a billing handler that may still need that row.
    2. **Marks the account:** upserts the plan record with `closingAt = ctx.now`, creating it when the user has none.
    3. **Deletes the Customer:** reads the stored Customer under the lock. If there is one, it deletes it in Stripe, which cancels its subscriptions at once, without a refund (D-184). A `resource_missing` answer counts as success.
    4. **Clears billing:** clears the Customer fields and entitlements as `clearCustomer` does, keeping the row and `closingAt`.

    **On failure:** a lock wait that times out, or Stripe failing, rolls everything back. F01 then reports `BILLING_UNAVAILABLE`.

    **After the commit:**
    - **Waiting billing calls:** committing releases the lock. A checkout or portal call that waited sees `closingAt` and answers 409 `account_closing`.
    - **The user row:** Better Auth then deletes the user, and the plan record goes with it (P2, 7.6).
    - **If that delete fails:** `closingAt` stops blocking after 5 minutes, so billing works again, and a retried deletion runs this function again.

    Stripe's later events find no user and are ignored (BR-F12-24 step 3). `db:seed --reset` calls the same function for every scenario account that has a Customer before it deletes the account (F15).

- **BR-F12-27** **Seeded plans** (F15, BR-F15-25; D-306) have `source: seed` and no Customer, price or period end.

    | Account                      | `status` | `interval` | `endedAt` and `lapseSeenAt`                         | Entitlements                                    |
    | ---------------------------- | -------- | ---------- | --------------------------------------------------- | ----------------------------------------------- |
    | `family`, `stress`, `golden` | `active` | `year`     | `null`                                              | Every `premium` and `limit` code, source `seed` |
    | `yen`                        | `active` | `month`    | `null`                                              | As above                                        |
    | `lapsed`                     | `ended`  | `month`    | 00:00 in Europe/Berlin, 20 days before the seed day | None                                            |

    The billing page shows "Premium was granted by the seed script, so there is nothing to manage in Stripe." for an active seeded plan. `lapsed` can buy Premium normally; its first checkout turns the record into a Stripe one (BR-F12-05).

- **BR-F12-28** **Test clocks** (`npm run stripe:clock`, D-307) are for development only. Every form refuses a live key.
    - **`--user <email>`:** puts that user's Customer on a new Stripe test clock, creating the Customer first (BR-F12-05) when there is none. The clock is frozen 60 seconds after the current time, since Stripe refuses a past time for an existing Customer.
        - **Refusals:** a seeded `active` plan, whose seed entitlements a sync would otherwise replace; a user with a live subscription; and a Customer already on a clock, which cannot leave it.
        - **Automations:** Stripe refuses a clock for an existing Customer while the sandbox has Automations configured. The script prints Stripe's message.
    - **`--user <email> --advance <ISO instant>`:** moves the clock forward and waits until Stripe reports it `ready`.
        - **The limit:** it refuses a move of more than two billing intervals of the user's subscription (two years when there is none), which is Stripe's limit.
        - **The result:** Stripe renews, retries and cancels, and sends the events as if the time had passed.
    - **Clock time:** a clock's subscriptions use clock time, so `endedAt` can lie in Daybook's future. Locks and the lapse banner use `lapseSeenAt`, which is Daybook's request clock (D-313).
    - **30 days:** Stripe deletes the clock with its Customer 30 days after creation. The next sync then clears the Customer (BR-F12-12).
- **BR-F12-29** **Features added later.** When M8 adds `analytics.weekdayHour.view` and `learn.premium.read`, `stripe:setup` attaches their Features to the Product. Stripe grants a Feature added to a Product to existing subscriptions only from their next period. `stripe:setup` prints that warning. In development, a fresh purchase or an advanced test clock picks the new Features up.

## 5. Calculations

**Prices.**

| Interval | INR                    | USD               | Twelve months at the monthly price | Saving shown as |
| -------- | ---------------------- | ----------------- | ---------------------------------- | --------------- |
| Monthly  | 399.00                 | 4.99              | n/a                                | n/a             |
| Yearly   | 3,990.00 (10 × 399.00) | 49.90 (10 × 4.99) | 4,788.00 or 59.88                  | 2 months free   |

Prorations on a monthly-to-yearly switch are Stripe's arithmetic. Daybook shows none of them; the portal and its invoices do.

**Status from subscriptions** (BR-F12-10).

| Customer's subscriptions                                                                  | `status`                                            | `endsAt`             | `endedAt`            |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------- | -------------------- |
| One `active`, `cancel_at_period_end: false`, no `cancel_at`                               | `active`                                            | `null`               | `null`               |
| One `active` with `cancel_at_period_end: true`, item period ending 2027-10-17T09:12:00Z   | `active`                                            | 2027-10-17T09:12:00Z | `null`               |
| One `active` with `cancel_at` 2027-01-01T00:00:00Z                                        | `active`                                            | 2027-01-01T00:00:00Z | `null`               |
| One `past_due`                                                                            | `past_due`                                          | `null`               | `null`               |
| One `canceled`, `ended_at` 2026-10-12T05:00:00Z                                           | `ended`                                             | `null`               | 2026-10-12T05:00:00Z |
| One `canceled` (ended 2026-03-01T00:00:00Z) and one `active`                              | `active`                                            | `null`               | 2026-03-01T00:00:00Z |
| Two `active`: an older one with no end, and a newer one with `cancel_at_period_end: true` | `active`, from the older one, with `duplicate` true | `null`               | `null`               |
| One `incomplete_expired` only                                                             | `none`                                              | `null`               | `null`               |

**Sync ordering** (BR-F12-11).

1. A webhook sync takes sequence value 4811 and reads Stripe before the user's cancellation.
2. A reconcile sync takes 4812 after the cancellation, reads Stripe, and stores first.
3. The webhook sync then finds a stored `syncSeq` of 4812, greater than its own, and writes nothing. It still records its event id.

The plan keeps the cancellation.

**Failed renewal timeline with a test clock** (BR-F12-07, BR-F12-28). The clock starts at T, when the user buys monthly.

| Clock time                                    | What Stripe does                                                                        | Daybook after the sync                                |
| --------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| T + 1 month                                   | Creates the renewal invoice as a draft                                                  | `active`                                              |
| T + 1 month + 2 hours                         | Has finalized it, about an hour after the draft, and the charge to card 0341 has failed | `past_due`, banner shown, Premium kept                |
| + 1, + 3 and + 6 days after the first failure | Retries 3 times, each failing                                                           | `past_due`                                            |
| After the last retry                          | Cancels the subscription                                                                | `ended`; `lapseSeenAt` is Daybook's time of that sync |

## 6. Screens and states

**`/settings/billing`.** BR-F12-20. The plan section by status:

| Status                           | Plan section                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `none`                           | "Daybook Free" with the plan picker: Monthly ₹399.00 a month, Yearly ₹3,990.00 a year with "2 months free", and Continue |
| `active`                         | "Daybook Premium · Yearly · ₹3,990.00 a year" and "Renews on 17 Oct 2027." with Manage billing                           |
| `active` with `endsAt`           | "Premium ends on 17 Oct 2027. You keep every feature until then." with Manage billing, where the user can renew          |
| `active` with a scheduled switch | Adds "Switches to monthly billing on 17 Oct 2027."                                                                       |
| `past_due`                       | "Your last payment failed. Stripe will retry it; update your card to keep Premium." with Update card                     |
| `ended`                          | "Your Premium ended on 12 Oct 2026." with the plan picker                                                                |
| Seeded `active`                  | "Daybook Premium" and the seed sentence (BR-F12-27); no actions                                                          |
| `duplicate`                      | The BR-F12-13 sentence, above the rest                                                                                   |

| State            | What the user sees                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading          | A skeleton of the plan section and the compare table                                                                                             |
| Empty            | n/a: `none` is a state with its own content                                                                                                      |
| Error            | "Billing is unavailable right now. Try again in a minute." for 503 `billing_unavailable`; the plan from `/api/me` stays visible                  |
| Offline          | Before M5: "Billing needs a connection." From M5: the plan from the persisted `/api/me` with "as of", and that sentence in place of every action |
| Pending          | n/a: billing is never queued                                                                                                                     |
| Locked (Premium) | n/a                                                                                                                                              |
| Read-only        | Offline only                                                                                                                                     |
| Activating       | "Activating Premium…", announced through a live region (BR-F12-18)                                                                               |

**The payment form** replaces the plan picker after Continue. It shows:

- the order summary;
- the Payment Element;
- the Pay button;
- "Choose another plan";
- "Test mode: use card 4242 4242 4242 4242 with any future date and CVC."

**The header badge and the past-due banner.** BR-F12-22 and BR-F12-23, among root 4's header items and global banners.

## 7. Flows

**7.1 Buy monthly (`student@daybook.test`, IN)**

1. On Analytics, the heat map's locked card offers Upgrade, which opens `/settings/billing?from=analytics.heatmap.view`.
2. The headline reads "Unlock the calendar heat map with Daybook Premium."
3. The user picks Monthly (₹399.00) and selects Continue. The server creates the Customer and the session in INR.
4. The form shows "Pay ₹399.00". The user enters 4242 4242 4242 4242 and pays. Confirm resolves in place.
5. Reconcile syncs. The plan becomes `active` with `premium: true`, `/api/me` is refetched, and the page says "You're on Daybook Premium. Everything is unlocked." The header shows the Premium badge.
6. Back on Analytics, the heat map loads.

**7.2 3D Secure.** With card 4000 0025 0000 3155, Stripe shows its authentication dialog inside the form. After approval, the flow continues as in 7.1.

**7.3 A declined card.** With card 4000 0000 0000 9995, confirm returns an error. The form shows Stripe's message ("Your card has insufficient funds."), the follow-up reconcile reports the session still `open`, and the user can try another card.

**7.4 The Stripe CLI is not running.** No webhook arrives, and reconcile alone activates Premium. If Stripe lists the entitlements later than the payment, the repeated reconcile picks them up when they appear. After 30 seconds the timeout message shows, and the lazy billing check finishes the job on a later `/api/me`.

**7.5 Cancel**

1. Manage billing opens the portal, and the user cancels.
2. Stripe schedules the end of the period. Back on `?portal=1`, the billing page's reconcile stores `endsAt`.
3. The page says "Premium ends on 17 Nov 2026. You keep every feature until then."
4. At period end, Stripe ends the subscription. The webhook's sync, or with no webhook the lazy billing check after `endsAt`, stores `ended`, and the lapse follows (BR-F12-25).

**7.6 Switch yearly to monthly.** In the portal the user picks Monthly. Stripe schedules it for the end of the paid year. Back in Daybook: "Switches to monthly billing on 17 Oct 2027."

**7.7 A failed renewal, with a test clock** (section 5's timeline)

1. `stripe:clock --user` puts the developer's Customer on a clock. They buy monthly.
2. In the portal they replace the card with 4000 0000 0000 0341, which attaches but fails every charge.
3. They advance the clock to T + 1 month + 2 hours. The payment has failed, the subscription is `past_due`, the banner shows, and Premium stays.
4. They advance 7 more days. Stripe cancels, the sync stores `ended`, Premium codes lock, and Goals beyond 3 lock (F06).

**7.8 Two tabs.** Tab A creates a session, then tab B creates another, which expires A's. Paying in tab A fails, the follow-up reconcile reports `expired`, and tab A shows the expiry message and returns to the plan picker. Only tab B can pay.

**7.9 Account deletion.** F01 deletes the Customer, so Stripe cancels the subscription at once. Stripe's later `customer.subscription.deleted` and `customer.deleted` events find no user and are ignored.

## 8. Validation and messages

| Situation                 | Message shown                                                                     |
| ------------------------- | --------------------------------------------------------------------------------- |
| 409 `already_premium`     | You already have Daybook Premium.                                                 |
| 409 `no_billing_account`  | There is no billing account to manage.                                            |
| 409 `account_closing`     | This account is being deleted.                                                    |
| 503 `billing_unavailable` | Billing is unavailable right now. Try again in a minute.                          |
| Card or payment error     | Stripe's own message, under the form                                              |
| Form failed to load       | The payment form could not load.                                                  |
| Session expired           | This payment form expired. Start again.                                           |
| Activating                | Activating Premium…                                                               |
| Activated                 | You're on Daybook Premium. Everything is unlocked.                                |
| Activation timeout        | Payment received. Premium is still activating; refresh this page in a minute.     |
| Renewal                   | Renews on 17 Oct 2027.                                                            |
| Scheduled end             | Premium ends on 17 Oct 2027. You keep every feature until then.                   |
| Scheduled switch          | Switches to monthly billing on 17 Oct 2027.                                       |
| Past due (page)           | Your last payment failed. Stripe will retry it; update your card to keep Premium. |
| Past due (banner)         | Your Daybook Premium payment failed. Update your card to keep Premium.            |
| Ended                     | Your Premium ended on 12 Oct 2026.                                                |
| Seeded                    | Premium was granted by the seed script, so there is nothing to manage in Stripe.  |
| Duplicate                 | You're paying for Daybook Premium twice. Cancel one in Manage billing.            |
| Offline                   | Billing needs a connection.                                                       |
| Test card hint            | Test mode: use card 4242 4242 4242 4242 with any future date and CVC.             |
| `from` headline           | Unlock the calendar heat map with Daybook Premium.                                |
| Header                    | Premium (badge) / Upgrade (link)                                                  |

## 9. Plan gating

None for billing itself; every user can open it. This feature is what grants the Premium codes P4 resolves:

- `analytics.heatmap.view` and `analytics.comparative.view` (F09);
- `goals.active.max` (F06);
- `reports.quarterly.generate` and `reports.annual.generate` (F11, from M6);
- from M8, `analytics.weekdayHour.view` and `learn.premium.read` (BR-F12-29).

`billing.promotionCodes` (Stretch) adds `allow_promotion_codes: true` to the session.

## 10. Offline behavior

Billing is online only and never queued (P2, BR-P2-16).

- **Before M5:** the billing page shows "Billing needs a connection."
- **From M5 (P1):** it shows the plan from the persisted `/api/me` with "as of", and disables every action with that sentence.
- **The past-due banner:** its Update card is disabled the same way.
- **Gating offline:** follows P4, BR-P4-12.

## 11. Server surface

| Endpoint                        | Method | Input                             | Output                                                                        | Errors                                                                                                                      | Idempotency                 |
| ------------------------------- | ------ | --------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `/api/billing/checkout-session` | POST   | `{ interval: "month" \| "year" }` | 201 `{ clientSecret, sessionId, interval, currency, amountMinor, expiresAt }` | 401, 403 `profile_required`, 409 `already_premium` or `account_closing`, 422 `validation_failed`, 503 `billing_unavailable` | Exempt (D-201); online only |
| `/api/billing/reconcile`        | POST   | `{ sessionId? }`                  | 200 `{ plan, checkout }`                                                      | 401, 403, 404 `not_found`, 422, 503 `billing_unavailable`                                                                   | Exempt; online only         |
| `/api/billing/portal`           | POST   | `{}`                              | 200 `{ url }`                                                                 | 401, 403, 409 `no_billing_account` or `account_closing`, 503 `billing_unavailable`                                          | Exempt; online only         |
| `/api/webhooks/stripe`          | POST   | A Stripe event, signed            | 200 `{ received: true }`                                                      | 400 `bad_request` (signature), 413, 500, 503 `billing_unavailable`                                                          | The event id (BR-F12-24)    |

**Error codes added by this spec**

| Status | Code                  | Default message                                          | Write queue does |
| ------ | --------------------- | -------------------------------------------------------- | ---------------- |
| 409    | `already_premium`     | You already have Daybook Premium.                        | Never queued     |
| 409    | `no_billing_account`  | There is no billing account to manage.                   | Never queued     |
| 409    | `account_closing`     | This account is being deleted.                           | Never queued     |
| 503    | `billing_unavailable` | Billing is unavailable right now. Try again in a minute. | Never queued     |

**The plan block of `/api/me`** (P4, BR-P4-11):

- **`premium`:** true when the user's entitlement keys include any registry `premium` or `limit` code, so it always agrees with gating.
- **`hasBillingAccount`:** true when a Customer is stored.
- **The other fields:** the plan record's, without the Stripe ids, `customerGeneration`, `closingAt`, `syncSeq` and `lastSyncedAt`.
- **`billingCheck`:** beside the plan block, `true` only when this answer scheduled the lazy billing check (BR-F12-14).
- **`price`:** `null` without a current subscription.
- **No plan record:** `{ premium: false, status: "none", source: null, hasBillingAccount: false }`, with every other field `null` and `duplicate` false.

**Sentry events.** Each carries the request id and the user id, never card data:

- `billing.signature_failed` (warning);
- `billing.sync_failed`;
- `billing.stripe_error`, with Stripe's request id;
- `billing.duplicate_subscription`.

**Modules**

- `shared/billing/plans.ts`: plans, amounts and feature lines.
- `server/billing/stripe.ts`: the only Stripe SDK import (BR-F12-03).
- `server/billing/*`: the three handlers and the webhook route.
- `server/system/billing.ts`, the system module's billing functions:
    - `syncBilling`, `clearCustomer`, `storeCustomer`, `seen`, `recordEvent`, `userForCustomer` and `lazyBillingCheck`;
    - `deleteBillingCustomer` (P2, BR-P2-26).
- `scripts/stripe-setup.ts`, `scripts/stripe-clock.ts`, and the `stripe:listen` npm script.

## 12. Cross-feature effects

- **P4:** entitlements drive every Premium code, and the plan block joins `/api/me`. From M4 the locked card shows Upgrade, and offline it shows "Connect to upgrade". `/api/me` runs the lazy billing check after it answers.
- **F06:** the limit message shows Upgrade from M4. Goal locks follow a lapse, and the lapse banner compares `goalsChosenAt` with `lapseSeenAt`.
- **F09 and F11:** gates open or close on the next `/api/me` fetch.
- **F01:** account deletion runs `deleteBillingCustomer` first. Reset my data leaves billing alone.
- **F15:** seeds plan records and entitlements (BR-F12-27). `db:seed --reset` deletes Customers first.
- **F02:** the country sets the price currency. Settings navigation includes Billing.
- **P2:** billing handlers follow BR-F12-09. The daily pass deletes processed event ids older than 30 days.
- **Invalidation:** activation and a 409 `already_premium` invalidate every query, since gated data may now load. Other plan changes refetch `/api/me` (P4).

## 13. Edge cases

- **The webhook arrives before reconcile:** both run the same sync, and the one with the greater sequence value stores (BR-F12-11).
- **An event delivered twice:** the second finds its id in processed events.
- **Events out of order:** each sync reads Stripe's current state, so order does not matter.
- **Stripe unreachable during checkout:** 503 `billing_unavailable`; nothing changes.
- **Stripe unreachable during a webhook:** 503. A forwarded event may not be delivered again, and the lazy billing check repairs what it leaves behind.
- **The Customer deleted in Stripe** (in the Dashboard, or with its test clock): the next sync or checkout clears it. The next checkout creates a new Customer under the next generation's key.
- **A redirect return with an expired session:** activation shows the expiry message.
- **A seeded `lapsed` user buys Premium:** the Customer store turns the record into `source: stripe`, and Manage billing appears.
- **Past due, then a new card in the portal:** Stripe retries and succeeds, and the next sync stores `active`.
- **Cancel, then renew in the portal before period end:** `endsAt` returns to `null` on the next sync.
- **A price changed by `stripe:setup`:** new checkouts use the new Price within 10 minutes, and existing subscriptions keep theirs. `priceAmountMinor` shows what each user actually pays.
- **A user in a country paying USD whose profile currency is EUR:** the price is shown in USD, formatted by their `numberLocale`.
- **Checkout and account deletion at once:** they share the billing lock. A checkout that waited sees `closingAt` and answers 409 `account_closing`, whether or not the user had a Customer (BR-F12-26).
- **A late `customer.deleted` after a new Customer was stored:** the clear matches no row, so the new Customer stays (BR-F12-12).
- **Entitlements change while the app is open elsewhere:** P4, section 13.

## 14. Acceptance criteria

- **AC-F12-01** (unit) Status derivation gives every row of section 5's status table, including `endsAt` from both `cancel_at` and `cancel_at_period_end`, and the duplicate row's choice of current subscription.
- **AC-F12-02** (unit) Price display: ₹399.00 for `hi-IN-u-nu-latn` in INR, 4,99 $ for `de-DE-u-nu-latn` in USD, and $4.99 for `en-KW` in USD. Yearly shows "2 months free".
- **AC-F12-03** (integration, fake Stripe client) The sync ordering example in section 5 leaves the cancellation stored and records both event ids. A sync for a Customer that was cleared meanwhile writes nothing.
- **AC-F12-04** (integration) The webhook:
    - a bad signature gets 400;
    - an event processed twice syncs once;
    - an unknown Customer is recorded and answered 200;
    - Stripe failing with a connection error gives 503 and records nothing.
- **AC-F12-05** (integration) Clearing a Customer:
    - `customer.deleted`, and a sync that finds the Customer deleted, both clear it and raise `customerGeneration`;
    - when the user was `active`, they also set `lapseSeenAt`;
    - the next checkout creates a Customer with the new generation's key;
    - a `customer.deleted` for a Customer no longer stored changes nothing and records the event.
- **AC-F12-06** (integration) Checkout:
    - with a live subscription, it refuses with 409 `already_premium` and syncs;
    - with an open session, it expires that session before creating a new one;
    - two concurrent requests for a new user create one Customer;
    - a seeded active plan gets 409;
    - a lock wait over 10 seconds gets 503 `billing_unavailable`.
- **AC-F12-07** (integration) Reconcile:
    - another Customer's session, or an unknown one, gets 404;
    - a malformed `sessionId` gets 422;
    - without a Customer, it returns the plan unchanged.
- **AC-F12-08** (integration) A sync that finds Stripe entitlements replaces the user's seeded keys, and sets `source: stripe`. The resolver then reads only Stripe's keys.
- **AC-F12-09** (integration) A lapse sync leaves `premium: false` and sets `lapseSeenAt` to the request clock. A Free user with 5 active Goals then gets the F06 locks and the lapse banner.
- **AC-F12-10** (integration) Account deletion:
    - with a Customer, it deletes it in Stripe (fake client) before the user, and a `resource_missing` answer still lets deletion complete (F01, AC-F01-13 and AC-F01-14);
    - for a user with no Customer, a checkout waiting on the lock answers 409 `account_closing`;
    - with Stripe failing, nothing changes, `closingAt` included;
    - a `closingAt` 6 minutes old no longer blocks checkout.
- **AC-F12-11** (client integration, MSW) Activation polls reconcile 2 seconds after each answer, refetches `/api/me` once `premium` is true, and stops with the timeout message after 30 seconds.
- **AC-F12-12** (integration, with `after()` run inside a request scope) The lazy billing check:
    - `/api/me` for a user whose `endsAt` has passed answers `billingCheck: true` and runs one sync after answering;
    - a second `/api/me` within the hour runs none;
    - a user whose `lastSyncedAt` is 25 hours old, or `null`, is synced;
    - so is an `active` user with no entitlements.
- **AC-F12-13** (E2E, tag `@stripe`, test mode with the CLI, a fresh sign-up per run) A Free user buys monthly with 4242 4242 4242 4242, without a page reload. The locked heat map then renders (P4, AC-P4-10). The run fails on any CSP violation.
- **AC-F12-14** (E2E, tag `@stripe`, CLI stopped) The same purchase activates through reconcile alone. A card needing 3D Secure completes after approval. A declined card shows Stripe's message and leaves the plan `none`.
- **AC-F12-15** (manual, test clock, M4 checklist) Section 5's failed-renewal timeline runs end to end. While `past_due`, every Premium code still resolves `ok`. After the cancellation, the lapse arrives with Goal locks, and choosing 3 Goals ends the banner.
- **AC-F12-16** (unit) `stripe:setup`:
    - it refuses a live key;
    - run twice against the fake client, it creates nothing the second time;
    - a changed amount creates a new Price, moves the lookup key and archives the old Price.
- **AC-F12-17** (manual, M4 checklist) `stripe:setup` runs against a real sandbox. The dotted lookup keys are accepted, the INR check passes, and a purchase in INR and one in USD both activate.
- **AC-F12-18** (accessibility) The billing page and the payment form pass axe with no serious or critical violations. Activation progress is announced through a live region.

`@stripe` tests need test keys and network access, and run by hand before a release, not in CI. Each run signs up a new user, so a previous run's Customer never blocks it.

## 15. Illustrations

Illustrative, `POST /api/billing/checkout-session` for an IN user:

```json
{
	"clientSecret": "cs_test_..._secret_...",
	"sessionId": "cs_test_a1B2c3",
	"interval": "month",
	"currency": "INR",
	"amountMinor": 39900,
	"expiresAt": "2026-10-17T10:12:00Z"
}
```

Illustrative, `/api/me` plan blocks:

```json
{
	"premium": true,
	"status": "active",
	"source": "stripe",
	"hasBillingAccount": true,
	"interval": "year",
	"price": { "currency": "INR", "amountMinor": 399000 },
	"currentPeriodEnd": "2027-10-17T09:12:00Z",
	"endsAt": null,
	"scheduledInterval": null,
	"scheduledAt": null,
	"endedAt": null,
	"lapseSeenAt": null,
	"duplicate": false
}
```

```json
{
	"premium": true,
	"status": "active",
	"source": "seed",
	"hasBillingAccount": false,
	"interval": "year",
	"price": null,
	"currentPeriodEnd": null,
	"endsAt": null,
	"scheduledInterval": null,
	"scheduledAt": null,
	"endedAt": null,
	"lapseSeenAt": null,
	"duplicate": false
}
```

Illustrative, the webhook in outline:

```ts
export const POST = webhookRoute(async (ctx, event) => {
	if (!HANDLED.has(event.type)) return ok();
	if (await billing.seen(event.id)) return ok();
	const customerId =
		event.type === "customer.deleted" ?
			event.data.object.id
		:	event.data.object.customer;
	const userId = await billing.userForCustomer(customerId); // stored, or mapped from the Customer's metadata
	if (!userId) return billing.recordEvent(event.id);
	if (event.type === "customer.deleted")
		return billing.clearCustomer(ctx, userId, customerId, { eventId: event.id });
	await billing.syncBilling(ctx, userId, customerId, { eventId: event.id });
	return ok();
});
```
