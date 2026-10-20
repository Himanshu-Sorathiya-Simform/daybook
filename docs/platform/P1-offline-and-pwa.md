# P1 Offline and PWA

18 Oct 2026 · @Himanshu

Daybook keeps working without a connection.

- **Reading:** every page a user has opened recently reads from a copy saved on the device, marked with the time it was current.
- **Writing:** every finance change is saved to a queue on the device and sent in order: online at once, offline as soon as the network returns. Confirmed numbers never include a change that has not reached the server.
- **Seeing what waits:** a small indicator shows what is waiting, and a sync panel shows anything the server refused, with Retry, Edit and Discard.
- **The app itself:** it installs like a native app, updates only when the user agrees, and leaves no private data on the device after logout.

This spec owns the mechanisms: the service worker, the saved query cache, the write queue and its runner, the sync indicator and panel, the boot, logout and update flows, and the offline states. Each feature spec owns what its own changes look like while pending.

| Item       | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M5. Learn caching takes effect with F14 (M7). Push notifications and the app badge are Stretch (M8)                                                                                                                                                                                                                                                                                                                                                   |
| Plan       | Free and Premium; flags `offline.writes` and `sync.background` (P4)                                                                                                                                                                                                                                                                                                                                                                                   |
| Depends on | [P2](P2-data-access-and-security.md) (idempotency, versions, error codes, the catch-up skip, the session-expired route), [P4](P4-capabilities.md) (`/api/me`, flags, `buildId`), [F01](../features/F01-auth-and-account.md) (logout, session expiry, user switch); the finance specs [F03](../features/F03-transactions.md) to [F06](../features/F06-goals.md) queue their writes; [F05](../features/F05-subscriptions.md) supplies the boot endpoint |
| Decisions  | D-37, D-38, D-40 to D-46, D-137 to D-145, D-179, D-181, D-228, D-239, D-244, D-265 to D-267, D-269, D-318 to D-330, D-361 to D-367, D-374 to D-377, D-382 to D-384                                                                                                                                                                                                                                                                                    |

## 1. User stories

- As a user on a train, I want to add a Transaction offline and have it saved when I'm back online, exactly once.
- As a user, I want to open the app offline and see my last dashboard and lists, with the time they were current.
- As a user, I want to know when changes are waiting, and to fix any the server refused.
- As a user editing on two devices, I want to see both versions when they collide, and choose.
- As a user who logs out on a shared device, I want nothing of mine left behind, even if I was offline.
- As a user, I want updates to arrive without losing changes I have not synced.
- As a user, I want to install Daybook on my phone and open it like an app.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Stretch (M8)                                                                         | Out                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The web app manifest and install; the Serwist service worker, its caches and the offline page; the saved query cache; the write queue, its runner, holds, Background Sync and storage persistence; the queue signal for catch-up; pending overlays and settling; the sync indicator, sync panel and conflict view; the offline banner and offline states; the boot, logout, user-switch, session-expiry and update flows; the client side of the `offline.writes` and `sync.background` flags | Push notifications (D-144, `push.notifications`); the app badge (D-143, `app.badge`) | Logging in, signing up or onboarding offline; billing actions, reports, search, demo data, profile and account changes offline (each online only, OFF-4); periodic background sync; encrypting the device copy; syncing devices with each other without the server |

## 3. Concepts and fields

**Device storage** (D-320)

| Store             | Where                                                                                                                    | Holds                                                                                     | Wiped on logout and user switch                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Saved query cache | IndexedDB database `daybook-cache`                                                                                       | The persisted TanStack Query client, its buster and its owner (BR-P1-10)                  | Yes                                                                                                                         |
| Write queue       | IndexedDB database `daybook`, store `queue`                                                                              | Queue items (below)                                                                       | Yes                                                                                                                         |
| Settling          | Database `daybook`, store `settled`                                                                                      | Confirmed items whose effect is still on screen (BR-P1-22)                                | Yes                                                                                                                         |
| Queue state       | Database `daybook`, store `meta`                                                                                         | `ownerUserId`, `paused`, `serverBuildId`, `lastOnlineAt`, `persistAsked`                  | Yes, except the logout marker                                                                                               |
| Logout marker     | `meta` key `logoutPending`; mirrored in local storage `daybook.logoutPending` and the cookie `daybook_logout=1` (8 days) | `{ at }` (F01)                                                                            | Written by a logout whose sign-out was not confirmed, offline or online; removed only after a confirmed sign-out (BR-P1-33) |
| Queue cookie      | Cookie `daybook_queue=pending`                                                                                           | The catch-up signal (BR-P1-23)                                                            | Yes                                                                                                                         |
| Page cache        | Cache Storage `pages`                                                                                                    | Documents of logged-in pages and Learn, one per pathname (OFF-2)                          | Yes                                                                                                                         |
| Public caches     | Cache Storage `static`, `images`                                                                                         | Built scripts and styles of current and recent builds, optimized images and Sanity images | No: they hold no private data                                                                                               |
| Layout copy       | Local storage `daybook.layout`                                                                                           | F08's layout                                                                              | Yes                                                                                                                         |
| Theme             | Local storage `daybook.theme`                                                                                            | F02's theme                                                                               | No                                                                                                                          |

**Queue item** (OFF-5)

| Field                       | Meaning                                                                                                                                                                                                               | Example                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `id`                        | The item's own UUIDv7                                                                                                                                                                                                 | `0192f9c1-...`                         |
| `seq`                       | A counter that orders items by creation                                                                                                                                                                               | `41`                                   |
| `userId`                    | The user who made the change                                                                                                                                                                                          | `0192f0c4-...`                         |
| `schemaVersion`             | The item format, for migration after an update (BR-P1-29)                                                                                                                                                             | `1`                                    |
| `entityType`, `entityId`    | What it changes; creates carry the client-made id                                                                                                                                                                     | `transaction`, `0192f9c0-...`          |
| `kind`                      | `create`, `update`, `delete` or `action` (a state change, the editable choice)                                                                                                                                        | `create`                               |
| `method`, `path`, `body`    | The request to send                                                                                                                                                                                                   | `POST`, `/api/transactions`, `{ ... }` |
| `before`                    | The row the change was made against, as the screen showed it: the cached row, with every settled item still shown for it (BR-P1-22) and every earlier queued item for that entity applied; `null` for creates (D-361) | `null`                                 |
| `idempotencyKey`            | A UUIDv7                                                                                                                                                                                                              | `0192f9c1-...`                         |
| `baseVersion`               | The confirmed version the change is sent against; `null` for creates. Settling an earlier item for the entity updates it (BR-P1-17)                                                                                   | `null`                                 |
| `dependsOn`                 | The ids of queued creates this item needs (D-266)                                                                                                                                                                     | `[]`                                   |
| `status`                    | `pending`, `inflight`, `conflict`, `rejected` or `blocked` (BR-P1-19)                                                                                                                                                 | `pending`                              |
| `holdUntil`                 | Not sent before this instant, whatever triggers the runner (BR-P1-16); `null` for most items. An unsent create can also borrow its delete's hold (BR-P1-15)                                                           | `null`                                 |
| `sentAt`                    | When the item was first marked inflight; set once, and restored only after a 409 `build_mismatch`, which stores nothing (D-362, D-383)                                                                                | `null`                                 |
| `attempts`, `nextAttemptAt` | Send attempts that failed with a retryable error, and the earliest next one                                                                                                                                           | `0`, `null`                            |
| `serverFailures`            | Consecutive failures the server answered (5xx, 503) (BR-P1-20)                                                                                                                                                        | `0`                                    |
| `error`                     | The last refusal: code, message, request id, and for a conflict the server's row                                                                                                                                      | `null`                                 |
| `deletionCount`             | Subscription items: the charges their dialog said it would delete (F05, BR-F05-15)                                                                                                                                    | `0`                                    |
| `label`                     | What the sync panel shows: entity, name and amount, made when the item is created                                                                                                                                     | "Transaction · Chai Point · −₹300.00"  |
| `createdAt`                 | The client instant the item was made                                                                                                                                                                                  | `2026-11-02T06:10:00Z`                 |

