# P4 Capabilities

16 Oct 2026 · @Himanshu

One system answers "may this user use this?" for every gated feature. The server decides from two sources: Premium entitlements from Stripe, and feature flags set by the developer. The client receives the answers for display only, and keeps them for offline use. Row ownership is not a capability; RLS enforces it on every query (P2). There are no roles.

| Item | Value |
| --- | --- |
| Milestone | M0 (registry, flags, checks, `/api/me`), M4 (Stripe entitlements) |
| Plan | Free and Premium |
| Depends on | [P2](P2-data-access-and-security.md), [01-root-spec.md](../01-root-spec.md) section 10; F12 writes the entitlements this spec reads |
| Decisions | D-18, D-28, D-29, D-119, D-131, D-167, D-198, D-200, D-205 |

## 1. User stories

- As a Free user, I want to see what Premium adds where I would use it, so that I know what upgrading gives me.
- As a Premium user, I want my features to unlock as soon as my payment goes through, and to stay correct offline.
- As a developer, I want to add a gated feature by adding one registry entry.
- As a developer, I want to switch off a broken feature with one environment variable, without a code change.
- As a developer, I want to turn on an experimental feature for one test account only.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| The registry; code naming; the three kinds (premium, flag, limit); resolution order; server checks and refusals; race-safe limit checks; the capabilities block of `/api/me`; client `useCan` and `<Gate>`; the locked card; the per-user override script; Stripe lookup-key mapping | Codes for Stretch features, added when M8 starts (D-200) | Roles; an admin page; a hosted flag service; A/B experiments and analytics; flags that change on a schedule |

## 3. Concepts and fields

**Kinds**

| Kind | Answers | Decided by |
| --- | --- | --- |
| `premium` | Has the user paid for this? | Stripe entitlements |
| `limit` | How many may the user have? | Stripe entitlements: Premium value with the entitlement, Free value without |
| `flag` | Is this switched on? | Default, rollout, per-user override, kill switch |

**Registry entry**

| Field | Meaning | Rules |
| --- | --- | --- |
| `code` | The identifier | Lowercase dotted segments, camelCase inside a segment (`analytics.heatmap.view`). Never renamed once shipped |
| `kind` | `premium`, `limit` or `flag` | |
| `description` | One line, shown in tooling and logs | |
| `clientVisible` | Whether `/api/me` includes it | Server-only codes never reach the browser |
| `enforcedBy` | `server` (default) or `client` | `client` only for flags that switch browser behavior and protect nothing (BR-P4-10) |
| `default` | Flags: `on` or `off`. Limits: `{ free: n, premium: n or null }`, where null means unlimited | |
| `rollout` | Flags only: 0 to 100, optional | |
| `spec` | The owning spec, for example `F06` | |

**Resolved capability.** One per code, per request.

| Field | Meaning |
| --- | --- |
| `allowed` | `true` or `false` (always `true` for limits) |
| `reason` | `ok`, `premium_required` or `feature_off` |
| `limit` | Limits only: the number, or `null` for unlimited |

**Stored data read by the resolver.** Both are private, system-written tables (P2).

| Data | Written by | Holds |
| --- | --- | --- |
| Entitlements | F12's sync (webhook, reconcile, checkout, lazy billing check); F15 seeds (source `seed`) | The user's active Stripe feature lookup keys, source, update time |
| Capability overrides | The flag script (BR-P4-14) | Per user, per flag code: `on` or `off` |

**The codes**

| Code | Kind | Default | Client-visible | Spec |
| --- | --- | --- | --- | --- |
| `goals.active.max` | limit | Free 3, Premium unlimited | Yes | F06 |
| `analytics.heatmap.view` | premium | | Yes | F09 |
| `analytics.comparative.view` | premium | | Yes | F09 |
| `reports.quarterly.generate` | premium | | Yes | F11 |
| `reports.annual.generate` | premium | | Yes | F11 |
| `offline.writes` | flag, enforced by the client | on | Yes | P1 |
| `sync.background` | flag, enforced by the client | on | Yes | P1 |
| `insights.detector.categoryTrend` | flag | on | No | F10 |
| `insights.detector.budgetThreshold` | flag | on | No | F10 |
| `insights.detector.savingsRate` | flag | on | No | F10 |
| `insights.detector.outlier` | flag | on | No | F10 |
| `insights.detector.renewalsSoon` | flag | on | No | F10 |
| `insights.detector.savingsRecommendation` | flag | on | No | F10 |

