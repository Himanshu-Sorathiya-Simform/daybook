# P2 Data access and security

16 Oct 2026 · @Himanshu

Every private read and write reaches Postgres through one path. A route-handler wrapper checks the request and opens one database transaction. Inside it, the data access layer sets the user's identity, and row-level security makes the database refuse anything that belongs to someone else. The same path makes every change safe to retry and detects edits made on another device. This spec defines that path, the database roles behind it, the security headers in front of it, and the tests that prove it.

| Item | Value |
| --- | --- |
| Milestone | M0 |
| Plan | Free and Premium |
| Depends on | [01-root-spec.md](../01-root-spec.md) sections 7 to 9 |
| Decisions | D-06, D-07, D-12 to D-19, D-39, D-137, D-153, D-165, D-172, D-173, D-180, D-192 to D-197, D-199, D-201 to D-207, D-242 to D-244, D-292, D-300, D-325, D-343, D-362, D-367, D-368, D-370, D-382, D-383, D-386 |

## 1. User stories

- As a user, I want my finances visible only to me, even when the app has a bug, so that one mistake cannot leak my data.
- As a user, I want a change I made on two devices not to silently overwrite the other, so that I can trust what I see.
- As a user, I want a change that was sent twice (a retry, a flaky network) to count once.
- As a developer, I want every route to get the same checks and one transaction without writing them again, so that I cannot forget isolation.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| Database roles, bootstrap and grants; schemas; RLS policy pattern; foreign-key rules; transaction-local user context; isolation levels; the route-handler wrapper and its step matrix; idempotency records; version checks; error mapping; value parsing; lazy catch-up; the system module; `proxy.ts`; CSP and headers; session-cookie expiry; environment validation; migrations and `db:verify`; Better Auth's endpoint allow-list; the print token | None | Audit log of row changes; field-level encryption; rate limits on the finance API; multiple database regions |

## 3. Concepts and fields

**Database roles** (SEC-1)

| Role | Created by | Login | `BYPASSRLS` | Can touch |
| --- | --- | --- | --- | --- |
| Owner: the Neon project's default role | Neon, with the project | Migrations and bootstrap only, direct endpoint | Neon's default for that role; not relied on | Everything; owns every table and schema |
| `daybook_auth` | `db:bootstrap` | Pooled endpoint | No | `USAGE` on schema `auth`; `SELECT, INSERT, UPDATE, DELETE` on its tables. Nothing in `app` |
| `daybook_runtime` | `db:bootstrap` | Pooled endpoint | No | `USAGE` on schema `app`; `SELECT, INSERT, UPDATE, DELETE` on private tables; `SELECT` only on private system-written tables and reference tables. Its own rows only, through `owner_isolation`. Nothing in `auth` |
| `daybook_system` | `db:bootstrap` | Pooled endpoint | No | `USAGE` on schema `app`; `SELECT, INSERT, UPDATE, DELETE` on every `app` table; `USAGE` on sequence `app.billing_sync_seq` (F12). Every user's private rows, through its own `system_access` policy (D-206). Nothing in `auth` |

**Schemas (D-192)**
- `auth` holds Better Auth's tables: user, session, account, verification. Session and account reference the user with `ON DELETE CASCADE`.
- `app` holds every other table.

**Table classes.** Every table in `app` belongs to exactly one class.

| Class | Examples | `user_id` | RLS and policy | Runtime may |
| --- | --- | --- | --- | --- |
| Private | Transactions, Budgets, Subscriptions, tombstones, Goals, trades, profile, layout, dismissed insights, idempotency records | Yes | Enabled, forced, `owner_isolation` and `system_access` | Read and write own rows |
| Private, system-written | Entitlements, plan status, capability overrides | Yes | Enabled, forced, `owner_isolation` and `system_access` | Read own rows only (no write grant) |
| Reference | Currencies, categories, mock assets, mock prices | No | None | Read |
| System | Processed Stripe event ids, daily maintenance markers | No | None | Nothing |

**Columns every private table must have.** These constrain the schema design; they are not the schema.

| Column | Rule |
| --- | --- |
| `id` | UUIDv7 primary key (ID-1) |
| `user_id` | Not null; references `auth.user(id)` with `ON DELETE CASCADE` |
| `version` | Integer from 1, plus 1 on every update. Required on updatable rows |
| `created_at`, `updated_at` | `timestamptz`, UTC |

A private table that other private rows reference also has `UNIQUE (user_id, id)` (BR-P2-06). The profile carries `last_catch_up_on`, a date in the profile timezone (BR-P2-14).

**Idempotency record (private)**

| Field | Meaning |
| --- | --- |
| `user_id`, `key` | Unique together; the key is the request's `Idempotency-Key`, a UUIDv7 (ID-2) |
| `request_hash` | SHA-256 of method, path and the canonical JSON body |
| `status_code`, `response_body` | The stored response |
| `created_at` | Deleted after 90 days (BR-P2-27); deleted with the account by the cascade |

**Request context**

| Field | Meaning |
| --- | --- |
| `requestId` | UUIDv7 from `proxy.ts` |
| `user` | `{ id, email, name }` from the session |
| `profile` | Country, currency, timezone, week start, `last_catch_up_on`; `null` before onboarding |
| `capabilities` | Resolved per [P4](P4-capabilities.md) |
| `now` | The server's UTC instant for this request |
| `today` | `now` as a date in the profile timezone (TIME-5) |

**Route modes**

| Mode | Used by |
| --- | --- |
| `user` | Every finance and account endpoint |
| `webhook` | `/api/webhooks/stripe` |

Pages readable without a session (the landing page, Learn) are server components, not routes, so the wrapper has no public mode.