**Queue state.**

- **`paused`:** `null`, `unauthenticated`, or `logout` while a logout waits to wipe (BR-P1-33).
- **`serverBuildId`:** the build id the server last reported, in `/api/me` or in a `build_mismatch` refusal (BR-P1-37).
- **`lastOnlineAt`:** the time of the last successful API response on this device.
- **`ownerUserId`:** the user the queue and saved cache belong to; "the last signed-in user" everywhere below.

## 4. Business rules

**The app and its service worker (D-318, D-319)**

- **BR-P1-01** **The manifest** (`app/manifest.ts`):
    - **Identity:** `id: "/"`, `name: "Daybook"`, `short_name: "Daybook"`;
    - **Launch:** `start_url: "/dashboard"`, `scope: "/"`, `display: "standalone"`;
    - **Colors:** `theme_color` and `background_color` from the light theme's tokens;
    - **Icons:** 192 and 512 pixels, plus a 512-pixel maskable icon, and an Apple touch icon in the document head.
- **BR-P1-02** **Install** (D-329). When the browser fires `beforeinstallprompt`, the user menu gains "Install app", which shows the browser's prompt. It is hidden when the event never fires, including on iOS, and once the app runs standalone.
- **BR-P1-03** **The service worker** is built with `@serwist/turbopack`, so the default Turbopack build works.
    - **Serving:** `createSerwistRoute`, in `app/serwist/[path]/route.ts`, serves it at `/serwist/sw.js` with `Service-Worker-Allowed: /`, and it is registered for scope `/`.
    - **The proxy:** `proxy.ts` skips `/serwist/*`, like the manifest and icons (P2, BR-P2-28).
    - **The client:** `SerwistProvider` and `client/sw-bridge` are mounted in both the app shell and the public shell, never in the print route (D-382). So the landing page, `/login`, `/signup` and Learn register the worker too. `SerwistProvider` is set with `disable` in development (OFF-3), and `reloadOnOnline={false}` so reconnecting never reloads a tab. Its `cacheOnNavigation` is off; Daybook warms pages itself (BR-P1-06).
    - **Activation:** the first install activates at once and takes control of open pages (`clientsClaim`). A later version waits (`skipWaiting` false) until the user selects Reload (BR-P1-38), or until every Daybook tab has closed, as browsers do.
    - **Navigation preload:** on, except while the logout marker exists (BR-P1-07).
- **BR-P1-04** **Precache.**
    - **Small assets:** fonts and icons from Serwist's manifest. Built scripts and styles are not precached: they go to the `static` runtime cache (BR-P1-05), where an older build's chunks stay after an update, so a page saved under that build still runs offline.
    - **`/offline`:** fetched when the worker installs, with `credentials: 'omit'` and the build id as its revision. Pages render dynamically under the nonce CSP (P2), so it is fetched rather than built. It renders no session data, and is stored with its own CSP header.
- **BR-P1-05** **Runtime caching** (root 7.5, D-363):

    | Requests                                                                                                                                                                                         | Strategy                                                                                                                                     | Cache and limits               |
    | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
    | Documents of every page except those in the last row, including `/`, `/learn` and post pages                                                                                                     | Network first, with a 3-second timeout; the fallback is the cached copy of the same URL, else `/offline`. Only `200` responses are stored    | `pages`: 50 entries, 7 days    |
    | `/_next/static/*`                                                                                                                                                                                | Cache first                                                                                                                                  | `static`: 500 entries, 30 days |
    | `/_next/image` and `cdn.sanity.io` images                                                                                                                                                        | Cache first, storing only 200 responses. Sanity images are requested with `crossorigin="anonymous"` (F14), so their responses are not opaque | `images`: 300 entries, 30 days |
    | RSC requests (`RSC: 1`), router prefetches (`Next-Router-Prefetch`), `/api/*`, `/serwist/*`, `/monitoring`, `/login`, `/signup`, `/onboarding`, `/print/*`, and every other cross-origin request | Network only, never cached                                                                                                                   | none                           |

    Rules apply in the order images, then never cached, then documents and static assets.

    - **The `/api` rule:** Serwist's default `/api` rule is removed (OFF-1).
    - **CSP:** a cached document keeps the CSP header it was served with, so its nonce still matches.
    - **Keys:** `pages` stores one document per pathname, and a document request matches by pathname, ignoring its query string. Offline, `/dashboard?month=2026-10` therefore opens the saved `/dashboard` document, whose client code then reads the URL and the saved query cache.
    - **After an update:** saved documents keep naming their own build's scripts, which `static` still holds, so they run offline until a page loads online under the new build.

- **BR-P1-06** **Warming pages** (D-363). A client-side navigation fetches an RSC payload, which is never cached. So when the pathname changes to a page the `pages` rule caches, the client posts `WARM` with the pathname to the worker. The page that is open when the worker first takes control is warmed the same way.
    - **First-visit scripts:** the scripts and styles a page loaded before the worker took control bypassed it. So on the first `controllerchange`, whatever the pathname (`/login` and `/signup` included), the client also posts every same-origin `/_next/static/` URL in `performance.getEntriesByType('resource')`. The worker fetches and stores each one that `static` does not hold yet. Shared chunks and the first page visited therefore also run offline.
    - **The fetch:** the worker requests that pathname with `credentials: 'same-origin'`, `redirect: 'manual'` and `Accept: text/html`.
    - **Storing:** it stores the answer under the pathname only when it is a 200 that was not redirected. A session that expired therefore never stores `/login` under `/budgets`.
    - **Not warmed:** query-string changes, such as filters.
    - **At most once a URL:** no URL is warmed more than once per 10 minutes.
    - **The cost:** one extra server render per first visit to a page.
    - **Offline:** a client navigation that fails falls back to a full page load, which the worker serves from `pages`.
- **BR-P1-07** **The logout marker in the worker** (F01, BR-F01-15). For each navigation, the worker reads `logoutPending`. While it exists, the worker:
    - ignores the navigation-preload response;
    - serves no cached page;
    - forwards the request to the network, where `proxy.ts` sees the `daybook_logout` cookie and revokes the session (BR-P1-33);
    - offline, serves `/offline`. That page reads the local-storage mirror and shows "You are offline. Connect to log in."

**Online and offline (D-330)**

- **BR-P1-08** **Being offline** means one of these:
    - `navigator.onLine` is false;
    - the last API request failed with a network error or a timeout, and no request has succeeded since.

    The `online` event, or any successful request, ends it.
    - **Probing:** while offline because of a failure, the client probes `GET /api/me`, first after 2 seconds, then doubling to at most 60 seconds, and again on window focus. So a server restart or a captive portal never leaves the app stuck offline.
    - **TanStack Query:** its `onlineManager` follows this state.
    - **`lastOnlineAt`:** updated by every successful response.

- **BR-P1-09** **The offline banner** (root 4) reads "You're offline. Showing what was saved on this device." While offline, each screen header shows its own "as of" time (BR-P1-12).

**The saved query cache (STATE-3, D-179, D-320)**

- **BR-P1-10** **The persister** is a custom IndexedDB persister on `idb`, following TanStack Query's documented pattern. It writes at most once a second.
    - **`maxAge`:** 7 days.
    - **`buster`:** the build id.
    - **The owner:** the user id is stored beside the client.
    - **`gcTime`:** saved queries use 7 days, at least `maxAge`.
    - **Restoring:** a saved client is restored only when its buster equals the running build id and its owner equals `ownerUserId` (root 5.2, step 2). Any other saved client is deleted.
    - **Several tabs:** they write the same snapshot; the last writer wins.