Codes added when M8 starts (D-200). Until then they do not exist, and the features behind them are not built.

| Code | Kind | Default | Client-visible | Spec |
| --- | --- | --- | --- | --- |
| `analytics.weekdayHour.view` | premium | | Yes | F09 |
| `learn.premium.read` | premium | | Yes | F14 |
| `learn.tiers` | flag | off | Yes | F14 |
| `push.notifications` | flag | off | Yes | P1 |
| `app.badge` | flag | off | Yes | P1 |
| `search.operators` | flag | off | Yes | F13 |
| `dashboard.dragAndDrop` | flag | off | Yes | F08 |
| `transactions.bulkDelete` | flag | off | Yes | F03 |
| `budgets.monthOverride` | flag | off | Yes | F04 |
| `account.export` | flag | off | Yes | F01 |
| `billing.promotionCodes` | flag | off | Yes | F12 |
| `monitoring.sessionReplay` | flag | off | Yes | P3 |

## 4. Business rules

**Registry**

- **BR-P4-01** The registry is one server-only module (`server/capabilities/registry.ts`). It exports a `CapabilityCode` union type. Client code imports it with `import type`, so no registry data ships to the browser.
- **BR-P4-02** Using a code that is not in the registry is a type error at build time, on both server and client.

**Resolution**

- **BR-P4-03** `resolveCapabilities(ctx, tx)` runs once per request. In a route handler it reads inside the request's transaction (P2, BR-P2-17 step 10); in a server component it reads inside `getRequestContext()`'s transaction. It reads the user's entitlement keys and overrides, then resolves every code.
- **BR-P4-04** A `premium` code is allowed when the user's entitlement keys contain the code; otherwise it resolves `premium_required`.
- **BR-P4-05** A `limit` code resolves to the Premium value when the keys contain the code, and to the Free value otherwise. `allowed` is always true; enforcement compares counts (BR-P4-08).
- **BR-P4-06** A `flag` resolves in four layers; each later layer overrides the earlier:
    1. **Default** from the registry.
    2. **Rollout:** if a percentage is set, the flag is on when the bucket (section 5) is below it.
    3. **Per-user override:** `on` or `off`, if one exists for this user and code.
    4. **Kill switch:** the environment variable `FLAG_<CODE>` set to `on` or `off`, which beats everything. Dots become underscores and camelCase becomes upper snake case: `offline.writes` → `FLAG_OFFLINE_WRITES`, `dashboard.dragAndDrop` → `FLAG_DASHBOARD_DRAG_AND_DROP`.

    A flag that ends `off` resolves `feature_off`.
- **BR-P4-07** Startup validation (P2, BR-P2-38) rejects a `FLAG_` variable whose value is not `on` or `off`, whose code is not in the registry, or whose code is not a flag.

**Enforcement**

- **BR-P4-08** Each kind is enforced on the server in its own way:
    - **Premium codes, and flags enforced by the server:** the route wrapper checks them through `assertCan(code)` (P2, BR-P2-17 step 12). When the code depends on the data or on a route parameter, such as F11's report type, the data access layer or the handler calls `assertCan` itself.
    - **Limit codes:** the check runs inside the write transaction, after `pg_advisory_xact_lock(hashtextextended(user_id::text || ':' || code, 0))` (D-198). A create or reopen is refused when the count is at or above the limit; after a lapse it can be above. Two concurrent creates therefore cannot both pass a count of 2 with a limit of 3. Writes run at read committed (P2, BR-P2-09), so the count after the lock sees every committed row.
