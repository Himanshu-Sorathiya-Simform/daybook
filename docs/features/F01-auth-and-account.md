# F01 Auth and account

16 Oct 2026 · @Himanshu

People create a Daybook account with an email and password, log in and out on any device, and manage their account. Managing means: seeing and revoking sessions, changing their password, resetting their finance data, and deleting the account. Logging out works correctly even offline. There is no email verification and no reset-by-email; a developer script resets a forgotten password.

| Item       | Value                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M0 (auth core), M1 (account settings)                                                                                                                                                                         |
| Plan       | Free and Premium; export of all Transactions is Stretch (`account.export`)                                                                                                                                    |
| Depends on | [P2](../platform/P2-data-access-and-security.md), [P4](../platform/P4-capabilities.md); F02 (onboarding and display name), F12 (Stripe Customer), F14 (posts on the landing page), P1 (cache and queue wipes) |
| Decisions  | D-10, D-11, D-140, D-147 to D-153, D-182, D-184, D-186 to D-191, D-202, D-367, D-378, D-384, D-385, D-433                                                                                                     |

## 1. User stories

- As a visitor, I want a simple front page with Log in and Sign up, so that I know what Daybook is and how to start.
- As a new user, I want to sign up with an email, a password and my name, and land straight in setup.
- As a returning user, I want to log in and continue where I left off, including after my session expired.
- As a user on a shared device, I want logging out to really end my session, even when I log out offline.
- As a user, I want to see where I am logged in and sign out other devices.
- As a user, I want to change my password and optionally sign out everywhere else.
- As a user, I want to wipe my finance data and start again (for example, to change my currency) without losing my account.
- As a user, I want to delete my account and everything in it, including stopping Premium billing.
- As the developer, I want to reset a user's forgotten password from the terminal.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                             | Stretch (M8)                                         | Out                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Landing page `/`; sign-up; login with `next`; logout online and offline (logout-pending marker); session expiry handling; active sessions list and revoke; change password; display-name updates for F02; reset my data; delete account; developer password-reset script; offline states for every auth screen | Export of all Transactions as CSV (`account.export`) | Email verification; password reset by email; two-factor; passkeys; social login; changing email (D-189); a "remember me" choice (sessions always last 7 days) |

## 3. Concepts and fields

**Better Auth records** (schema `auth`; read and written only through Better Auth or the auth pool)

| Record  | Fields used by Daybook                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| User    | `id`, `email` (unique), `name` (display name), `createdAt`                                                                           |
| Session | `id`, `token` (the cookie value), `userId`, `expiresAt`, `createdAt`, `updatedAt` (moves at most once a day; BR-F01-17), `userAgent` |
| Account | The credential: the password hash, by Better Auth's default algorithm                                                                |

**Form fields**

| Field                     | Meaning           | Required                           | Rules                                                                                   | Example            |
| ------------------------- | ----------------- | ---------------------------------- | --------------------------------------------------------------------------------------- | ------------------ |
| Email                     | Login identifier  | Yes                                | Trimmed and lowercased on the server (BR-F01-01); valid address; at most 254 characters | `asha@example.com` |
| Password                  | Secret            | Yes                                | 12 to 128 characters; not found in a known breach (BR-F01-03); paste allowed            |                    |
| Display name              | Shown in the app  | Sign-up                            | 1 to 50 characters after trimming and NFC normalization (INP)                           | `Asha`             |
| Current password          | Re-authentication | Change password, delete account    | Must match                                                                              |                    |
| New password              | Replacement       | Change password                    | Password rules; must differ from the current one                                        |                    |
| Sign out of other devices | Option            | Change password                    | Checkbox, checked by default                                                            |                    |
| Confirmation text         | Typed guard       | Reset (`RESET`), delete (`DELETE`) | Exact, uppercase; checked in the browser and, for reset, on the server                  | `DELETE`           |