Better Auth's endpoints under `/api/auth/*` do not go through the wrapper. Better Auth applies its own origin and rate-limit checks (BR-P2-40).

## 4. Business rules

**Roles, bootstrap and grants**

- **BR-P2-01** `npm run db:bootstrap` runs once per Neon project, as the owner, over the direct endpoint. It creates `daybook_auth`, `daybook_runtime` and `daybook_system` as plain `LOGIN` roles, with passwords read from the environment and quoted with `format('%L')`, then creates both schemas. Roles are never created in the Neon Console and never by migrations (D-14).
- **BR-P2-02** Grants follow section 3 exactly. `db:verify` (BR-P2-37) fails on any extra or missing grant.
- **BR-P2-03** No Daybook role (`daybook_auth`, `daybook_runtime`, `daybook_system`) is a superuser, owns anything, or has `BYPASSRLS`, `CREATEROLE` or `CREATEDB`.

**Row-level security and keys**

- **BR-P2-04** Every private table, including the system-written ones, has RLS enabled and forced, and exactly two policies:

    ```sql
    CREATE POLICY owner_isolation ON app.<table> FOR ALL TO daybook_runtime
      USING (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
      WITH CHECK (user_id = nullif(current_setting('app.user_id', true), '')::uuid);

    CREATE POLICY system_access ON app.<table> FOR ALL TO daybook_system
      USING (true) WITH CHECK (true);
    ```

    - **Runtime role:** a missing or empty setting yields `NULL` and matches no row. On system-written tables the missing write grant stops it writing.
    - **System role:** reaches every row through `system_access` (D-206), so no role needs `BYPASSRLS`.
    - **Auth role:** no policy names it, and it has no grants in `app`.
- **BR-P2-05** Views over private tables use `security_invoker = true` (D-194). Materialized views over private tables are forbidden, since they ignore the querying role.
- **BR-P2-06** A private row that references another private row uses a composite foreign key `(user_id, parent_id)` → `parent(user_id, id)` (D-193). Postgres skips RLS during foreign-key checks, so a single-column key would let a user link to another user's row. Two actions are allowed between private tables:
    - **The child must survive its parent:** `ON DELETE SET NULL (parent_id)`, with the column list (Postgres 15 or later), so `user_id` is never nulled. Example: a Subscription's charges (D-96).
    - **Any other child:** `NO ACTION`, never `RESTRICT`, so deleting a user cascades through parents and children in one statement. Deleting a parent that still has such children is refused (BR-P2-24); the feature deletes or detaches the children first, in the same transaction.
- **BR-P2-07** No `SECURITY DEFINER` function exists in schema `app` (SEC-5).

**Transactions and the data access layer**

- **BR-P2-08** `withUser(ctx, mode, fn)` runs eight steps:
    1. Takes a connection from the runtime pool.
    2. Runs `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` for reads, or `BEGIN` (read committed) for writes.
    3. Runs `SELECT set_config('app.user_id', $1, true)` with `ctx.user.id`.
    4. Runs `SET LOCAL statement_timeout = '15s'`.
    5. Calls `fn` with the transaction.
    6. Commits.
    7. Rolls back on any error.
    8. Always releases the connection.
- **BR-P2-09** Reads use repeatable read, so every query in one response sees the same snapshot; read-only transactions never fail serialization. Writes use read committed, so a count taken after a lock sees every committed row (P4, BR-P4-08) and a duplicate idempotency key waits instead of failing.
- **BR-P2-10** A route handler runs in exactly one `withUser` transaction, which the wrapper opens. The handler receives the transaction and never opens another. Server components use `readAsUser(fn)` from `server/dal/read`, which builds the request context and runs `fn` in one read transaction; a page may call it once per prefetched query. The catch-up check (BR-P2-14) adds at most one short write transaction per user per day per server process, plus retries after a failure. The daily pass (BR-P2-27) adds at most one system transaction per server process per UTC day, plus retries. Four routes depart from this pattern, each by declaration. First, billing handlers (F12, BR-F12-09, D-300). They hold their `withUser` transaction and a per-user advisory lock while they call Stripe, and they write through the system module, whose functions open their own short transactions. Second, a route declared with `stream: true` (BR-P2-15). Third, a route declared with `afterCommit: true` (BR-P2-15). Fourth, `/api/me`, which may run F12's lazy billing check after it has answered, through `after()`, in system transactions only (BR-F12-14).
- **BR-P2-11** Imports are restricted, and a lint rule (`no-restricted-imports`) enforces it:
    - only `server/dal` and `server/api/route` import `withUser` and the runtime pool;
    - only `server/system` imports the system pool;
    - every server module starts with `import 'server-only'`.

    Scripts run with `tsx --conditions=react-server`, and Vitest aliases `server-only` to an empty module, so both can import server modules.