- **BR-P4-09** A refusal is 403 with the reason as the error code. `details` holds `{ capability }`, plus `{ limit, current }` for limits.
- **BR-P4-10** Security never depends on the client. Hiding or locking a control is display only, and the server checks every request again. Two flags are the exception, because they only switch browser behavior and guard nothing (D-205):
    - `offline.writes`: off means the client stops queueing new writes made offline.
    - `sync.background`: off means the client stops registering Background Sync.

    The server never checks either one, so online writes and the replay of items already queued carry on.

**Delivery to the client**

- **BR-P4-11** `GET /api/me` returns the profile, the plan summary (F12), the Goals lock summary (F06, BR-F06-15) and the resolved client-visible capabilities, with `resolvedAt` (section 11). After answering, it may run F12's lazy billing check (BR-F12-14).
- **BR-P4-12** The client fetches `/api/me` in these situations:
    - on app start;
    - on window focus when the answer is older than 60 seconds;
    - after login, and after a billing action changes the plan (F12);
    - 5 seconds after an answer that carries `billingCheck: true` (F12, BR-F12-14);
    - while the billing page shows "Activating Premium", once a reconcile call reports Premium (F12, BR-F12-18; root 5.5);
    - after any response with `premium_required` or `feature_off`.

    It is persisted with the query cache (STATE-3), so offline gating uses the last answer, shown with its "as of" time.
- **BR-P4-13** `useCan(code)` returns one of two shapes: `{ status: 'loading' }` before any answer exists (first load, no persisted copy), or `{ status: 'ready', allowed, reason, limit, asOf }`. While loading, gated UI shows a skeleton and never shows gated content as unlocked. A code missing from the answer resolves as `{ status: 'ready', allowed: false, reason: 'feature_off' }`.

**Tooling and Stripe**

- **BR-P4-14** The override script `npm run flag -- <code> on|off|clear --user <email>` finds the user through Better Auth (auth pool) and writes the override through the system module. It requires `--user`; global changes go through the registry default or a kill switch. It refuses premium and limit codes, which only Stripe grants.
- **BR-P4-15** `npm run stripe:setup` creates one Product, "Daybook Premium", with one Stripe Feature per `premium` and `limit` code, whose `lookup_key` equals the code. F12's sync stores the lookup keys Stripe lists as active, and the resolver ignores keys that are not in the registry.
- **BR-P4-16** Scenario accounts seeded as Premium (F15) get entitlement keys written directly with source `seed`. If that user buys Premium, F12's first sync replaces them.
- **BR-P4-17** When a code is removed from the registry, stored overrides and entitlement keys for it are ignored.

## 5. Calculations

**Rollout bucket.** Take the first 4 bytes of SHA-256 of the UTF-8 string `<userId>:<code>`, read them as an unsigned big-endian integer, and take that modulo 100. The flag is on when the bucket is below the rollout percentage. The bucket is stable for a user, and differs across codes.

**Limit headroom.** Remaining = limit minus current count; unlimited when the limit is `null`.

Worked example from the golden dataset: `golden@daybook.test` is Premium, so `goals.active.max` resolves to `null` (unlimited) and its 2 active Goals leave unlimited headroom. The same user on Free resolves to 3, leaving 1.

## 6. Screens and states

There is no screen of its own. Every gated element renders through `<Gate code>`:

| State | Shown |
| --- | --- |
| Loading (no answer yet) | The element's skeleton |
| Allowed | The element |
| `premium_required` | The locked card |
| `feature_off` | Nothing, or the `fallback` the element passes |
| Offline, using the persisted answer | As above; the locked card's Upgrade button reads "Connect to upgrade" and is disabled |

**The locked card (D-119)** has five parts:
- the title "Part of Daybook Premium";
- one line naming the feature, for example "See every day of spending on a calendar heat map.";
- a static sample picture, never the user's data;
- an Upgrade button to `/settings/billing?from=<code>`;
- a "Compare plans" link.

**Limit messages** appear inline beside the action they block. For the Goals cap: "Free includes 3 active Goals. Complete or archive one, or upgrade for unlimited Goals." with Upgrade.

## 7. Flows

**7.1 A Free user opens Analytics**

1. `/api/me` (fresh or persisted) says `analytics.heatmap.view` is `premium_required`.
2. The heat map's `<Gate>` renders the locked card.
3. A direct `GET /api/analytics/heatmap` returns 403 `premium_required` with `details.capability`.