- **BR-P1-11** **What is saved.** Only queries in these families. `shouldDehydrateQuery` chooses the queries, and the persister's serialize step trims infinite queries to their first 2 pages. A "last viewed" family keeps only its most recently fetched query, or two for "current and last viewed".

    | Family                                                | Kept                                                                             | Spec    |
    | ----------------------------------------------------- | -------------------------------------------------------------------------------- | ------- |
    | `me`                                                  | Always                                                                           | P4, F02 |
    | Dashboard data                                        | The current month and the last viewed month                                      | F08     |
    | Insights (from M6)                                    | The current month and the last viewed month, matching the dashboard (root 7.3)   | F10     |
    | Transactions                                          | The first 2 pages and the summary of the default filter (all time, newest first) | F03     |
    | Payees                                                | Always                                                                           | F03     |
    | Budgets                                               | The current month                                                                | F04     |
    | Subscriptions and upcoming renewals                   | Always                                                                           | F05     |
    | Goals list                                            | Always                                                                           | F06     |
    | Goal details                                          | The 20 most recently viewed                                                      | F06     |
    | Investments summary and series                        | The last viewed range                                                            | F07     |
    | Investment holdings                                   | Always                                                                           | F07     |
    | Learn's latest posts (from M7), `['learn', 'latest']` | Always                                                                           | F14     |
    | Analytics charts                                      | The last viewed range, per chart                                                 | F09     |

    Learn pages are kept by the service worker (BR-P1-05); only the dashboard's latest posts are in the saved cache. Nothing else is saved: reports, search and billing actions need a connection.

- **BR-P1-12** **"As of."** A screen showing saved data names the oldest `dataUpdatedAt` among its visible queries.
    - **Today:** "as of 14:05".
    - **Earlier:** "as of 12 Oct, 14:05", in the profile's `dateLocale` (F02).

    Online and fresh, no "as of" shows.

**The write queue (OFF-5, D-321)**

- **BR-P1-13** **Every finance write goes through the queue,** online or offline: Transactions, Budgets, Subscriptions and Goals, including Goal contributions, withdrawals and states, and the editable choice (OFF-4).
    - **Online:** the runner sends it at once.
    - **Offline:** it waits.
    - **The screen:** shows the change as pending either way (BR-P1-22).

    Online-only writes never queue: the profile, billing, demo data, Reset my data, account changes and insight dismissals (from M6). Neither does the layout (OFF-8).

- **BR-P1-14** **Creating an item.** `enqueue` writes the item to IndexedDB in one readwrite transaction, with:
    - the next `seq`, `status: pending`, `attempts: 0` and `sentAt: null`;
    - a new idempotency key;
    - `baseVersion` and `before`, from the row shown on screen;
    - `dependsOn`, which lists every queued create the body names: a Goal for a contribution or withdrawal, or Goals for the editable choice;
    - `holdUntil`, when the feature asks for a delay (BR-P1-16).

    It then tells every tab (BR-P1-32) and starts the runner.
    - **Storage full:** if IndexedDB refuses the write because the device is full, nothing is shown as pending, and the dialog shows "This device is out of storage. Free some space and try again."
    - **`offline.writes` off:** while offline, `enqueue` refuses, and the dialog shows "Offline changes are paused. Reconnect to save." (P4, BR-P4-10). Online, writes still go through the queue and are sent at once.

- **BR-P1-15** **Merging** (D-138, D-265, D-322, D-362) applies only to a create whose `sentAt` is `null`. Once a create has been sent, the server may hold it under its idempotency key.
    - **One transaction:** merging re-reads the create inside the same IndexedDB readwrite transaction that writes the merge, so a runner in another tab cannot send it between the check and the write.
    - **A Transaction create, then an edit:** the edit's fields go into the create's body, and no new item is made.
    - **Any create, then a delete:** an unsent create with a later queued delete for the same entity borrows that delete's `holdUntil` as its own effective hold (D-374). Once that hold has passed, or at once for a delete without a hold, the queue removes the following in one transaction, and makes no request:
        - the create;
        - every other queued item for that entity;
        - the delete;
        - every item whose `dependsOn` names the create.

        This cancel pass runs in three places:
        - **`enqueue`:** inside the transaction that would write a delete without a hold, which is then never written;
        - **Runner start:** at every start, offline included;
        - **Before sending a create:** inside the mark-inflight transaction (BR-P1-17).

        So a create and its delete never both go out, even when the delete is queued during a run. The screen says how many dependents went: "Removed 2 changes that depended on it."

    - **A create that has been sent:** a later edit or delete is sent normally, after it, with version 1 (BR-P1-17).

    No other items merge. Budget, Subscription and Goal changes each replay as made, because they carry their own dates and states.

- **BR-P1-16** **Holds** (D-364). A feature can delay an item: F03's delete with Undo queues the delete with `holdUntil` 5 seconds ahead (F03, BR-F03-26).
    - **No early sending:** no trigger sends a held item early, not even `online` or a tab becoming visible.
    - **The effective hold:** an item's own `holdUntil`, or, for an unsent create with a later queued delete, that delete's (BR-P1-15). Everything below applies to the effective hold.
    - **The runner:** stops at a held item that is next in order, and sets a timer for the instant its effective hold ends.
    - **Undo:** a readwrite transaction that removes the item only if it is still `pending` with `sentAt: null`. IndexedDB runs overlapping readwrite transactions on the queue one after another, across tabs and the worker, and the runner's mark-inflight transaction re-reads the item (BR-P1-17). So Undo and sending never both happen.
    - **The toast:** closes, with its Undo, the moment the item leaves `pending`. Pausing on hover is off, so it never outlives the hold (F03).
    - **A tab closed during a hold:** on Chromium, a held item also registers Background Sync. When the worker's run stops at that hold, it releases the lock, waits for the hold to pass inside the event's `waitUntil` (at most 5 seconds), and runs again (BR-P1-27). Elsewhere it is sent at the next app start.
- **BR-P1-17** **The runner** (D-145, D-324). One runner per device holds the Web Lock `daybook-queue` while it works, so tabs and the service worker never run it twice at once.
    - **Taking the lock:** any `inflight` item returns to `pending`. Its earlier request may still be running on the server, after a closed tab or a timeout. Its retry then waits on the server's idempotency record and gets the first request's answer (P2, BR-P2-19). Its `sentAt` stays, so it can never merge (BR-P1-15).
    - **Order:** strict `seq` order, one request at a time.
    - **Starting:** on enqueue, on app start (BR-P1-31), on the `online` event, when a tab becomes visible, when a backoff or hold timer fires, and on Background Sync (BR-P1-27).
    - **Build check** (D-383): before each item, a runner compares its own build id with `serverBuildId`, the worker's included. While they differ it sends nothing. `serverBuildId` can be stale, for example in a worker woken after a deploy. So every queued request also carries the runner's build in `Daybook-Build`, and the server refuses a different one with 409 `build_mismatch` before doing anything else (P2, BR-P2-17). An old runner therefore never replays items to a new server (BR-P1-37).
    - **Migration:** before its first item, a runner in a page or the worker migrates older items (BR-P1-29).
    - **Skipping:** items whose status is `conflict`, `rejected` or `blocked`.
    - **Stopping:** the first retryable failure ends the run, so later items never overtake an earlier one. The run also stops at a held item, and while the queue is `paused`.
    - **Sending an item:**
        - **Inflight:** in one readwrite transaction over `queue` and `meta`, the runner re-reads the item and the queue state, and checks that:
            - the queue is not `paused`;
            - it still exists and is `pending`;
            - its effective hold has passed (BR-P1-16);
            - it is not blocked;
            - for an unsent create, no later delete of the entity is queued. If one is, the same transaction runs the cancel pass instead (BR-P1-15).

            Only then does it mark the item `inflight` and set `sentAt` if still `null`. It sends exactly the body it read there.

        - **The request:** `method` and `path`, with the JSON `body`, `Idempotency-Key`, `Daybook-Build`, and `If-Match` for an update, delete or action on a versioned row.
        - **`If-Match`** (D-269, D-375): `baseVersion`. A create that is still queued or settling counts as version 1.
        - **The queue signal:** `Daybook-Queue: pending` while Subscription items wait (BR-P1-23).
        - **The answer:** waited for at most 15 seconds, then treated as a timeout.
    - **Chaining:** when an item settles, the same transaction writes its returned version into `baseVersion` of every later queued item for that entity, whatever their status. A later Retry or Edit of a rejected item therefore never conflicts with the device's own earlier change. An edit made while an item is settling takes its `baseVersion` from that settled item, when that is newer than the cache.
