---
name: new-endpoint
description: "Add a route handler (an API endpoint) the way this project requires: it is listed in a spec's server surface, declared through the route wrapper, uses a shared Zod schema and one transaction through the data access layer, follows the idempotency and version rules, returns the error envelope, enforces plan gating on the server, and has tests."
argument-hint: "[METHOD /api/path]"
---

# New endpoint

Every mutation in Daybook is a route handler, and every private read and write goes through one wrapper and one database transaction. The rules are in `docs/platform/P2-data-access-and-security.md` (the wrapper, BR-P2-08 to BR-P2-24) and `docs/01-root-spec.md` section 8 (API-1 to API-10). This skill adds an endpoint without missing one of them.

The request: $ARGUMENTS

If no endpoint is named above, ask me which one.

## 1. The spec comes first

- Find the endpoint in the owning feature spec's section 11 (server surface) and in the root spec's endpoint map (API-10). Read its row: method, input, output, errors, idempotency and versioning, and the rules and criteria it cites. Read the feature's section 9 for plan gating.
- If the endpoint is not in a spec, stop and tell me. The spec changes first (`spec-change`).
- Server Actions are never used (SRV-3).

## 2. The wrapper must exist

Look for the real wrapper in `src/server/api/` and read its actual signature. Follow the code over this skill where they differ, and tell me about the difference. If no wrapper exists yet, stop and tell me: it belongs to the platform foundation (P2), not to this feature.

## 3. Declare it

Every handler is declared through `route(options, handler)` (BR-P2-15), and the handler is called as `handler(ctx, tx, input)`. Choose the options from the spec's row:

- `mode`: `user` for every finance and account endpoint, `webhook` only for the Stripe webhook.
- `body`: the Zod schema. It lives in `src/lib/schemas/` and the client form uses the same one.
- `versioned`: true for PATCH and DELETE on updatable rows (needs `If-Match`).
- `idempotent`: true by default for mutations. The only exceptions are catch-up, billing and account reset (BR-P2-16).
- `capability`: the capability code when the endpoint is Premium or limited.
- `profile`: required by default. Only `/api/me`, `/api/profile` and `/api/account/*` work without one.
- `stream` and `afterCommit`: only where the spec says, such as reports and search.

## 4. File layout

- The route file `app/api/<path>/route.ts`, in the root `app/` folder, stays thin. Never create `src/app`; Next ignores it. It exports the method declared through `route(...)` and calls a function in `src/server/dal/`.
- The data access function receives `ctx` and `tx` and never opens its own transaction.
- Every server module starts with `import 'server-only'`. Only `src/server/dal` and the wrapper import `withUser` or the runtime pool (BR-P2-11).

## 5. Handler rules

- **Identity:** the owner is `ctx.user.id`. Never read a user id from the body, the query or a header.
- **Create:** use the client's id. Insert with `ON CONFLICT (id) DO NOTHING RETURNING *`. With no row returned, read the id under row-level security: found means return the row with 200, not found means 409 `id_conflict`. The id must be a UUIDv7 no more than 5 minutes ahead of `ctx.now`, otherwise 422 on `id` (BR-P2-20).
- **Update and delete:** `WHERE id = $1 AND version = $2`, with the version from `If-Match`. Zero rows means re-read: it exists gives 409 `version_conflict` with the row in `details.current`, it does not gives 404. Success adds 1 to `version` and sets `updated_at` to `ctx.now` (BR-P2-21).
- **Clock:** dates and instants come from `ctx.now` and `ctx.today`, passed as parameters. Never `now()` in SQL (BR-P2-43).
- **Money:** integers in the minor unit. A request that creates or changes money carries `currency`, and a mismatch is 422 `currency_mismatch`. Every response with money carries `currency` (API-6). No `Number()` or `parseInt` on a database value; cast aggregates and map them with the safe-integer mapper (BR-P2-22, BR-P2-23).
- **Errors:** let them map to the envelope of API-9 as BR-P2-24 says. Zod failures give 422 `validation_failed` with one message per field. Nothing in a response holds SQL text, stack traces or another user's data. A code the spec adds to the envelope is listed in its server surface.
- **Lists:** cursor pagination, `limit` default 50 and maximum 100, opaque cursors that stay stable when rows are inserted (API-7). Filters go through the one shared filter-to-SQL function (FIL-2).
- **Plan gating:** call `assertCan` on the server. A refusal is 403 `premium_required` or `feature_off` (CAP-4). Take limit checks inside the transaction, after the locks, in the order of SRV-7.
- **Side effects:** anything that calls an outside service runs after the commit, through `afterCommit`.
- **Cookies:** API responses never set or clear cookies (BR-P2-12).

## 6. The client side, when the spec has a screen

The feature's hooks live in `src/features/<name>/`. A mutation sends an `Idempotency-Key` (a UUIDv7) and `If-Match` where the endpoint is versioned. An offline-writable endpoint goes through the write queue (OFF-4, OFF-5); until the offline work exists, follow the spec's stand-in, which is online only. After a confirmed write, invalidate the queries the spec lists under cross-feature effects.

## 7. Tests

Follow `.claude/rules/testing.md`, with the criterion ID in a comment above each test.

- **Server (CI only):** every error in the spec's table; the same key and body twice gives one row and the same response; the same key with another body gives 422 `idempotency_key_reused`; a stale `If-Match` gives 409; another user's row on read, update or delete gives 404, and a create with another user's id gives 409 `id_conflict`; no session gives 401; a gated endpoint gives 403 `premium_required` without the entitlement.
- **Unit:** the Zod schema and any pure mapping.
- **Component with MSW:** the form, its messages and its states.

## 8. Report

List the files, the `route(...)` declaration and the spec rows it satisfies, the tests added, which could not run here, and anything the spec leaves unclear. If the endpoint is new to the root endpoint map, update it through `spec-change`.

## Keep this skill current

When the first real endpoint exists, compare this skill with it and fix any difference. Replace step 2 with the wrapper's real location and signature.