- **BR-P2-12** No session, or a session whose user no longer exists, gives 401 `unauthenticated`. API responses never touch cookies; pages clear them through BR-P2-39.
- **BR-P2-13** A `user` route called before onboarding gives 403 `profile_required`. These routes work without a profile: `/api/me`, `/api/profile`, `/api/account/*`.
- **BR-P2-14** Lazy catch-up (JOB-1, D-207). It runs before every route with `catchUp: true` (the default whenever a profile is required), and in `readAsUser` before its read transaction opens, at most once per rendered request.
    - **Skipped:** for a request carrying `Daybook-Queue: pending`, or the cookie `daybook_queue=pending`, which the client keeps while Subscription items wait in its queue (D-244, D-325; P1, BR-P1-23).
    - **The note:** each server process keeps a note per user of `{ timezone, lastCatchUpOn }`, as last read from the database. The check is skipped while today in the note's zone, from `ctx.now`, is on or before the note's `lastCatchUpOn`.
    - **The check:** otherwise the wrapper opens a short write transaction with the user's context and runs:

        ```sql
        UPDATE app.profile
           SET last_catch_up_on = ($2::timestamptz AT TIME ZONE timezone)::date
         WHERE user_id = $1
           AND last_catch_up_on < ($2::timestamptz AT TIME ZONE timezone)::date
        RETURNING timezone, last_catch_up_on;
        ```

        `$2` is `ctx.now` (BR-P2-43). Today comes from it and the profile's own timezone inside the statement, so nothing is read first.
    - **No profile:** matches no row.
    - **A row returned:** catch-up was due. The same transaction runs Subscription catch-up (JOB-2). The check commits before the request's own transaction or snapshot opens, so the response includes the new charges.
    - **`version` and `updated_at`:** never changed by this update. `last_catch_up_on` is bookkeeping and cannot cause a version conflict.
    - **Updating the note:** only from the database. After a successful run, the note takes the returned row. After a run that matched nothing, it takes the profile read in step 11, when one exists. A failed, rolled-back run leaves the database's older date, so the next request retries.
    - **Clearing the note:** a profile `PATCH` and Reset my data clear the user's entry. Tests clear every entry, and the daily pass note (BR-P2-27), with `resetCatchUpNote()`.
    - **A failure:** is logged to Sentry and does not block the request.

**The route-handler wrapper**

- **BR-P2-15** Every route handler is declared through `route(options, handler)`. Options:
    - `mode`: section 3.
    - `capability`: optional (P4).
    - `profile`: required by default.
    - `body`: an optional Zod schema.
    - `versioned`: true for PATCH and DELETE on updatable rows.
    - `idempotent`: true by default for mutations.
    - `catchUp`: true by default when `profile` is required.
    - `stream`: false by default (D-370). With it, the handler returns a response whose body stream owns the read transaction:
        - the first page is read before the response starts, so an early error keeps the error envelope;
        - `SET LOCAL idle_in_transaction_session_timeout = '30s'` covers a stalled client, and a 5-minute deadline ends the stream;
        - the stream commits and releases on end, and rolls back on a disconnect, a failed query or the deadline, aborting the response so it never looks like a complete file;
        - each process serves at most 2 streams at once, and a third answers 503 `report_busy`;
        - `Server-Timing` covers the setup only, and the log line is written when the stream ends (P3).
    - `afterCommit`: false by default (D-368). With it, the handler returns a continuation instead of a response. The wrapper commits and releases the transaction, then awaits the continuation, which builds the final response. The continuation may call the system module or remote services, never the runtime pool. F11's PDF route and F13's search, for its Learn call, use it.
        - **Timing** (D-386): `Server-Timing` `app;dur` ends at the commit, and the continuation is reported as `after;dur`. NFR-1's server-time budget applies to `app;dur`, so a remote call is never counted as database-bound server time.

    The handler is called as `handler(ctx, tx, input)`.
- **BR-P2-16** A mutation is any POST, PUT, PATCH or DELETE. Every `user` mutation requires an `Idempotency-Key`, with three exceptions (D-201). They are online only and never queued:
    - `POST /api/sync/catch-up`, idempotent by design;
    - `POST /api/billing/*`, where Stripe calls carry their own idempotency keys;
    - `POST /api/account/reset`, guarded by its confirmation text and an empty queue.
- **BR-P2-17** Steps by mode, in order; the first failure stops the request:

    | # | Step | `user` read | `user` mutation | `webhook` | Failure |
    | --- | --- | --- | --- | --- | --- |
    | 1 | Request id | Yes | Yes | Yes | none |
    | 2 | Media type is `application/json` (parameters such as `charset` ignored) | | Yes | | 415 `unsupported_media_type` |
    | 3 | Body at most 64 KB | | Yes | Yes | 413 `payload_too_large` |
    | 4 | `Origin` equals `APP_ORIGIN`; a missing `Origin` fails | | Yes | | 403 `cross_origin` |
    | 5 | `Idempotency-Key` present, a UUIDv7; and a `Daybook-Build` header, when sent (the write queue sends it, P1), equals `BUILD_ID` | | Unless exempt | | 400 `bad_request`; 409 `build_mismatch` with `details.buildId`, before any lookup or write (D-383) |
    | 6 | `If-Match` present when versioned | | Yes | | 400 `bad_request` |
    | 7 | Provider signature over the raw body | | | Yes | 400 `bad_request` |
    | 8 | Session | Yes | Yes | | 401 `unauthenticated` |
    | 9 | Daily pass when due (BR-P2-27), then the catch-up check when `catchUp` (BR-P2-14) | Yes | Yes | | Logged only |
    | 10 | Open `withUser` (read or write) | Yes | Yes | | |
    | 11 | Profile, unless the route opts out | Yes | Yes | | 403 `profile_required` |
    | 12 | Capability, if declared | Yes | Yes | | 403 `premium_required` or `feature_off` |
    | 13 | Body against its Zod schema | | Yes | Yes | 422 `validation_failed` |
    | 14 | Idempotency (BR-P2-18): the record is inserted here; a stored answer was already returned right after step 10 | | Unless exempt | | Stored response, or 422 `idempotency_key_reused` |
    | 15 | Handler | Yes | Yes | Yes | Mapped per BR-P2-24 |

    Profile and capabilities are read inside the step 10 transaction. `webhook` handlers run through the system module and never call `withUser`. A mutation with no payload, such as a DELETE, sends `{}` with the JSON media type; its request hash covers `{}` (API-2).