**Logout-pending marker** (D-140, D-367). `{ "at": "<ISO UTC>" }` stored in IndexedDB (database `daybook`, store `meta`, key `logoutPending`), so the service worker can read it. It is mirrored in local storage under `daybook.logoutPending` for a synchronous check at boot, and in the cookie `daybook_logout=1` (`Path=/`, `SameSite=Lax`, `Max-Age=691200`, 8 days, longer than a session), so the server can act on the next page request. It holds no user data.

## 4. Business rules

**Better Auth hooks.** One `before` hook does the allow-list (P2, BR-P2-40) and the checks below. Its rejections use Better Auth's error shape, with the codes named here.

- **BR-F01-01** On `/sign-up/email` and `/sign-in/email`, the hook trims and lowercases `email` before Better Auth sees it, so `Asha@Example.com ` and `asha@example.com` are one account. On `/sign-up/email` and `/update-user` it trims `name`, normalizes it to NFC, and rejects it unless it is 1 to 50 characters with no control characters (code `INVALID_NAME`).
- **BR-F01-02** `/update-user` accepts only `name`. Any other field is rejected (code `FIELD_NOT_ALLOWED`). F02 uses it to change the display name.
- **BR-F01-03** On `/sign-up/email` and `/change-password`, the hook checks the password against Have I Been Pwned's range API:
    - it sends the first 5 hex characters of the password's SHA-1 hash, with the `Add-Padding` header;
    - it compares the returned suffixes locally;
    - a match is rejected with code `PASSWORD_BREACHED`.

    If the API does not answer within 3 seconds or returns an error, the password is allowed and Sentry gets a warning (D-188). Better Auth's own minimum and maximum lengths (12 and 128) apply as well.

**Sign-up**

- **BR-F01-04** A strength meter (zxcvbn-ts) shows Weak, Fair, Good or Strong as the user types. It is advisory and never blocks submission (D-186).
- **BR-F01-05** An email that already has an account gets "An account with this email already exists. Log in instead." (D-187).
- **BR-F01-06** A successful sign-up signs the user in and opens `/onboarding` (F02).

**Login**

- **BR-F01-07** A wrong email or a wrong password gives one message, "Email or password is incorrect.", whichever was wrong.
- **BR-F01-08** Better Auth's rate limiter allows 3 email sign-in attempts per 10 seconds, then answers 429 (D-153).
- **BR-F01-09** `next` is resolved with `new URL(next, APP_ORIGIN)`. It is used only if the result has the same origin as `APP_ORIGIN` and the raw value starts with `/` and contains no backslash. Otherwise it is ignored. After login, the user goes to `next`, else `/dashboard`, or `/onboarding` if they have no profile.
- **BR-F01-10** A logged-in user who opens `/login` or `/signup` is sent to `/dashboard` (P2, BR-P2-29).
- **BR-F01-11** When a persisted cache exists, the login form knows its owner's email from the persisted `/api/me`. If the typed email, trimmed and lowercased, differs from it, and that user's queue still holds items, the form warns before signing in: "Changes from another account are waiting on this device. Logging in as someone else deletes them." with Continue and Cancel.
    - **Cancel:** does not sign in.
    - **Continue:** signs in; once sign-in succeeds, every cache and the queue are wiped before anything renders.
    - **Different owner, empty queue:** the wipe happens without a warning.

**Sessions**

- **BR-F01-12** Sessions last 7 days and extend by use once a day (D-151). Cookies follow P2, BR-P2-39. The extension happens in the app's session check, `GET /api/auth/get-session` at start and when the app regains focus, because only that response renews the cookie; the route wrapper and `readAsUser` read the session without extending it (P2, D-433).
- **BR-F01-13** A 401 from any Daybook API (P2 wrapper) does five things:
    - pauses the queue;
    - keeps cached data readable;
    - shows the banner "Your session has expired. Log in to keep saving changes." with Log in, which opens `/login?next=<current path>&expired=1` (the proxy always lets `expired=1` through);
    - after logging back in as the same user, resumes the queue;
    - after logging in as a different user, applies BR-F01-11.

    A 401 from `/api/auth/*` (for example a wrong password) never triggers this.

**Logout**