- **BR-P1-18** **Outcomes** (OFF-5):

    | Response                                     | The item                                                                                                                                                                                 | The queue                                                                                               |
    | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
    | 2xx, including a stored idempotent replay    | Moves to `settled` (BR-P1-22)                                                                                                                                                            | Continues                                                                                               |
    | 404 on a `DELETE`                            | Moves to `settled`: the row is already gone (D-239)                                                                                                                                      | Continues                                                                                               |
    | 409 `version_conflict`                       | `conflict`, keeping `details.current` as the server's version                                                                                                                            | Continues with other entities                                                                           |
    | 401                                          | Back to `pending`                                                                                                                                                                        | `paused: unauthenticated`; the run stops (BR-P1-34)                                                     |
    | 409 `build_mismatch`                         | Back to `pending`, `attempts` unchanged, and `sentAt` restored to its value before this attempt: the server stored nothing, so the item can still migrate and merge (BR-P1-15, BR-P1-29) | `serverBuildId` takes `details.buildId`; the run stops, and the update flow starts (BR-P1-36, BR-P1-37) |
    | 408, 429, a network error or a timeout       | Back to `pending`, with `attempts` + 1 and `nextAttemptAt` (section 5)                                                                                                                   | The run stops                                                                                           |
    | 5xx, including 503 `timeout`                 | As the row above, and `serverFailures` + 1 (BR-P1-20)                                                                                                                                    | The run stops                                                                                           |
    | 403 `premium_required` or `feature_off`      | `rejected`; `/api/me` is refetched (P4)                                                                                                                                                  | Continues                                                                                               |
    | Any other 4xx, including other 409s and 422s | `rejected`, keeping the code, message and request id                                                                                                                                     | Continues                                                                                               |

    Any answer from the server resets `serverFailures` to 0, except a 5xx.

- **BR-P1-19** **Waiting behind a problem** (D-266, D-323). An item becomes `blocked`, and is skipped, while either of these is in `conflict` or `rejected`:
    - a create it depends on;
    - an earlier item for the same entity.

    It returns to `pending` when that item is confirmed, retried or edited, and is discarded with it. Its sync-panel row says "Waiting for an earlier change to Vacation."

- **BR-P1-20** **A stuck item** (D-365). After 5 consecutive server failures (`serverFailures` ≥ 5), the item keeps retrying on its backoff, but shows under "Needs attention" as "The server keeps failing on this change." with Retry now and Discard. One item that always fails therefore never traps the queue out of the user's reach.
- **BR-P1-21** **Feature messages and retention.**
    - **Messages:** each finance spec lists its refusal codes and messages (F03 to F06, section 10). The item shows them as "Not saved: <message>".
    - **Retention:** rejected, conflicting and stuck items stay until the user acts; they never expire. A change older than the server's window, such as F05's 90 days, comes back rejected with that spec's message.

**What the screen shows (OFF-6, D-40)**

- **BR-P1-22** **Pending overlays and settling** (D-366).
    - **Separate from saved data:** pending items are never written into cached query data. A figure reads them through `usePendingFor(entityType, query)`, naming the query it shows, and draws them as the feature spec says. `before` supplies the old values for an edit's or delete's effect (F03, BR-F03-42).
    - **Fetch start times:** the default `queryFn` stamps each result with `startedAt`, the time its fetch began.
    - **Settling:** a confirmed item moves to the `settled` store with `confirmedAt` and the query keys it affects. Every tab re-reads `settled` first, then invalidates those queries; invalidation cancels and restarts a fetch already running. For a figure, `usePendingFor` keeps showing a settled item's effect while that query's `data.startedAt` is earlier than `confirmedAt`, and drops it in the same render that shows newer data. So once a query has data fetched after the change, a number never shows twice or not at all, in any tab, online or offline.
    - **The one overlap:** a fetch that completes while the item is inflight, or before another tab hears that it settled, can already include the change while the overlay still shows it. The invalidation's refetch ends the overlap.
    - **Leaving `settled`:** an item leaves once no cached query among its keys holds data with `startedAt` earlier than its `confirmedAt`. This is checked whenever such a query gets new data or leaves the cache. A query that is never refetched therefore keeps the item, offline too, until it is garbage-collected (7 days at most, BR-P1-10).
    - **No alerts:** pending money never triggers a Budget alert or insight (OFF-6).
- **BR-P1-23** **The queue signal** (D-244, D-325). While any Subscription item is `pending`, `inflight` or held:
    - every API request from a page or the worker carries `Daybook-Queue: pending`;
    - the cookie `daybook_queue=pending` is set, with `Path=/`, `SameSite=Lax`, `Max-Age=7776000` (90 days, D-267's window), and `Secure` when the page is served over `https` (`location.protocol`).

    So documents and RSC requests, including the first server render, cross-site returns such as Stripe's, and any request no worker controls, carry it too.
    - **Keeping it right:** every tab recomputes the cookie from the queue on each `queue-changed`, so two tabs can never leave a stale value. The worker clears it with `cookieStore`; only Chromium's worker runs the queue, and it has `cookieStore`.
    - **Boot:** it is recomputed at boot before catch-up (BR-P1-31).
    - **The server:** treats the cookie exactly as the header (P2, BR-P2-14). Queued Subscription changes therefore replay before catch-up (D-181).

**The sync indicator and sync panel (D-139, D-326)**

- **BR-P1-24** **The indicator** in the header (root 4) shows one state. Its count is every item not yet confirmed.

    | State     | When                                                                  | Shown                                                            |
    | --------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
    | Saved     | The queue is empty                                                    | A check, with the tooltip "All changes saved"                    |
    | Saving    | The runner is sending                                                 | A spinner and "Saving 3 changes…"                                |
    | Waiting   | Items wait and the device is offline, or a retry or hold is scheduled | "3 changes waiting to sync"                                      |
    | Attention | Any item is `conflict`, `rejected` or stuck                           | A warning and "2 changes need attention"                         |
    | Paused    | The queue is paused, or the build differs from the server's           | "Saving paused. Log in to continue." or "Update to keep saving." |

    Attention outranks Paused, which outranks the others. Selecting the indicator opens the sync panel.

- **BR-P1-25** **The sync panel** is a side sheet with two groups: "Needs attention" (`conflict`, `rejected`, `blocked`, stuck) and "Waiting" (`pending`, `inflight`).
    - **Each row:** the item's `label`, the change ("Add", "Edit", "Delete", or the action's name, such as "Cancel Netflix"), when it was made, the reason for a refused item, and its request id under Details.
    - **Actions by status:**

        | Status                | Actions                                                                                                                                          |
        | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
        | `rejected`            | Retry; Edit (creates and edits only); Discard. A feature can replace Edit for one refusal code (F04's `budget_exists` opens the existing Budget) |
        | `conflict`            | Review, which opens the conflict view; Discard                                                                                                   |
        | Stuck                 | Retry now; Discard                                                                                                                               |
        | `blocked`             | none: it waits (BR-P1-19)                                                                                                                        |
        | `pending`, `inflight` | none                                                                                                                                             |

    - **Retry:** sets the item back to `pending`, with `attempts: 0` and `serverFailures: 0`, and starts the runner.
    - **Edit:** opens the entity's own dialog, filled from the item's body. Saving replaces the item's body and gives it a new idempotency key, keeping its `seq` so its place in the order holds. A rejected request committed nothing, and the server never stored an answer for its key (P2, BR-P2-18). The new key keeps it that way, since the body has changed.
    - **Discard:** removes the item and its blocked dependents, and says how many: "Discarded 3 changes." The screen then shows the confirmed data.
    - **Paused:** the panel says why: "Saving is paused because your session expired." with Log in, or "Saving is paused until you update Daybook." with Reload.
    - **The footer:** shows "Changes are stored on this device until they're saved." When storage is not persistent (BR-P1-28), it adds "Your browser may clear them if the device runs low on space."
- **BR-P1-26** **The conflict view** (D-137, OFF-7) is a dialog, shared by online saves and queued replays (F03, BR-F03-24).
    - **Content:** the user's version (the item's body over `before`) and the server's (`details.current`), side by side. Every field that differs is highlighted, labelled through the entity's field descriptor, which its feature spec defines.
    - **Keep mine:** sets the item's `baseVersion` to `details.current.version` and its `before` to `details.current`, invalidates the entity's queries so the pending effect is measured from the server's row, then resends the change under a new idempotency key. F05 keeps the original `changedAt` (F05, section 10).
    - **Keep theirs:** discards the item, with its blocked dependents, and refetches the entity.
    - **For a delete:** shows the server's current row, with "Delete anyway" (Keep mine) and "Keep it" (Keep theirs).