**Idempotency (D-197)**

- **BR-P2-18** **The early lookup** (D-362). Right after opening the transaction (step 10), before the profile, capability and body checks, the wrapper selects any stored record for the key.
    - **The hash:** computed once, before step 10, from the method, the path and the raw body's canonical JSON, and reused at step 14. A body that is not valid JSON skips the early lookup and fails at step 13.
    - **Same hash:** its stored response is returned at once. A replay of a request that committed therefore gets its answer, even if a flag or capability would now refuse it. A replay from an older build is refused at step 5 with `build_mismatch` first, and gets its answer once the client has updated (D-383).
    - **Different hash:** 422 `idempotency_key_reused`.
    - **Otherwise:** the steps continue.

    Then, inside the handler's transaction and before the change, the wrapper runs `INSERT ... (user_id, key, request_hash) ON CONFLICT (user_id, key) DO NOTHING RETURNING id`.
    - **A row is returned:** the handler runs, and the record is updated with the response before commit. Effect and record commit together or not at all.
    - **No row returned:** the wrapper selects the record. Same hash: it returns the stored response without running the handler. Different hash: 422 `idempotency_key_reused`.
- **BR-P2-19** Two concurrent requests with one key serialize on the unique index. The second insert waits for the first transaction. If the first commits, the second takes the no-row branch; if the first rolls back, the second inserts and runs.

**Creates and versions**

- **BR-P2-20** A create uses the client's id: `INSERT ... ON CONFLICT (id) DO NOTHING RETURNING *`. With no row returned, it reads the id under RLS:
    - **Found:** the existing row is returned with 200 (API-5).
    - **Not found:** 409 `id_conflict`.
    - **Tables with another unique key:** F04's Budget create uses `ON CONFLICT DO NOTHING` without a target, then re-reads (F04, BR-F04-01).
    - **Id rules:** a client id must be a UUIDv7 whose embedded time is at most 5 minutes ahead of `ctx.now` (BR-P2-43). Otherwise 422 `validation_failed` on `id`, with "This item's time is in the future. Check your device's clock."
- **BR-P2-21** An update or delete runs `... WHERE id = $1 AND version = $2`, with the version from `If-Match`.
    - **Zero rows:** the row is re-read under RLS. It exists: 409 `version_conflict` with the current row in `details.current`. It does not: 404 `not_found`.
    - **Success:** an update sets `version = version + 1` and `updated_at` to `ctx.now`.

**Value parsing**

- **BR-P2-22** However the driver and Drizzle are configured, these outcomes hold:
    - **Date columns** reach code as `YYYY-MM-DD` strings (Drizzle `date` with `mode: 'string'`), never JS `Date`s.
    - **`timestamptz` columns** reach code as `Date`s and are serialized as ISO UTC.
    - **Money columns** are `bigint` with `mode: 'number'`, inside MON-5.
    - **Raw SQL aggregates** are cast (`sum(amount)::bigint`, `count(*)`) and mapped with a safe-integer mapper (`.mapWith(safeInt)`) that throws above `Number.MAX_SAFE_INTEGER` (MON-6).
    - **Quantities** (`numeric`) stay strings.
- **BR-P2-23** No code calls `Number()` or `parseInt` on a database value.

**Errors**

- **BR-P2-24** Errors map to the envelope (API-9):

    | Source | Response |
    | --- | --- |
    | Zod failure | 422 `validation_failed`, one message per field |
    | Unique violation on a business constraint | 422 `validation_failed` on the constrained field |
    | Check-constraint violation | 422 `validation_failed` |
    | Foreign-key violation on insert or update (missing parent) | 422 `parent_missing` |
    | Foreign-key violation on delete (children remain) | 409 `has_dependents` |
    | RLS `WITH CHECK` violation | 404 `not_found`, sent to Sentry as a security event |
    | Statement timeout | 503 `timeout` (the queue retries) |
    | Any other error | 500 `internal`; reported to Sentry with the request id, a database error by SQLSTATE, table, and constraint (or column, for NOT NULL) only (P3, BR-P3-05) |

    SQL text, stack traces and other users' data never appear in a response.

**The system module**

- **BR-P2-25** `server/system` is the only user of the system pool. Each function states in its doc comment why it acts across users, and filters by user explicitly where it acts for one user.
- **BR-P2-26** Its functions:
    - store the Stripe Customer id, entitlements and plan status, clear them, and delete the Stripe Customer on account deletion (F12, F01);
    - record processed Stripe event ids;
    - seed reference data and scenario-account finance rows (F15);
    - write capability overrides (P4).
- **BR-P2-27** The global daily pass runs once per UTC day of `ctx.now` (BR-P2-43), independently of any user's catch-up (D-292). It does three things: price catch-up (JOB-3), deleting idempotency records older than 90 days, and deleting processed Stripe event ids older than 30 days (F12, D-308).
    - **Who starts it:** the wrapper at step 9 of BR-P2-17, and `readAsUser` before its catch-up check, on any request.
    - **The note:** each server process keeps `lastDailyPassOn`, a UTC date. A request skips the pass while the note equals the UTC date of `ctx.now`.
    - **The pass:** one system-pool transaction inserts the day's marker row with `INSERT ... ON CONFLICT DO NOTHING RETURNING`.
        - **A row comes back:** the same transaction runs both tasks, and the marker commits with them.
        - **No row:** another process has done it. A concurrent insert waits for that transaction and sees its outcome.
    - **After:** a commit, or an existing marker, sets the note to that UTC date.
    - **A failure:** rolls everything back, marker included, and is logged to Sentry. The request continues, and the process retries on a request at least one minute later.
    - **`pricesUpdated`:** set on the request context when this request's pass wrote prices (F05, BR-F05-06).