- **BR-F01-14** Logout follows root spec 5.3:
    - when online, replay waiting items first;
    - warn before discarding queued items;
    - wipe caches, queue, stores and layout cache;
    - keep the theme.
- **BR-F01-15** A logout whose sign-out did not count as done writes the marker: every offline logout, and an online one whose sign-out failed (a network error, a timeout, 403, 429 or 5xx) (P1, BR-P1-33). While the marker exists, the app shows only the login screen and the service worker serves no cached private page.
    - **The first online page request:** carries the `daybook_logout` cookie. `proxy.ts` redirects it to `/api/session/expired?reason=logout`, which revokes the session, clears the cookies, and opens `/login` before any page renders (P2, BR-P2-29 and BR-P2-39; P1, BR-P1-33).
    - **At the next start with a connection:** the app calls sign-out before anything else.
    - **Removing the marker:** a 2xx, or a 400 or 401 that means the session is already gone, counts as done. All three copies, the cookie included, are then removed together. A missing cookie alone never counts as done (P1, BR-P1-33).
    - **Any other answer** (403, 429, 5xx, a network error): the marker stays, and sign-out is retried at the next start or `online` event.
    - **Login or sign-up while the marker exists:** Log in and Create account first call sign-out. When that counts as done, the marker is removed and the form continues. Otherwise nothing signs in or signs up, and the form shows "We couldn't finish logging out the last session. Try again in a moment." So the old marker never revokes a new session.

**Sessions list**

- **BR-F01-16** Settings → Security lists every active session. Each row shows:
    - the browser and operating system, parsed from the user agent;
    - the created date;
    - last activity;
    - a "This device" badge on the current session.
- **BR-F01-17** Last activity has day precision ("Active today", "Active 3 days ago"), because Better Auth refreshes `updatedAt` at most once a day.
- **BR-F01-18** Each other session has Sign out. "Sign out all other devices" revokes every session except the current one. Revoking the current session is a logout (BR-F01-14).

**Change password**

- **BR-F01-19** Changing the password requires the current password and a new password, entered once with a show/hide toggle. The new password follows the password rules and differs from the current one. "Sign out of other devices", checked by default, sends `revokeOtherSessions: true`.

**Reset my data (D-191)**

- **BR-F01-20** Reset deletes every Transaction, Budget, Subscription (with its tombstones), Goal and dismissed insight, in one write transaction. That transaction first locks the profile row with `SELECT ... FOR UPDATE` (SRV-7, D-213), so no catch-up run or demo load can interleave. It keeps:
    - the account and profile;
    - the dashboard layout;
    - the portfolio;
    - Premium;
    - idempotency records, so old queued requests cannot recreate deleted rows.
- **BR-F01-21** Reset needs a connection, typing `RESET` (checked in the browser and on the server), and an empty queue on this device. While items are waiting, the button is disabled with "Sync or discard 3 waiting changes first."
- **BR-F01-22** After reset, the currency is editable again (MON-3), every query is invalidated, and the dashboard shows its onboarding panel.

**Delete account (D-184, D-190)**

- **BR-F01-23** Deletion uses Better Auth's delete-user. Better Auth would also accept a fresh session without a password, so the `before` hook rejects any `/delete-user` request without `password` (code `PASSWORD_REQUIRED`). The dialog also requires typing `DELETE`, checked in the browser, and a connection. It states what will happen:
    - every Transaction, Budget, Subscription, Goal and setting is deleted permanently;
    - Premium, if active, stops immediately with no refund.
- **BR-F01-24** Better Auth's before-delete hook runs before the user row is removed:
    1. Call `deleteBillingCustomer(userId)` (F12, BR-F12-26), for every user. Under the billing lock it marks the account as closing, deletes the user's Stripe Customer if there is one, and clears entitlements and the plan's billing fields. Stripe cancels the Customer's subscriptions immediately. A "no such customer" answer counts as success, so a retry after a partial failure works.
    2. If step 1 failed, because the lock wait passed 10 seconds or Stripe could not be reached, throw an error with status 503 and code `BILLING_UNAVAILABLE`. Step 1 rolled back, so the deletion is aborted and nothing changed.

    Better Auth then deletes the user; sessions, accounts and every private row cascade (P2, 7.6).