**7.2 Upgrading**

1. The user pays (F12). Reconcile stores the entitlement keys.
2. The client refetches `/api/me`; `analytics.heatmap.view` is now `ok`.
3. Gates re-render, the heat map loads, and the next request passes the server check.

**7.3 Killing a broken feature**

1. A detector misfires, so set `FLAG_INSIGHTS_DETECTOR_OUTLIER=off` in `.env` and restart the server.
2. The next insights request skips that detector (F10 computes insights on request); no client change is needed, since the flag is not client-visible.
3. **Client-enforced flags:** setting `FLAG_OFFLINE_WRITES=off` makes the next `/api/me` resolve `offline.writes` as `feature_off`. P1 then stops queueing new offline writes and shows "Offline changes are paused. Reconnect to save." Online writes and items already queued are unaffected (BR-P4-10).

**7.4 A limit, enforced under a race**

1. A Free user with 2 active Goals creates two Goals at once, from two tabs.
2. The first transaction takes the advisory lock, counts 2, inserts, and commits.
3. The second waits on the lock, counts 3, and returns 403 `premium_required` with `{ limit: 3, current: 3 }`.

**7.5 Turning a flag off for one account**

1. Run `npm run flag -- insights.detector.savingsRecommendation off --user family@daybook.test`.
2. That user's next insights request skips the detector; no other user changes.

## 8. Validation and messages