- **BR-P1-27** **Background Sync** (D-43). On Chromium the page registers the sync tag `daybook-queue` in four cases:
    - when an item is queued while offline;
    - when a held item is queued (BR-P1-16);
    - after a retryable failure;
    - at boot when the queue is not empty.

    - **Running:** the worker's `sync` event runs the same runner module under the same Web Lock. Its promise rejects when items remain after a retryable failure, so Chromium tries again later.
    - **A hold:** a hold is not a failure. When the run stops at a held item, the worker releases the lock, waits inside `waitUntil` until the effective hold ends (at most 5 seconds), and runs again. The event therefore ends only when the queue is paused, a failure or the build check stops it, or nothing sendable remains.
    - **Afterwards:** it posts `queue-changed` to open pages.
    - **`sync.background` off:** the page registers nothing (P4, BR-P4-10).
    - **Other browsers:** replay at the page triggers only (BR-P1-17).
- **BR-P1-28** **Persistent storage** (D-328). The first time an item is queued for a user, the app calls `navigator.storage.persist()` once and records the answer in `persistAsked`. It never asks again and shows no prompt of its own. The result only changes the sync panel's footer.
- **BR-P1-29** **Migrating items** (root 5.7, D-141). Before its first item, every runner, in a page or the worker, passes each item whose `schemaVersion` is older than its build's through the registered migrations in `client/queue/migrations.ts`, in order. A worker of a new build woken by Background Sync therefore migrates too. An item that cannot be migrated becomes `rejected`, with "This change was made in an older version of Daybook and can't be sent. Discard it or make it again." Edit is not offered for it. A migration never changes the body of an item whose `sentAt` is set, since the server may hold its answer under that body; such an item is sent as stored.
- **BR-P1-30** **The connections.** Every IndexedDB connection, in pages and the worker, closes itself on `versionchange`, so deleting a database at logout is never blocked.

**Boot, tabs, logout, session expiry and user switch**

- **BR-P1-31** **Boot** follows root 5.2, on every app start and every return online:
    1. **An unfinished logout:** a leftover `paused: logout`, or any copy of the logout marker. The app completes the logout before anything else, as BR-P1-33 says:
        - online, sign-out;
        - the wipe, which costs nothing when everything is already gone;
        - the marker, unless sign-out counted as done.

        It then shows the login screen and stops. A logout cut short by a closed tab or a crash therefore never leaves the old user's data readable.

    2. **Restore** the saved cache (BR-P1-10). Screens render from it with "as of".
    3. **`/api/me`:**
        - 401: the queue is paused, and the login screen opens;
        - a user other than `ownerUserId`: every store marked "Wiped" in section 3 is wiped, and the screens render again from the server;
        - the same user, with the queue paused for `unauthenticated`: it resumes;
        - its `buildId`: stored as `serverBuildId`; one other than the running build starts the update flow (BR-P1-36).
    4. **The queue signal:** recompute the cookie from the queue (BR-P1-23).
    5. **The queue:** run it; the runner migrates older items first (BR-P1-29).
    6. **Catch-up:** call `POST /api/sync/catch-up` (F05, BR-F05-06). While Subscription items still wait, it answers `skipped`. Whichever runner empties them, in any tab or the worker, then calls it: the worker through the tabs it messages, or itself when no tab is open.
    7. **Refresh:** invalidate the queries that replay or catch-up changed.
    8. **Housekeeping:** register Background Sync if the queue is not empty.
- **BR-P1-32** **Tabs.**
    - **Changes:** every change to the queue or to `settled` is announced on the `BroadcastChannel` `daybook-queue`, and by the worker's `queue-changed` message. Every tab then re-reads them, so indicators, overlays and the panel agree. Only the lock holder runs.
    - **Logout and user switch** (D-376): announced the same way, and the worker posts them to every client. Each tab then stops its persister, clears its in-memory query client and stores, closes its IndexedDB connections, and navigates to `/login`.
    - **The persister:** refuses to write when the owner in `meta` differs from its own, or while a logout marker exists, so a stale tab never writes the old user's data back.
- **BR-P1-33** **Logout** follows root 5.3 and F01, BR-F01-14 and BR-F01-15:
    - **Online:** the queue runs for up to 10 seconds.
    - **Items left:** "N changes have not been saved. Logging out deletes them." with Cancel and Delete and log out.
    - **Pausing first:** once logout is decided, `paused` becomes `logout`, so a runner in any tab or the worker stops before its next item. Nothing the user chose to delete is sent while the wipe waits. The wipe then waits at most for one inflight request (15 seconds).
    - **Sign-out:** online, the app calls sign-out before the wipe. It counts as done only when it answers as F01 says (BR-F01-15).
    - **The wipe:** it runs under the `daybook-queue` lock, so no runner writes back. It covers:
        - every store marked "Wiped" in section 3;
        - the in-memory query client;
        - the Zustand stores, which are reset.
    - **The marker** (D-367, D-384): written whenever sign-out was not done. That covers an offline logout, and an online one whose sign-out failed with a network error, a timeout, a 403, a 429 or a 5xx. The `httpOnly` session cookie may still be valid, so the server must revoke it.
        - **Before the wipe:** the `daybook_logout` cookie, with `Max-Age=691200` (8 days, longer than a session), and the local-storage copy are written before the wipe starts and before the logout is announced to other tabs (BR-P1-32). Any tab that then goes to `/login` already carries the cookie, and every persister already refuses to write.
        - **After the wipe:** the IndexedDB copy, since the wipe deletes that database.
    - **The next online page request:** carries that cookie, and RSC navigations count as page requests. `proxy.ts` sends it to `/api/session/expired?reason=logout`, which revokes the session, clears the cookies and opens `/login` (P2, BR-P2-29 and BR-P2-39). That happens before any page renders the old user's data, with or without a worker. The proxy never redirects `/login` itself, but a session cookie there redirects to `/dashboard`, which this rule then catches.
    - **Removing the marker:** only after the app's own sign-out call answers as F01 counts done: a 2xx, or a 400 or 401 meaning the session is already gone (BR-F01-15). The page then removes all three copies together, the cookie included. A missing cookie alone is never taken as proof, since browsers may drop cookies.
    - **Logging in or signing up while the marker exists:** Log in and Create account first call sign-out. When that counts as done, the marker is removed and the form continues. Otherwise nothing signs in or signs up, and the form shows "We couldn't finish logging out the last session. Try again in a moment." (F01). So a new session is never revoked by the old marker.
- **BR-P1-34** **Session expiry** (root 5.4, F01, BR-F01-13). A 401 from any Daybook API pauses the queue and keeps saved data readable. Logging back in as the same user resumes the queue. Logging in as another user wipes first (F01, BR-F01-11).
- **BR-P1-35** **The owner.** The queue and the saved cache each record their owner. Items whose `userId` differs from the signed-in user are never sent; they are wiped with the rest at a user switch.