- **BR-F01-25** After a successful deletion, the client wipes everything as on logout, without a marker. It then navigates to `/api/session/expired?next=/&reason=deleted`, which clears the cookies and opens `/?deleted=1`. The landing page shows "Your account was deleted."
- **BR-F01-26** A later Stripe webhook for the deleted customer finds no user and is ignored (F12).

**Landing page (D-182)**

- **BR-F01-27** The page at `/` validates the session itself; the proxy never redirects `/`.
    - **Valid session:** `/dashboard`, or `/onboarding` if there is no profile.
    - **Otherwise:** the landing page, with three parts:
        - the name Daybook and the line "Your money, day by day. Budgets, Subscriptions, Goals and a dashboard that stays correct offline.";
        - Log in and Sign up;
        - the 3 latest public Learn posts (F14), read in their own Suspense boundary, so the rest of the page never waits on Sanity. The page exports `fetchCache = 'force-no-store'` and renders `<SanityLive action="refresh" />` (F14, BR-F14-01 and BR-F14-02). If Sanity cannot be reached, that section is not rendered.

**Developer password reset**

- **BR-F01-28** `npm run auth:reset-password -- <email>` has four steps:
    1. Ask for a new password in the terminal, with input hidden, and apply the password rules.
    2. Hash it with Better Auth's own hasher and update the credential through Better Auth's internal adapter (`auth.$context`).
    3. Delete every session of that user through the auth pool.
    4. Print "Password reset for <email>. All sessions were signed out."
- **BR-F01-29** The login screen's "Forgot your password?" link opens a short note: "Password reset by email is not available in this demo. Ask the developer to reset it."

**Export (Stretch)**

- **BR-F01-30** With `account.export` on, Settings → Data offers "Export all Transactions (CSV)". It downloads every confirmed Transaction in F11's transactions CSV format, named `daybook-transactions-YYYY-MM-DD.csv`.

## 5. Calculations

None.

## 6. Screens and states

**`/` landing (logged out).** Name, line, Log in, Sign up, latest posts. With `deleted=1`, a notice: "Your account was deleted."

**`/signup`.** Email, password with strength meter and show/hide toggle, display name, Create account, and a link "Already have an account? Log in".

**`/login`.** Email, password with show/hide toggle, Log in, "Forgot your password?", and a link "New here? Create an account". With `expired=1`, a note above the form: "Your session has expired. Log in to continue."

**Logout confirmation (only when items are still waiting after any replay attempt).** Title "3 changes have not been saved". Body "Logging out deletes them." Buttons: Cancel, Delete and log out. The same dialog serves online and offline logout (root 5.3).

**Settings → Security.** Change password form; Active sessions list.

**Settings → Data.** This spec owns Reset my data, Delete account and Export (Stretch). Load and remove demo data belong to F15.

| State            | Landing                                                                                           | Sign-up and login                            | Security                                   | Data                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------ | --------------------------------------------------------- |
| Loading          | Posts section shows skeleton cards                                                                | Submit shows a spinner; the form is disabled | Sessions list skeleton                     | n/a                                                       |
| Empty            | No posts: section not rendered                                                                    | n/a                                          | Only "This device"                         | n/a                                                       |
| Error            | Posts unreachable: not rendered                                                                   | Field and form messages (section 8)          | "Sessions could not be loaded." with Retry | Action-specific messages (section 8)                      |
| Offline          | Shown from cache; Log in and Sign up lead to forms that say "You are offline. Connect to log in." | Form disabled with that line                 | "Connect to manage security."              | Reset and Delete disabled: "Connect to change your data." |
| Pending          | n/a                                                                                               | n/a                                          | n/a                                        | Reset disabled while items wait (BR-F01-21)               |
| Locked (Premium) | n/a                                                                                               | n/a                                          | n/a                                        | n/a                                                       |
| Read-only        | n/a                                                                                               | n/a                                          | n/a                                        | n/a                                                       |

## 7. Flows

**7.1 Sign-up**