**`proxy.ts` (D-172)**

- **BR-P2-28** The matcher covers every path except `/_next/static`, `/_next/image`, icons, the manifest, the service worker (`/serwist/*`, P1), Sentry's tunnel (`/monitoring`, P3) and `favicon.ico`. It skips `next/link` prefetch requests.
- **BR-P2-29** Optimistic redirects use Better Auth's `getSessionCookie` with the `daybook` prefix. They check presence only, with no database call.
    - No cookie on a logged-in route redirects to `/login?next=<path>`.
    - A cookie on `/login` or `/signup` redirects to `/dashboard`, unless the URL carries `expired=1`.
    - `/` is never redirected by the proxy; its page decides with a validated session (F01).
    - `/print/*` is never redirected; a print token, not a cookie, authenticates it (BR-P2-42; F11).
    - A page request carrying the cookie `daybook_logout=1`, other than `/login`, `/signup`, `/offline` and `/api/session/expired`, is redirected to `/api/session/expired?reason=logout` (D-367; P1, BR-P1-33). Page requests here include RSC navigations (`RSC: 1`), so a client-side link cannot reach a page first.
- **BR-P2-30** Every request gets a new UUIDv7 `x-request-id`, set on the forwarded request and the response.
- **BR-P2-31** The early reject repeats wrapper steps 2 and 4 for `/api` mutations, except `/api/auth/*` (Better Auth checks its own origins) and `/api/webhooks/*` (signed, no `Origin`).
- **BR-P2-32** For page requests, the proxy generates a nonce, puts the CSP and `x-nonce` on the **forwarded request headers** (Next.js reads the nonce from there to nonce its own scripts) and sets the CSP on the response. API responses get the other headers, without the CSP.

**Content Security Policy and headers (D-165, D-195)**

- **BR-P2-33** The CSP, assembled per request:

    | Directive | Value |
    | --- | --- |
    | `default-src` | `'self'` |
    | `script-src` | `'self' 'nonce-<n>' 'strict-dynamic' https://js.stripe.com https://*.js.stripe.com` |
    | `style-src` | `'self' 'unsafe-inline'` |
    | `img-src` | `'self' data: blob: https://cdn.sanity.io https://*.stripe.com https://*.link.com` |
    | `font-src` | `'self'` |
    | `connect-src` | `'self' https://api.stripe.com https://link.com https://*.link.com https://*.api.sanity.io https://*.apicdn.sanity.io` |
    | `frame-src` | `https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://link.com https://*.link.com` |
    | `worker-src`, `manifest-src` | `'self'` |
    | `form-action`, `base-uri` | `'self'` |
    | `object-src` | `'none'` |
    | `frame-ancestors` | `'none'` |
    | `upgrade-insecure-requests` | Only when `APP_ORIGIN` is `https` |

    - **Styles:** they allow inline styles (D-195), because React, React Aria and toast libraries inject `style` attributes and `<style>` elements at runtime. Scripts stay strict.
    - **Stripe:** the entries follow Stripe's published lists for Stripe.js and Link.
    - **Sentry:** events go through a same-origin tunnel route, so no Sentry host is listed (D-196).
    - **Development:** adds `'unsafe-eval'` to `script-src`, as Next.js requires.
- **BR-P2-34** Other headers:
    - `X-Content-Type-Options: nosniff`
    - `Referrer-Policy: strict-origin-when-cross-origin`
    - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")`
    - `Strict-Transport-Security` only when `APP_ORIGIN` is `https`.
- **BR-P2-35** Every page renders dynamically. The root layout reads `x-nonce` from `headers()` and passes it to the theme script and to every `Script`.

**Migrations and verification**

- **BR-P2-36** Drizzle Kit generates SQL migrations, extended by hand for grants, RLS and policies. They are reviewed and committed. `db:migrate` runs them as the owner over the direct endpoint; the app never migrates on start.
- **BR-P2-37** `db:verify` runs after every migration and before every integration-test run. It exits non-zero unless:
    - every private table has RLS enabled and forced, and exactly the `owner_isolation` and `system_access` policies;
    - every view in `app` has `security_invoker`, and no materialized view in `app` reads a private table;
    - the grant matrix equals section 3;
    - the roles meet BR-P2-03;
    - schema `app` contains no `SECURITY DEFINER` function.

**Environment and secrets**

- **BR-P2-38** Server and public variables are validated with Zod at startup; a missing or malformed one stops the process with a list. The Sentry variables, `SANITY_WRITE_TOKEN` and `SANITY_READ_TOKEN` are optional (P3, F14).
    - `APP_ORIGIN` (for example `http://localhost:3000`) is the one origin used for origin checks, Better Auth's base URL, trusted origins and the CSP.
    - The app refuses to start if `STRIPE_SECRET_KEY` does not begin with `sk_test_` (D-199).
    - `.env` is gitignored; `.env.example` lists every variable with a placeholder and a comment.

**Session cookie and Better Auth**