**Updates (D-141, D-327)**

- **BR-P1-36** **Finding an update.** The app calls `registration.update()` in three cases:
    - at boot;
    - every 60 minutes while visible;
    - when `/api/me` reports a `buildId` other than the running one (P4).

    A worker that installs and waits shows the banner "Update available" with Reload.

- **BR-P1-37** **Build skew** (D-377, D-383). While `serverBuildId` differs from a runner's own build, newer or older, that runner sends nothing (BR-P1-17). When the stored id is stale, the server's 409 `build_mismatch` corrects it, having applied nothing. A page or worker on another build than the server therefore never replays items that were not migrated to the server's formats. The banner then reads "Update available. Reload to keep saving changes.", and the indicator shows Paused. A page on the server's build runs normally.
- **BR-P1-38** **Applying an update.**
    1. Reload waits up to 10 seconds for an inflight item to finish.
    2. It tells the waiting worker to activate, then reloads this tab when control changes.
    3. Other open tabs show "Daybook was updated. Reload this tab to continue." with Reload, instead of reloading on their own, so no unsaved form is lost.

    On the next start, queue items migrate (BR-P1-29), and the saved cache is discarded because its buster no longer matches (BR-P1-10). Saved pages are replaced as they load online.

**Offline states (D-142)**

- **BR-P1-39** Every online-only screen or action shows its offline state rather than failing silently, for example "You're offline. Reports need a connection." Each feature spec words its own. Buttons that need a connection are disabled with that text as their description. A cached logged-in page whose actions are online only, such as `/settings/billing`, opens from `pages` with those actions disabled (F12).
- **BR-P1-40** **Offline entry.** "Today", and the date window, come from the device clock in the profile time zone (F02, F03, section 10). The server checks again on replay.

## 5. Calculations

**Backoff** (D-324). After a retryable failure, the next attempt waits a random time between 0 and `min(300, 2 × 2^(attempts − 1))` seconds, which is "full jitter". A `Retry-After` header on a 429 or 503 sets the wait to the larger of the two.

| `attempts` after the failure | Longest wait      |
| ---------------------------- | ----------------- |
| 1                            | 2 s               |
| 2                            | 4 s               |
| 4                            | 16 s              |
| 8                            | 256 s             |
| 9 and more                   | 300 s (5 minutes) |

The `online` event and a tab becoming visible start the runner at once, without waiting for `nextAttemptAt`. They never shorten a hold (BR-P1-16).

**Golden** ([03-golden-dataset.md](../03-golden-dataset.md), pending row P1). The queue holds one item: P1, a create of the 300.00 Chai Point expense on 2 November.

- **The indicator:** "1 change waiting to sync" offline.
- **F03's header:** "+300.00 pending" beside Out and "+1 pending" beside Count (AC-F03-02).
- **F04:** November food shows "+300.00 pending" beside 8.4% (AC-F04-07).
- **F08:** November spending shows 18,420.00 with "+300.00 pending" (AC-F08-03).
- **After it syncs:** the item settles. Once the summary and dashboard queries complete a fetch started after its confirmation, Out reads 18,720.00 and the annotation disappears in the same render (golden invariant 5).
- **Replayed twice** (the first answer lost on the way back): one Transaction exists, and the second answer is the stored one (golden invariant 4; P2, BR-P2-18).

## 6. Screens and states

The screens are:

- **the sync indicator** (BR-P1-24);
- **the sync panel** (BR-P1-25);
- **the conflict view** (BR-P1-26);
- **the offline banner** (BR-P1-09);
- **the update banner** (BR-P1-36, BR-P1-37);
- **`/offline`**, which shows "You're offline, and this page isn't saved on this device." with Go to dashboard and Try again. While the local-storage logout mirror exists, it shows "You are offline. Connect to log in." instead.

| State            | What the user sees                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading          | Restoring the saved cache shows each screen's skeleton, never an empty state                                                                                                                          |
| Empty            | The sync panel with nothing queued: "All changes saved."                                                                                                                                              |
| Error            | IndexedDB unavailable, as in some private windows: "This browser can't store data offline, so changes need a connection." Writes then go straight to the server and wait for the answer, as before M5 |
| Offline          | The offline banner, "as of" on every screen, and queued writes                                                                                                                                        |
| Pending          | The indicator's count, and each feature's pending display                                                                                                                                             |
| Locked (Premium) | n/a                                                                                                                                                                                                   |
| Read-only        | Online-only actions while offline (BR-P1-39)                                                                                                                                                          |

## 7. Flows

**7.1 Add offline, then sync (golden P1)**

1. Offline, the user adds the 300.00 Chai Point expense. The item is queued, the row joins "Waiting to sync", and the header shows "+300.00 pending".
2. The indicator reads "1 change waiting to sync".
3. The network returns. The runner sends the item, the server answers 201, and the item settles.
4. The summary refetches. Out reads 18,720.00, the annotation disappears, and the indicator shows the check.

**7.2 A conflict**

1. The phone edits a Budget offline, against version 3.
2. The laptop changes the same Budget online, making version 4.
3. The phone replays and gets 409 with version 4. The item becomes `conflict`, and the indicator shows "1 change needs attention".
4. Review opens the conflict view. Keep mine stores version 4 and resends with `If-Match: 4`.

**7.3 A dependent item**

1. Offline, a Free user with 3 active Goals creates Wedding, then contributes 2,000.00 to it.
2. On replay, the Goal is refused with `premium_required` and becomes `rejected`. The contribution becomes `blocked`.
3. The user archives another Goal on the laptop, then selects Retry on Wedding. Wedding is created, and the contribution follows.
4. Had they discarded Wedding, the panel would say "Discarded 2 changes."

**7.4 Delete with Undo**

1. Online, the user deletes a row. The delete is queued with a 5-second hold, and the row hides.
2. They switch tabs and back within the 5 seconds. Nothing is sent.
3. They press Undo. The item, still unsent, is removed, and the row returns. Had they waited, the delete would have been sent when the hold ended.

**7.5 Delete a queued create**

1. Offline, the user adds an expense and deletes it.
2. When the delete's hold ends, the create has never been sent, so both disappear with no request.
3. Had the create already gone out once with its answer lost, the delete would be sent after it, with version 1.

**7.6 Close the tab offline (Chromium)**

1. The user queues two changes offline and closes the tab.
2. The connection returns, and Background Sync wakes the worker, which sends both under the Web Lock.
3. The next time a tab opens, it reads an empty queue.

**7.7 Navigate, then go offline.** Online, the user goes from Dashboard to Transactions to Budgets by links; each first visit warms its document. Offline, a link back to Budgets fails as a client navigation, falls back to a page load, and the worker serves the warmed document.

**7.8 Log out offline on a shared device**

1. The modal warns about 2 unsaved changes, and the user confirms.
2. Every store is wiped, and the marker is written, including its cookie.
3. The next visitor sees only "You are offline. Connect to log in."
4. Online, the first page request is redirected to revoke the session, before any page renders (BR-P1-33).

**7.9 A Subscription change waits while a page loads.** A queued Netflix price change sets the queue cookie. The user reloads the dashboard. The server render carries the cookie, so lazy catch-up is skipped (P2, BR-P2-14). The runner then sends the change, and the boot endpoint runs catch-up with the new price in force.

## 8. Validation and messages