1. The visitor fills the form; the strength meter updates as they type.
2. Create account calls Better Auth's email sign-up.
3. **`PASSWORD_BREACHED`:** "This password has appeared in a data breach. Choose a different one." The form keeps everything except the password.
4. **Email taken:** BR-F01-05; the email field links to Log in.
5. **`INVALID_NAME`:** the display-name message from section 8.
6. **Success:** the session is created; the user lands on `/onboarding`.

**7.2 Login**

1. The user submits email and password; BR-F01-11 runs first if another account's items are waiting.
2. **Wrong credentials:** BR-F01-07. **Rate limited:** "Too many attempts. Wait a few seconds and try again."
3. **Success:** wipe if the cache belongs to someone else, then go to the destination (BR-F01-09).
4. A paused queue of the same user resumes, and the boot sequence runs (root 5.2).

**7.3 Logout, online**

1. The user chooses Log out.
2. If items wait, the app replays them for up to 10 seconds.
3. Still waiting: the confirmation dialog. Cancel stops here.
4. Sign-out is called; the app wipes and opens `/login`. If sign-out did not count as done, the marker is written as in 7.4: its cookie and local-storage copies before the wipe, its IndexedDB copy after (BR-F01-15; P1, BR-P1-33).

**7.4 Logout, offline**

1. The user chooses Log out; if items wait, the confirmation dialog shows without the replay attempt.
2. The app wipes, writes the marker, and shows the login screen with "You are offline. Connect to log in."
3. At the next connected start: sign-out, then remove the marker per BR-F01-15, then show login.

**7.5 Session expiry.** As BR-F01-13. A page opened with a revoked session follows P2, flow 7.5.

**7.6 Revoke a session**

1. In Security, the user chooses Sign out on another device's row.
2. That session is revoked and the row disappears.
3. The other device's next request gets 401, and 7.5 runs there.

**7.7 Change password**

1. The user enters the current and new passwords; "Sign out of other devices" is checked.
2. **Wrong current password:** "Your current password is incorrect." **Breached:** as 7.1 step 3.
3. **Success:** "Password changed." Other sessions are revoked if the option was checked.

**7.8 Reset my data**

1. Settings → Data → Reset my data opens a dialog.
2. The user types `RESET` and confirms.
3. **Items waiting on this device:** the button is disabled (BR-F01-21).
4. **Success:** "Your finance data was reset." Queries are invalidated, the dashboard shows its onboarding panel, and the currency is editable in Profile.

**7.9 Delete account**

1. Settings → Data → Delete account opens a dialog explaining BR-F01-23.
2. The user enters the password and types `DELETE`.
3. **Wrong password:** "Your password is incorrect." **`BILLING_UNAVAILABLE`:** "We could not reach the billing service, so nothing was deleted. Try again."
4. **Success:** BR-F01-25.

**7.10 Developer reset.** As BR-F01-28.

## 8. Validation and messages

| Field or action  | Rule                                              | Message shown                                                              |
| ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------- |
| Email            | Required                                          | Enter your email.                                                          |
| Email            | Valid address                                     | Enter a valid email address, like name@example.com.                        |
| Password         | Required                                          | Enter a password.                                                          |
| Password         | At least 12 characters                            | Use at least 12 characters.                                                |
| Password         | At most 128 characters                            | Use 128 characters or fewer.                                               |
| Password         | `PASSWORD_BREACHED`                               | This password has appeared in a data breach. Choose a different one.       |
| Display name     | `INVALID_NAME`                                    | Enter a name of up to 50 characters.                                       |
| Sign-up          | Email exists                                      | An account with this email already exists. Log in instead.                 |
| Login            | Wrong email or password                           | Email or password is incorrect.                                            |
| Login            | Rate limited                                      | Too many attempts. Wait a few seconds and try again.                       |
| New password     | Same as current                                   | Choose a password you have not used for this account.                      |
| Current password | Wrong                                             | Your current password is incorrect.                                        |
| Reset            | Text is not `RESET`                               | Type RESET to confirm.                                                     |
| Delete           | Text is not `DELETE`                              | Type DELETE to confirm.                                                    |
| Delete           | Wrong password                                    | Your password is incorrect.                                                |
| Delete           | `PASSWORD_REQUIRED`                               | Enter your password to delete your account.                                |
| Delete           | `BILLING_UNAVAILABLE`                             | We could not reach the billing service, so nothing was deleted. Try again. |
| Any auth screen  | Offline                                           | You are offline. Connect to log in.                                        |
| Login, Sign-up   | The logout marker exists and sign-out still fails | We couldn't finish logging out the last session. Try again in a moment.    |
| Session expired  | 401 banner                                        | Your session has expired. Log in to keep saving changes.                   |