| Situation | Message |
| --- | --- |
| 403 `premium_required` on an action | This is part of Daybook Premium. |
| 403 `premium_required` on a limit | Free includes 3 active Goals. Complete or archive one, or upgrade for unlimited Goals. (Each limit's spec words its own.) |
| 403 `feature_off` | This feature is switched off right now. |
| A queued item rejected with `feature_off` | Not saved: this feature was switched off. |
| Script: unknown code | Unknown capability code: <code>. |
| Script: premium or limit code | Premium capabilities come from Stripe and cannot be overridden. |
| Script: user not found | No user with email <email>. |

## 9. Plan gating

This spec defines the gating every feature uses. The endpoints that check each code:

| Code | Checked by |
| --- | --- |
| `goals.active.max` | Creating a Goal, reopening a completed or archived Goal, choosing the editable Goals after a lapse, and the lock computation on every Goal and Goal-Transaction write (F06) |
| `analytics.heatmap.view` | The heat-map endpoint (F09) |
| `analytics.comparative.view` | The budget-vs-actual and period-over-period endpoints (F09) |
| `reports.quarterly.generate`, `reports.annual.generate` | The report endpoints for those types, including the print route (F11) |
| `insights.detector.*` | `insightsFor`, which skips switched-off detectors on every request (F10) |
| `offline.writes`, `sync.background` | Nothing on the server; P1's queue reads them (BR-P4-10) |

## 10. Offline behavior

The persisted `/api/me` answer drives gating offline, with its "as of" time. A queued write needing a capability the user lost meanwhile (a lapse, a flag switched off) is refused on replay and shown as rejected. Upgrading needs a connection.

## 11. Server surface

| Endpoint | Method | Output | Errors |
| --- | --- | --- | --- |
| `/api/me` | GET | Below | 401 |

Illustrative `/api/me` response:

```json
{
  "user": { "id": "0192f0c4-...", "email": "golden@daybook.test", "name": "Golden" },
  "profile": { "country": "IN", "currency": "INR", "timezone": "Asia/Kolkata", "weekStart": "monday", "numberLocale": "hi-IN-u-nu-latn", "dateLocale": "en-IN" },
  "plan": { "premium": true, "status": "active", "source": "seed", "hasBillingAccount": false, "interval": "year", "price": null, "currentPeriodEnd": null, "endsAt": null, "scheduledInterval": null, "scheduledAt": null, "endedAt": null, "lapseSeenAt": null, "duplicate": false },
  "goals": { "lockedCount": 0, "needsChoice": false },
  "capabilities": {
    "goals.active.max": { "allowed": true, "reason": "ok", "limit": null },
    "analytics.heatmap.view": { "allowed": true, "reason": "ok" },
    "reports.quarterly.generate": { "allowed": true, "reason": "ok" },
    "offline.writes": { "allowed": true, "reason": "ok" }
  },
  "resolvedAt": "2026-11-02T06:30:00Z",
  "buildId": "2026-11-01.3"
}
```

`profile` and `goals` are `null` before onboarding. `buildId` lets the client detect that the server runs a newer build (P1).

**Internal functions**

| Function | Use |
| --- | --- |
| `resolveCapabilities(ctx, tx)` | Builds the map once per request (BR-P4-03) |
| `can(ctx, code)` | Boolean check |
| `assertCan(ctx, code)` | Throws the 403 refusal |
| `getLimit(ctx, code)` | Returns the limit, or `null` |
| `withLimitLock(tx, ctx, code)` | Takes the advisory lock and returns the current headroom |

## 12. Cross-feature effects

- F12 writes entitlements, and every Premium code changes with them.
- F06 uses the limit and the lock.
- F09, F11 and F14 gate their endpoints.
- F10 reads detector flags.
- P1 reads `offline.writes` and `sync.background`.
- P3 reads `monitoring.sessionReplay` when it exists.
- Every gated element renders through `<Gate>`.

## 13. Edge cases

- **Entitlements change while the app is open:** the next refetch updates gates. Meanwhile the server already enforces the new state, so a stale unlocked button gets a 403, which the UI shows as the locked message.
- **Webhook missed:** the lazy billing check, or the reconcile when the billing page opens, corrects it (F12).
- **Rollout percentage changed:** users whose bucket crosses the threshold switch with the next `/api/me`. Accepted for flags.
- **A seeded account buys Premium:** its first sync replaces the seed keys with Stripe's (F12).
- **Clock and timezone:** capabilities never depend on dates, so device clocks cannot affect them.

## 14. Acceptance criteria

- **AC-P4-01** (unit) The resolver returns `premium_required` for a premium code without the entitlement key and `ok` with it.
- **AC-P4-02** (unit) `goals.active.max` resolves to 3 without the key and `null` with it.
- **AC-P4-03** (unit) Flag layers apply in order: an override beats the default and the rollout; a kill switch beats the override.
- **AC-P4-04** (unit) The rollout bucket for a fixed user id and code is the same on every run and equals the value computed by hand.
- **AC-P4-05** (unit) An invalid `FLAG_` variable stops startup.
- **AC-P4-06** (integration) Two concurrent Goal creates for a Free user with 2 active Goals produce exactly one new Goal and one 403 with `{ limit: 3, current: 3 }`.
- **AC-P4-07** (integration) `/api/me` contains no code whose `clientVisible` is false.
- **AC-P4-08** (integration) A direct request to every Premium endpoint without the entitlement returns 403 `premium_required`. With `FLAG_OFFLINE_WRITES=off`, an online Transaction create still succeeds.
- **AC-P4-09** (client integration, MSW) `<Gate>` renders the skeleton while loading, the locked card for `premium_required`, nothing for `feature_off`, and the child when allowed. It never renders the child before an answer exists.
- **AC-P4-10** (E2E) A Free user sees the locked heat-map card; after a test-card purchase the heat map renders without a reload.
- **AC-P4-11** (build) No string from the registry module other than the code names appears in the client bundle.

## 15. Illustrations

Illustrative registry entries:

```ts
export const registry = {
  'analytics.heatmap.view': { kind: 'premium', description: 'Calendar heat map of daily spending', clientVisible: true, spec: 'F09' },
  'goals.active.max': { kind: 'limit', default: { free: 3, premium: null }, description: 'Active Goals', clientVisible: true, spec: 'F06' },
  'offline.writes': { kind: 'flag', default: 'on', enforcedBy: 'client', description: 'Queue writes made offline', clientVisible: true, spec: 'P1' },
} as const satisfies Registry;

export type CapabilityCode = keyof typeof registry;
```

Illustrative client use:

```tsx
<Gate code="analytics.heatmap.view">
  <SpendingHeatmap month={month} />
</Gate>
```