| Situation                                                      | Message shown                                                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Offline banner                                                 | You're offline. Showing what was saved on this device.                                              |
| "As of"                                                        | as of 14:05 / as of 12 Oct, 14:05                                                                   |
| Indicator: saved                                               | All changes saved                                                                                   |
| Indicator: saving                                              | Saving 3 changes…                                                                                   |
| Indicator: waiting                                             | 3 changes waiting to sync                                                                           |
| Indicator: attention                                           | 2 changes need attention                                                                            |
| Indicator: paused                                              | Saving paused. Log in to continue. / Update to keep saving.                                         |
| Refused item                                                   | Not saved: <the feature's message>                                                                  |
| Blocked item                                                   | Waiting for an earlier change to Vacation.                                                          |
| Stuck item                                                     | The server keeps failing on this change.                                                            |
| Discard                                                        | Discarded 3 changes.                                                                                |
| Cancelled create with dependents                               | Removed 2 changes that depended on it.                                                              |
| Panel, paused for the session                                  | Saving is paused because your session expired.                                                      |
| Panel, paused for an update                                    | Saving is paused until you update Daybook.                                                          |
| Panel footer                                                   | Changes are stored on this device until they're saved.                                              |
| Panel footer, not persistent                                   | Your browser may clear them if the device runs low on space.                                        |
| Storage full                                                   | This device is out of storage. Free some space and try again.                                       |
| `offline.writes` off                                           | Offline changes are paused. Reconnect to save.                                                      |
| Old item                                                       | This change was made in an older version of Daybook and can't be sent. Discard it or make it again. |
| No IndexedDB                                                   | This browser can't store data offline, so changes need a connection.                                |
| Update                                                         | Update available                                                                                    |
| Update with the queue paused                                   | Update available. Reload to keep saving changes.                                                    |
| Updated in another tab                                         | Daybook was updated. Reload this tab to continue.                                                   |
| Logout with items                                              | N changes have not been saved. Logging out deletes them.                                            |
| `/offline`                                                     | You're offline, and this page isn't saved on this device.                                           |
| `/offline`, after offline logout                               | You are offline. Connect to log in.                                                                 |
| Log in or Create account while the last sign-out keeps failing | We couldn't finish logging out the last session. Try again in a moment.                             |
| Install                                                        | Install app                                                                                         |

## 9. Plan gating

None by plan. Two client-enforced flags (P4, BR-P4-10):

- **`offline.writes`:** off stops new offline writes (BR-P1-14);
- **`sync.background`:** off stops Background Sync registration (BR-P1-27).

Neither affects online writes or items already queued.

## 10. Offline behavior

This spec defines it. Each feature spec's section 10 lists what that feature keeps readable, what it queues, and its refusal messages.

## 11. Server surface

P1 adds no endpoint. It relies on:

- P2's idempotency (with the stored-answer lookup before the profile, capability and body checks), versions and error envelope (BR-P2-17 to BR-P2-21);
- the catch-up skip on the header or the cookie (BR-P2-14);
- the `Daybook-Build` check and 409 `build_mismatch` (BR-P2-17, step 5);
- the logout cookie in `proxy.ts` and the session-expired route (BR-P2-29, BR-P2-39);
- F05's boot endpoint;
- P4's `/api/me` and `buildId`.

**Client modules**

- `client/queue`: `enqueue`, the runner, holds, merging, outcomes, settling, `usePendingFor`, migrations, and the queue signal.
- `client/persist`: the IndexedDB persister and the family rules.
- `client/sync-ui`: the indicator, the panel and the conflict view.
- `client/boot`: root 5.2.
- `client/wipe`: logout and user switch.
- `client/sw-bridge`: registration, updates, page warming, Background Sync and messages.
- `app/sw.ts` and `app/serwist/[path]/route.ts`: the worker.

The runner module is shared by the page and the worker.

## 12. Cross-feature effects

- **F03 to F06:** queue every write through `enqueue`, render pending items through `usePendingFor`, and supply field descriptors for the conflict view. F03's delete uses a hold; F04 replaces Edit for `budget_exists`; F06's queued Goal deletes follow BR-P1-15.
- **F05:** the queue signal guards catch-up; Subscription items keep their dialog's deletion count.
- **F07 to F09, F12:** become readable offline through the saved cache and the page cache.
- **F01:** logout, session expiry and user switch call this spec's wipe and pause; the logout marker gains its cookie.
- **F02:** the device-clock date for offline entry; the theme survives wipes.
- **P2:** treats the queue cookie like the header; looks up stored idempotent answers early; handles the logout cookie; `proxy.ts` skips `/serwist/*`.
- **P4:** flags `offline.writes` and `sync.background`; `buildId` starts an update check and pauses the queue.
- **F14 (M7):** Learn pages and Sanity images join the worker's caches.
- **P3:** measures performance on production builds with the worker active.

## 13. Edge cases

- **Two tabs enqueue at once:** IndexedDB transactions give each item its own `seq`. The runner sends them in that order.
- **The answer is lost after the server applied a change:** the retry sends the same idempotency key. The server returns the stored answer, even if a flag or capability would now refuse the request (P2, BR-P2-18). A replay from an older build first gets `build_mismatch`, and gets its answer once updated.
- **The browser crashed with an item inflight:** the next lock holder returns it to `pending`. Its `sentAt` keeps it from merging, and the retry gets the stored answer if the server had committed.
- **A queued Subscription change reprices a charge that a later queued edit also changes:** the edit meets a conflict, as F05 accepts (root OFF-5), and the conflict view resolves it.
- **A stuck item:** it still holds back every later item, since order is strict. Discard, or Retry now once the server is fixed, releases them.
- **The device clock is wrong:** offline dates follow the device clock. The server checks windows on replay and refuses out-of-window dates, which the panel offers to edit.
- **Storage is cleared by the browser:** queued items are lost. Without persistent storage the panel footer warns of it. Safari also removes a site's stored data after 7 days without use, unless the app is installed.
- **A private window without IndexedDB:** the No IndexedDB state; writes go straight to the server.
- **The session expires mid-run:** the item that got 401 returns to `pending`, and the queue resumes after login.
- **A deploy changes a request format while items wait:** the old page pauses the queue (BR-P1-37). After Reload the item migrates, or is rejected with the old-version message.
- **A deploy happens while the tab is closed:** Background Sync wakes the old worker, whose `serverBuildId` still matches it. Its first request gets 409 `build_mismatch`, so it stores the new build id and stops, with nothing applied. The next page on the new build migrates and sends the items.
- **Sign-out fails during an online logout:** the device is wiped as usual, and the marker is written as if offline. The next page request revokes the session (BR-P1-33).
- **A queued delete of a Subscription charge:** it carries F03's hint. When the charge is already gone, the server writes the tombstone and answers 204 (F03, BR-F03-17).
- **Background Sync fires while a tab is running the queue:** the Web Lock makes the worker wait, then it finds nothing to send.
- **The `daybook_queue` cookie is left behind:** the next app start recomputes it, and it expires after 90 days.

## 14. Acceptance criteria

- **AC-P1-01** (unit) Merging:
    - a Transaction create and a later edit, while `sentAt` is `null`, become one create;
    - offline, a create and a later held delete vanish with every item for the entity and its dependents once the hold ends, and coming back online sends nothing for them;
    - online, a held delete of an unsent create stops the run at the create; with no other trigger, the timer fires when the hold ends, both vanish, and an unrelated item behind them is then sent;
    - a Goal delete without a hold, queued while the runner is sending earlier items, cancels its unsent create, and no request for that Goal is made;
    - a create with `sentAt` set keeps a later edit as its own item, sent with `If-Match: 1`;
    - Budget, Subscription and Goal items never merge.
- **AC-P1-02** (unit) Outcomes: every row of BR-P1-18's table sets the item and queue states it lists, and a retryable failure stops the run before any later item.
- **AC-P1-03** (unit) Versions:
    - two queued edits of one Goal send `If-Match` 3, then the version the first returned;
    - a second edit rejected for another reason and retried after the first settled sends the newer version;
    - Keep mine after a 409 at version 4 sends `If-Match: 4`;
    - none of these is a conflict.