## 9. Plan gating

None for the core of this feature. Export checks `account.export` (Stretch). Deleting an account with active Premium deletes its Stripe Customer (BR-F01-24).

## 10. Offline behavior

- Sign-up, login, the Security page, reset and delete need a connection and show offline states.
- Logout works offline through the marker (BR-F01-15).
- A 401 pauses the queue and keeps cached data readable (BR-F01-13).

## 11. Server surface

Better Auth's endpoints under `/api/auth/*`, limited to the allow-list in P2 (BR-P2-40):

| Endpoint                                                  | Used for           | Notes                                                                              |
| --------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------- |
| `POST /api/auth/sign-up/email`                            | Sign-up            | Hooks: BR-F01-01, BR-F01-03                                                        |
| `POST /api/auth/sign-in/email`                            | Login              | Hook: BR-F01-01; rate limited                                                      |
| `POST /api/auth/sign-out`                                 | Logout             |                                                                                    |
| `GET /api/auth/get-session`                               | Session check      |                                                                                    |
| `GET /api/auth/list-sessions`                             | Sessions list      |                                                                                    |
| `POST /api/auth/revoke-session`, `/revoke-other-sessions` | Revoke             |                                                                                    |
| `POST /api/auth/change-password`                          | Change password    | Hook: BR-F01-03                                                                    |
| `POST /api/auth/update-user`                              | Display name (F02) | `name` only (BR-F01-02)                                                            |
| `POST /api/auth/delete-user`                              | Delete account     | Password required by the `before` hook (BR-F01-23); before-delete hook (BR-F01-24) |

Daybook's own endpoints:

| Endpoint                        | Method | Input                       | Output                                                             | Errors                       | Idempotency and versioning                                         |
| ------------------------------- | ------ | --------------------------- | ------------------------------------------------------------------ | ---------------------------- | ------------------------------------------------------------------ |
| `/api/account/reset`            | POST   | `{ confirmation: "RESET" }` | 200 `{ deleted: { transactions, budgets, subscriptions, goals } }` | 401, 422 `validation_failed` | Exempt from `Idempotency-Key` (P2, BR-P2-16); profile not required |
| `/api/account/export` (Stretch) | GET    | none                        | CSV file                                                           | 401, 403 `feature_off`       | n/a                                                                |

## 12. Cross-feature effects

- Sign-up leads to F02 onboarding; F02 changes the display name through `/update-user`.
- Logout and user switches trigger P1's wipe.
- Reset invalidates every query, unlocks the currency in F02, re-shows F08's onboarding panel, and makes F15's Load demo data available again.
- Delete uses F12's Stripe Customer deletion and the P2 cascade.
- The landing page reads F14's public posts.
- A 401 from the Daybook API pauses P1's queue.

## 13. Edge cases

- **Two tabs log out at once:** the second finds no session, treats sign-out as done, and wipes anyway.
- **Reset while another device has queued items:** that device's queued creates may still arrive after the reset and reappear; its edits fail with 404 and show as rejected there, and its deletes count as done (D-239). The reset dialog says "Changes still waiting on your other devices may arrive later."
- **Password changed on device A with "sign out others":** device B's next request gets 401, and its queue pauses until the user logs in again.
- **Deleting while another device is online:** that device's next request gets 401; logging in there fails with "Email or password is incorrect."
- **Deletion where Stripe succeeds but the user delete fails:** Premium is already cancelled and cleared locally. A retry passes step 1 (no such customer) and completes.
- **Stripe CLI not running during deletion:** Customer deletion is an outbound call and works; the cancellation webhook arrives later or never, and is ignored either way (BR-F01-26).
- **Cookie present, session revoked elsewhere:** P2 flow 7.5 clears the cookie and shows login without a loop.