- **BR-P2-39** The session cookie has the prefix `daybook`, is `httpOnly`, SameSite=Lax and path `/`, and is `Secure` when `APP_ORIGIN` is `https` (Better Auth then adds the `__Secure-` prefix). Session cookies are cleared in one place only (D-204):
    - **The clearing route:** `/api/session/expired` clears every cookie whose name starts with `daybook.` or `__Secure-daybook.`. Each expiry carries `Path=/` and, for `__Secure-` names, `Secure`, so browsers accept it. The route acts only when `Sec-Fetch-Site` is `same-origin` or `none`; any other request is redirected to `/login` without clearing, so another site cannot log the user out.
    - **Pages:** a server component that finds an invalid session redirects to `/api/session/expired?next=<path>`. The route clears the cookies and redirects to `/login?next=<path>&expired=1`, so a revoked session never loops between `/login` and `/dashboard`.
    - **Offline logout** (`reason=logout`): when the request carries `daybook_logout=1`, the `Sec-Fetch-Site` check is skipped, since only Daybook's own script can set that cookie. A navigation that began on another site therefore still revokes the session. The route revokes the session through Better Auth when a session cookie is present, always clears `daybook_logout` and the session cookies, and redirects to `/login?expired=1`.
    - **Refusals:** any request the route refuses is redirected to `/login?expired=1`, which the proxy always lets through, never to plain `/login`. So no redirect can loop between `/login` and `/dashboard` (D-367).
    - **API responses:** they never clear cookies, so a late 401 from a request sent with an old cookie cannot wipe the cookie of a login that just finished. After an API 401, the client sends the user to `/login?expired=1`, which the proxy always lets through (BR-P2-29).
- **BR-P2-40** Better Auth has four infrastructure settings:
    - It runs on its own Drizzle instance on the auth pool, with its tables in schema `auth`.
    - Its base URL and only trusted origin are `APP_ORIGIN`.
    - Its rate limiter stays at its defaults (D-153).
    - A Better Auth `before` hook returns 404 for every path not on this allow-list (D-202): `/sign-up/email`, `/sign-in/email`, `/sign-out`, `/get-session`, `/list-sessions`, `/revoke-session`, `/revoke-other-sessions`, `/change-password`, `/update-user`, `/delete-user`.

    F01 owns their behavior.

**Print token (SEC-11)**

- **BR-P2-41** A print token is base64url JSON `{ sub, report, period, generatedAt, exp }` plus an HMAC-SHA256 signature with `PRINT_TOKEN_SECRET`; `exp` is at most 60 seconds ahead. It travels only in the `X-Print-Token` request header, never in a URL (F11).
- **BR-P2-42** The print route reads through `readForPrint(token, fn)` in `server/dal/read`. It verifies the token's signature and expiry, builds the request context for `sub` with no catch-up and with `ctx.now` set to the token's `generatedAt`, resolves capabilities, and runs `fn` in one read transaction. `proxy.ts` has already checked the signature, expiry and allow-list without a database call. Only the report routes listed in F11 accept a print token.

**Clock (D-242)**

- **BR-P2-43** Every date and instant Daybook writes or compares comes from the request context.
    - **`ctx.now`:** read once per request, from the server clock, or from the frozen clock in tests (TST-3). Scripts set it the same way.
    - **`ctx.today`:** derived from `ctx.now` and the profile time zone.
    - **In SQL:** both are passed as bound parameters: catch-up, windows, limits, `created_at`, `updated_at`, idempotency records and the 90-day purge. SQL and migrations never use `now()`, `current_date`, `current_timestamp`, `localtimestamp` or a `DEFAULT now()`, and Drizzle columns never use `.defaultNow()`.
    - **Exempt:** Better Auth's own tables in schema `auth`, which Better Auth stamps itself.
    - **Enforcement:** a test scans `server/` and the migrations for those functions.

## 5. Calculations