- **AC-P1-04** (unit) Blocking: an item that depends on a rejected create, or follows a conflicting item for the same entity, is `blocked`. Retry or Discard of the first item releases or removes it.
- **AC-P1-05** (unit) Backoff waits stay within section 5's bounds, and a `Retry-After` of 30 seconds is honoured.
- **AC-P1-06** (client integration, MSW) Golden P1: offline, the item is queued with the indicator at 1. Online, it is sent once, and Out becomes 18,720.00 after the refetch. From the frame in which the item settles, no frame shows both the pending annotation and the new total, or neither (BR-P1-22 allows an overlap only while it is inflight).
- **AC-P1-07** (client integration) A lost answer: the server applies the create, and the network drops the answer. The retry receives the stored answer, also after the capability that allowed it was removed. Exactly one row exists (golden invariant 4).
- **AC-P1-08** (client integration) Two tabs: only one runs the queue at a time. An item queued in one tab appears in the other's indicator, and a settling overlay stays in both until their queries refetch.
- **AC-P1-09** (client integration) While a Subscription item is pending:
    - API requests carry `Daybook-Queue: pending`;
    - the `daybook_queue` cookie is set with `SameSite=Lax`;
    - once the item is confirmed, both are gone, and a stale cookie is cleared at the next boot before catch-up.
- **AC-P1-10** (integration) A document request carrying only the cookie runs no lazy catch-up (P2, BR-P2-14).
- **AC-P1-11** (client integration) The saved cache keeps exactly BR-P1-11's families, with infinite queries trimmed to 2 pages. A different buster or owner discards it.
- **AC-P1-12** (E2E, production build) Offline:
    - a reload of the dashboard shows the saved current month with "as of";
    - a page reached earlier by client navigation opens from its warmed document;
    - the first page of a fresh visit, reloaded offline once the worker controls it, opens and responds to input, with its scripts served from `static`;
    - a page never opened shows `/offline`.
- **AC-P1-13** (E2E, production build, Chromium) Background Sync, dispatched through CDP's `ServiceWorker.dispatchSyncEvent`:
    - two changes queued offline, then the tab closed: the event sends both;
    - a Transaction delete queued online with its 5-second hold, then the tab closed at once: the event sends it after the hold, not before.
- **AC-P1-14** (E2E) Logout:
    - online with a queued item, it warns, then wipes the IndexedDB databases, the page cache, the cookies and the layout copy, and keeps the theme;
    - a second open tab goes to `/login` and writes nothing back;
    - offline, it writes the marker and its 8-day cookie. After a browser restart, the next online visit to `/dashboard`, with the worker unregistered, ends on `/login` with the session revoked;
    - the same visit arriving from a link on another site does too, with no redirect loop;
    - signing in again afterwards needs one login, not two;
    - online with sign-out failing (mocked 503), it still wipes and writes the marker, and the next page request revokes the session;
    - a second open tab during that logout lands on `/login` with the session revoked, never on a page with the old data;
    - while sign-out keeps failing, Log in and Create account show "We couldn't finish logging out the last session. Try again in a moment." and create no session;
    - a logout interrupted by closing the tab after Delete and log out is completed at the next start, before any saved data is shown;
    - a queued item that is not yet inflight when Delete and log out is chosen is never sent.
- **AC-P1-15** (E2E, production build) A new build shows "Update available" and pauses the queue. Reload waits for an inflight item, then reloads. Another tab shows the "updated in another tab" banner.
- **AC-P1-16** (unit) Queue migration: an item of schema version 1 runs through a version 2 migration. An item that cannot migrate becomes rejected with the old-version message.
- **AC-P1-17** (accessibility) The indicator, sync panel and conflict view pass axe with no serious or critical violations. Indicator state changes are announced through a polite live region.
- **AC-P1-18** (E2E, production build) No `/api/*` or RSC response is stored in any cache after a session of browsing.
- **AC-P1-19** (client integration) Undo:
    - a delete with a 5-second hold is not sent when the tab becomes visible or the `online` event fires;
    - Undo within the hold removes it with no request;
    - an item marked inflight can no longer be undone.
- **AC-P1-20** (unit) Crash recovery: an `inflight` item becomes `pending` when the lock is taken, with `sentAt` kept, and a later edit of that create is queued separately.
- **AC-P1-21** (client integration) A device that fills its storage refuses the write with the storage message. With `offline.writes` off, an offline save is refused with its message. Without IndexedDB, a save goes straight to the server.
- **AC-P1-22** (client integration) An item failing with 500 five times shows as stuck under "Needs attention", and Retry now sends it at once.
- **AC-P1-23** (E2E, production build) The offline conflict journey (root TST-4) and installing from a production build at localhost both pass.
- **AC-P1-24** (unit) `before`:
    - with amount 100, a queued edit to 150 and then one to 200 annotate +50 and +50, a total of +100, and a delete queued after them subtracts 200;
    - with the edit to 150 settled and the device offline before the refetch, a second edit to 200 has `before` 150, and the figure shows 200;
    - after Keep mine against a server row of 120, `before` is 120.
- **AC-P1-25** (client integration) A rejected item shows "Not saved" with its reason on its row and in the sync panel, with Retry, Edit and Discard.
- **AC-P1-26** (client integration) Settling offline: an edit settles, and the device goes offline before the summary refetches. A summary figure mounted 15 minutes later, from the persisted cache, still shows the change. The item leaves `settled` once that query has data fetched after the change.
- **AC-P1-27** (integration) A queued request whose `Daybook-Build` differs from `BUILD_ID` gets 409 `build_mismatch` with the server's build in `details.buildId`, commits nothing and stores no idempotent answer. The runner keeps the item `pending`, with `attempts` unchanged and `sentAt` back to `null` for a first attempt, stores that build id, and shows Paused. After the update, the item migrates and is sent once.

## 15. Illustrations

Illustrative, the golden P1 item:

```json
{
	"id": "0192f9c1-7a2b-7c00-8000-000000000001",
	"seq": 41,
	"userId": "0192f0c4-...",
	"schemaVersion": 1,
	"entityType": "transaction",
	"entityId": "0192f9c0-...",
	"kind": "create",
	"method": "POST",
	"path": "/api/transactions",
	"body": {
		"id": "0192f9c0-...",
		"type": "expense",
		"amountMinor": 30000,
		"currency": "INR",
		"occurredAt": "2026-11-02T06:10:00Z",
		"occurredOn": "2026-11-02",
		"createdAt": "2026-11-02T06:10:00Z",
		"category": "food",
		"payee": "Chai Point"
	},
	"before": null,
	"idempotencyKey": "0192f9c1-7a2b-7c00-8000-000000000002",
	"baseVersion": null,
	"dependsOn": [],
	"status": "pending",
	"holdUntil": null,
	"sentAt": null,
	"attempts": 0,
	"nextAttemptAt": null,
	"serverFailures": 0,
	"error": null,
	"deletionCount": 0,
	"label": "Transaction · Chai Point · −₹300.00",
	"createdAt": "2026-11-02T06:10:00Z"
}
```

Illustrative, the worker's runtime rules:

```ts
const serwist = new Serwist({
	precacheEntries: self.__SW_MANIFEST,
	skipWaiting: false,
	clientsClaim: true,
	navigationPreload: true,
	runtimeCaching: [
		{
			matcher: isImage,
			handler: new CacheFirst({
				cacheName: "images",
				plugins: [ok200Only, expiry(300, days(30))],
			}),
		}, // before the cross-origin rule, for Sanity
		{ matcher: isNeverCached, handler: new NetworkOnly() }, // RSC, prefetch, /api, auth pages, print, other cross-origin
		{
			matcher: isCachedDocument,
			handler: new NetworkFirst({
				cacheName: "pages",
				networkTimeoutSeconds: 3,
				plugins: [ok200Only, expiry(50, days(7))],
			}),
		},
		{
			matcher: isNextStatic,
			handler: new CacheFirst({
				cacheName: "static",
				plugins: [expiry(500, days(30))],
			}),
		},
	],
	fallbacks: {
		entries: [
			{
				url: "/offline",
				matcher: ({ request }) => request.destination === "document",
			},
		],
	},
});
```