## 14. Acceptance criteria

- **AC-F01-01** (E2E) Given a new email, when the visitor signs up, then they land on `/onboarding` with a session.
- **AC-F01-02** (integration) Given an account for `asha@example.com`, when someone signs up with `Asha@Example.COM`, then sign-up is refused with BR-F01-05's message.
- **AC-F01-03** (integration) A password on the breach list (the range API mocked to return its suffix) is refused at sign-up and at change-password. With the range API timing out, sign-up succeeds and a warning is recorded.
- **AC-F01-04** (integration) A wrong password and an unknown email produce identical responses and messages.
- **AC-F01-05** (integration) With the rate limiter enabled in the test config and a fixed `x-forwarded-for` client address, the fourth sign-in attempt within 10 seconds returns 429.
- **AC-F01-06** (unit) `next` values `//evil.example`, `/\evil.example`, `https://evil.example` and `javascript:alert(1)` are ignored; `/transactions?cat=food` is honored.
- **AC-F01-07** (E2E) Given 2 queued items offline, when the user logs out and confirms, then the queue and caches are empty and the marker exists. When the app next starts with a connection, then a request with the old cookie gets 401 and the marker is gone.
- **AC-F01-08** (E2E) Given an expired session with 1 queued item, when the same user logs in again, then the item syncs.
- **AC-F01-09** (E2E) Given user A's cache with 1 waiting item, when B's email is typed and Cancel is chosen, then no sign-in happens and A's item remains.
- **AC-F01-10** (integration) "Sign out all other devices" leaves only the current session. A password change with the option checked revokes the others and keeps the current one.
- **AC-F01-11** (integration) `/update-user` with `image` or any field other than `name` is refused; a 51-character name is refused.
- **AC-F01-12** (integration) Given the golden dataset, when reset runs, then:
    - Transactions, Budgets, Subscriptions, tombstones, Goals and dismissed insights are empty;
    - profile, layout, holdings and entitlements are unchanged;
    - the currency can be changed.
- **AC-F01-13** (integration) Given a Premium user, when deletion succeeds, then the Stripe Customer no longer exists in test mode and no row with that user id remains in any `app` or `auth` table.
- **AC-F01-14** (integration) Given Stripe failing (mocked), when deletion runs, then nothing is deleted, entitlements are unchanged, and the response carries `BILLING_UNAVAILABLE`. Given a Customer already deleted, deletion completes. Given a fresh session and no password, deletion is refused with `PASSWORD_REQUIRED`.
- **AC-F01-15** (E2E) A logged-out visitor at `/` sees the landing page; a logged-in user is sent to `/dashboard`; after deletion, `/?deleted=1` shows the notice.
- **AC-F01-16** (accessibility) Sign-up, login and Security pass axe with no serious or critical violations, and can be completed by keyboard alone.

## 15. Illustrations

Illustrative, the Better Auth settings this spec implies:

```ts
betterAuth({
	baseURL: env.APP_ORIGIN,
	trustedOrigins: [env.APP_ORIGIN],
	database: drizzleAdapter(authDb, { provider: "pg", schema: authSchema }),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 12,
		maxPasswordLength: 128,
		autoSignIn: true,
	},
	session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
	user: {
		deleteUser: {
			enabled: true,
			beforeDelete: cancelBillingAndClearEntitlements,
		},
	},
	advanced: { cookiePrefix: "daybook" },
	hooks: { before: allowListNormalizeAndBreachCheck },
});
```

Illustrative, the sessions list:

```text
Active sessions
  Chrome on Linux     This device    Active today         Created 12 Oct
  Safari on iPhone                   Active 2 days ago    Created 3 Oct    [Sign out]
[Sign out all other devices]
```