None. This spec computes no user-facing numbers. `Server-Timing` reports `db;dur=` (summed query time) and `app;dur=` (the time from the wrapper's first step to the response, or to the commit for an `afterCommit` route, so the session, profile and capability steps count) in milliseconds. An `afterCommit` route adds `after;dur=` for its continuation (D-386).

## 6. Screens and states

None. Error codes reach the user through each feature's states. The messages in section 8 are the defaults every screen uses unless its spec overrides one.

## 7. Flows

**7.1 A read: `GET /api/transactions?from=2026-10-01&to=2026-10-31`**

1. `proxy.ts` adds a request id; the session cookie is present, so it passes.
2. The wrapper resolves the session. If catch-up is due, it runs first.
3. The wrapper opens a repeatable-read, read-only `withUser` transaction, reads the profile and capabilities, and calls the handler with it.
4. The handler runs the list and summary queries on one snapshot.
5. The response carries the rows, `currency`, `x-request-id` and `Server-Timing`.

**7.2 A create, sent twice**

1. The client sends `POST /api/transactions` with entity id `0192f…a1` and `Idempotency-Key` `0192f…b7`.
2. In one write transaction, the wrapper inserts the idempotency record (a row comes back), the handler inserts the Transaction, the wrapper stores the 201 response in the record, and the transaction commits.
3. The network drops before the response arrives; the queue retries with the same key.
4. The insert returns no row; the stored record has the same hash, so the stored 201 is returned. No second Transaction exists.
5. **Concurrent duplicate:** the retry arrives while step 2 is still open. Its insert waits, then takes step 4.
6. **Edited body under the same key:** 422 `idempotency_key_reused`; the queue marks the item rejected.

**7.3 An edit that conflicts**

1. Device A edits a Budget with `If-Match: "3"` and succeeds; the version becomes 4.
2. Device B, offline since version 3, replays its edit with `If-Match: "3"`.
3. The update matches zero rows; the re-read finds the row, so the response is 409 `version_conflict` with version 4 in `details.current`.
4. The sync panel shows both versions (OFF-7).

**7.4 A Stripe webhook**

1. `POST /api/webhooks/stripe` arrives through the Stripe CLI, with no `Origin` and `application/json; charset=utf-8`.
2. `proxy.ts` skips its early reject for `/api/webhooks/*`.
3. The `webhook` wrapper verifies the signature against the raw body.
4. The system module skips an event id it has already processed, syncs the Customer's user from Stripe, and records the event id in the sync's transaction (F12, BR-F12-24).

**7.5 A revoked session on a page**

1. The user opens `/dashboard`; the cookie is present, so `proxy.ts` passes.
2. The page's `readAsUser` finds no valid session and redirects to `/api/session/expired?next=/dashboard`.
3. That route clears the session cookies and redirects to `/login?next=/dashboard&expired=1`.
4. The proxy sees no cookie (and `expired=1`), so the login page renders.

**7.6 Account deletion, database side**

1. F01's deletion runs in Better Auth's delete-user flow on the auth pool. Its before-delete hook has already cleared entitlements through the system module.
2. Deleting `auth.user` cascades to its sessions and accounts, and to every private `app` row. Foreign-key actions run regardless of RLS.

## 8. Validation and messages

| Code | Default message |
| --- | --- |
| `bad_request` | The request could not be read. |
| `unauthenticated` | Your session has expired. Log in again. |
| `cross_origin` | This request came from another site and was blocked. |
| `profile_required` | Finish setting up your profile first. |
| `premium_required` | This is part of Daybook Premium. |
| `feature_off` | This feature is switched off right now. |
| `not_found` | We could not find that. It may have been deleted. |
| `version_conflict` | This was changed on another device. |
| `build_mismatch` | Daybook was updated. Reload to keep saving changes. (The queue pauses rather than showing it, P1.) |
| `id_conflict` | This could not be created. Try again. |
| `has_dependents` | This still has linked items. Remove them first. |
| `payload_too_large` | That is too much data for one request. |
| `unsupported_media_type` | This request format is not supported. |
| `validation_failed` | Some fields need attention. (Each field gets its own message from its spec.) |
| `parent_missing` | The item this belongs to no longer exists. |
| `idempotency_key_reused` | This change conflicts with an earlier one. Discard it and try again. |
| `currency_mismatch` | Not saved: your currency changed after this was made. |
| `rate_limited` | Too many attempts. Wait a few seconds and try again. |
| `timeout` | This took too long. We will try again. |
| `internal` | Something went wrong on our side. Your change was not saved. (Reads: "This could not be loaded.") |

## 9. Plan gating

Wrapper step 12 calls P4's `assertCan` for a declared capability. Limit checks run inside the handler's write transaction (P4, BR-P4-08).

## 10. Offline behavior

This spec supplies the server half of offline safety:
- idempotency records kept 90 days, so a replay never duplicates;
- version checks, so a stale edit becomes a visible conflict;
- client ids, so offline creates can reference each other;
- the error classes the queue uses to retry, pause or reject (API-9).

Requests from the service worker carry `Origin` and pass the same checks.

## 11. Server surface

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/session/expired` | GET | Clears the session cookies, then redirects to `/login?next=...&expired=1` (BR-P2-39). With `reason=deleted` it redirects to `/?deleted=1` instead (F01). With `reason=logout` it first revokes the session and clears `daybook_logout` (P1). `next` is validated as in F01, BR-F01-09 |

**Internal modules**

| Module | Exports | May be imported by |
| --- | --- | --- |
| `server/env` | Validated server and public env | Any server module |
| `server/db/pools` | `authPool`, `runtimePool`, `systemPool`; the safe-integer mapper | `server/auth`, `server/dal`, `server/api/route`, `server/system` |
| `server/auth` | The Better Auth instance | Route handlers, `server/dal`, scripts |
| `server/dal/context` | `getRequestContext()` | `server/dal/read`, `server/api/route` |
| `server/dal/read` | `readAsUser(fn)`: context plus one read transaction | Server components |
| `server/dal/with-user` | `withUser(ctx, mode, fn)` | `server/dal/*`, `server/api/route` |
| `server/dal/<feature>` | Query and command functions that take a transaction | Route handlers, server components |
| `server/api/route` | `route(options, handler)` | Route handlers |
| `server/api/errors` | Error classes, envelope builder, Postgres error mapping | Route handlers, `server/dal` |
| `server/system/*` | The functions in BR-P2-26 and BR-P2-27 | Webhook and billing handlers, the `/api/me` handler (lazy billing check), Better Auth hooks, the wrapper (daily pass), scripts |
| `server/security/csp` | `buildCsp(nonce)`, the header set | `proxy.ts` |
| `server/security/print-token` | `signPrintToken`, `verifyPrintToken` | F11 |

**Pools.** Runtime: up to 10 connections; auth: 5; system: 3. Connect timeout 10 s, idle timeout 30 s. All use the pooled endpoint over TLS.

## 12. Cross-feature effects

- Every feature's endpoints use `route` and receive a transaction.
- F01's deletion relies on the cascade (7.6).
- F12's webhook and reconcile use the system module.
- F11 uses the print token.
- F05 supplies the Subscription catch-up that BR-P2-14 calls; F07 supplies price catch-up.
- P1's queue relies on idempotency, versions and the error classes.
- P4 runs inside the request context.
- P3 consumes `Server-Timing`, request ids and the Sentry tunnel.

## 13. Edge cases

- **A pooled connection after a crash** is returned rolled back; the transaction-local setting is gone (AC-P2-04).
- **An expired idempotency record and an old create:** API-5 returns the existing row. An old update meets a version conflict, which the user resolves.
- **Neon waking from idle:** the first connect can take seconds; the 10-second connect timeout covers it, and a timeout returns 503 for the queue to retry.
- **A sum above the safe-integer range** throws and returns 500, rather than a silently wrong number. Under MON-5 it needs implausible data.
- **Catch-up racing itself** (two tabs open on a new day): JOB-2's uniqueness on Subscription and due date makes the second run create nothing.
- **Better Auth's own responses:** they keep Better Auth's error shape, not the API-9 envelope. The client maps them (F01), and a 401 from `/api/auth/*` never triggers the session-expired handling.

## 14. Acceptance criteria

- **AC-P2-01** (integration) Given users A and B, when the runtime role, with A's context, selects, updates or deletes B's rows in every private table, then no row is returned or changed.
- **AC-P2-02** (integration) With no `app.user_id` set, every private table returns zero rows to the runtime role.
- **AC-P2-03** (integration) No Daybook role is superuser, owns anything, or has `BYPASSRLS`, `CREATEROLE` or `CREATEDB`. The runtime role gets "permission denied" on every table in schema `auth` and cannot write entitlements, plan status or overrides. The system role reads and writes two users' rows through `system_access`.
- **AC-P2-04** (integration) A connection whose transaction set A's context and then failed serves a context-less query with zero rows.
- **AC-P2-05** (integration) With A's context, inserting a Goal contribution that references B's Goal id fails with `parent_missing`.
- **AC-P2-06** (integration) Deleting a Subscription keeps its charges, with `subscription_id` null and `user_id` unchanged. Deleting the user removes every row without a foreign-key error.
- **AC-P2-07** (integration) `db:verify` passes on a migrated database. It fails for each of:
    - a private table with RLS disabled;
    - a missing `owner_isolation` or `system_access` policy;
    - an extra grant;
    - a view without `security_invoker`;
    - a `SECURITY DEFINER` function in `app`.
- **AC-P2-08** (integration) Two identical POSTs with one key, sequential and concurrent, produce one row and identical responses. The same key with a different body returns 422.
- **AC-P2-09** (integration) A PATCH with a stale `If-Match` returns 409 with the current row; a PATCH on another user's id returns 404.
- **AC-P2-10** (integration) A user mutation with a foreign `Origin`, no `Origin`, or `text/plain` returns 403, 403 and 415. A request with `application/json; charset=utf-8` passes.
- **AC-P2-11** (integration) A signed Stripe webhook with no `Origin` passes `proxy.ts` and the wrapper.
- **AC-P2-12** (E2E) With a revoked session cookie, opening `/dashboard` ends on `/login?...&expired=1` after at most two redirects, with the cookie cleared.
- **AC-P2-13** (integration) A read handler running two queries while another transaction commits a new Transaction between them sees the same rows in both.
- **AC-P2-14** (unit) The safe-integer mapper throws above `Number.MAX_SAFE_INTEGER`; date columns arrive as `YYYY-MM-DD` strings.
- **AC-P2-15** (integration) A page response carries a CSP with a fresh nonce per request, and Next.js's own scripts carry that nonce. An API JSON response carries the other headers and no CSP.
- **AC-P2-16** (unit) Startup fails with a live Stripe key or a missing variable.
- **AC-P2-17** (build) No server secret value appears in the client bundle.
- **AC-P2-18** (unit) A print token older than 60 seconds, or with a bad signature, is refused.
- **AC-P2-19** (integration) Better Auth paths that exist but are outside the allow-list, such as `/api/auth/change-email` and `/api/auth/request-password-reset`, return 404.
- **AC-P2-20** (integration) Two requests on a new day for the same user run Subscription catch-up exactly once, and the profile's `version` is unchanged afterwards.
- **AC-P2-21** (integration) `/api/session/expired` with `Sec-Fetch-Site: cross-site` clears no cookie and redirects to `/login?expired=1`, unless it carries `daybook_logout=1` with `reason=logout`, which revokes the session and clears the cookies.
- **AC-P2-22** (integration) With the frozen clock at 2026-11-02, golden's first request creates row 27 once and no charge dated after 2026-11-02, whatever the database's real date (CI's real date differs from the frozen one on every day except 2 Nov 2026). The BR-P2-43 scan passes.
- **AC-P2-23** (integration) A request by a user without a profile, followed in the same process by onboarding and another request, runs catch-up on that second request.
- **AC-P2-24** (integration) A catch-up run that fails and rolls back is retried on the user's next request in the same process.
- **AC-P2-25** (integration) A request with `Daybook-Queue: pending` on a new day runs no catch-up. The next request without the header runs it.
- **AC-P2-26** (integration) The daily pass:
    - a user already caught up today still gets the next UTC day's prices on their next request in the same process;
    - two processes running it at once write each price once.
- **AC-P2-27** (integration) A daily pass that fails leaves no marker and no prices. A request in the same process at least one minute later runs it again.
- **AC-P2-28** (integration) A streamed response whose client disconnects after the first page rolls back and returns its connection to the pool within a second. A third concurrent stream in one process gets 503.
- **AC-P2-29** (integration) Every user route handler, called directly with no `proxy.ts` in front, refuses a request with no session cookie (401), a foreign or missing `Origin` (403) and `text/plain` (415), as AC-P2-10 does through the proxy (root 15, criterion 10).

## 15. Illustrations

Illustrative, a route declaration. The wrapper opens the transaction; the handler receives it:

```ts
export const PATCH = route(
  { mode: 'user', body: budgetPatchSchema, versioned: true },
  (ctx, tx, { body, ifMatch, params }) => budgets.update(tx, params.id, ifMatch, body),
);
```

Illustrative, a conflict response:

```json
{
  "error": {
    "code": "version_conflict",
    "message": "This was changed on another device.",
    "details": { "current": { "id": "0192f0c4-...", "version": 4, "limitMinor": 500000 } },
    "requestId": "0192f0c5-..."
  }
}
```
