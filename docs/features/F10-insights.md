# F10 Insights

18 Oct 2026 · @Himanshu

Insights are short, plain-language observations about one month of a user's money:
- a Budget nearly or fully spent;
- a savings rate that moved;
- a category that jumped;
- one unusually large expense;
- a Subscription renewing this week;
- a concrete way to save.

Six rule-based detectors compute them from the same confirmed figures as the dashboard and charts, so an insight never disagrees with a number on screen. No language model is involved, and every insight is labelled as simulated advice. The dashboard shows the top 5 for its month, and `/insights` shows them all. A user can dismiss an insight, and it stays dismissed for that month.

| Item | Value |
| --- | --- |
| Milestone | M6 |
| Plan | Free and Premium; per-detector flags `insights.detector.<name>` (P4) |
| Depends on | [F03](F03-transactions.md) (`rollup`, list), [F04](F04-budgets.md) (`budgetMonth`, states), [F05](F05-subscriptions.md) (`upcomingDue`), [F02](F02-onboarding-profile-settings.md) (month, locale), [P4](../platform/P4-capabilities.md) (flags), [P1](../platform/P1-offline-and-pwa.md) (saved cache); [F08](F08-dashboard.md) shows the top 5 |
| Decisions | D-40, D-56, D-120, D-248, D-331 to D-337, D-371 |

## 1. User stories

- As a user, I want to be told when a Budget is nearly or fully spent, without searching for it.
- As a user, I want to know when a category costs much more than usual, and what bringing it back would save.
- As a user, I want to spot an unusually large expense and see renewals coming this week.
- As a user, I want to dismiss an insight I have seen, and get it back if I change my mind.
- As a user, I want insights for any past month, matching that month's numbers.

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| Six detectors; insight ordering and the top 5; `/insights` with a month picker; dismiss and restore; the dashboard widget; flags per detector; offline reading of saved months | None | A language model (root 16); push or email alerts (P1 push is Stretch); insights about investments; custom thresholds; insights across several months at once; stored insight history |

## 3. Concepts and fields

**Insight** (computed on request, never stored; D-331)

| Field | Meaning | Example |
| --- | --- | --- |
| `key` | `<detector>:<subject>:<month>`, stable for the same finding (D-120) | `budgetThreshold:food.over:2026-10` |
| `detector` | One of the six names below | `budgetThreshold` |
| `severity` | `critical`, `warning` or `info` | `critical` |
| `kind` | `alert`, `trend` or `tip` | `alert` |
| `message` | The sentence shown, formatted in the user's locale | "Food is over budget: ₹6,220.00 of ₹5,000.00 (124.4%)." |
| `evidence` | The numbers behind it, in minor units and tenths of a percent | `{ "spentMinor": 622000, "limitMinor": 500000, "utilizationTenths": 1244 }` |
| `action` | A label and a link to the data behind it | "View Budgets" → `/budgets?month=2026-10` |
| `dismissed` | Present only with `includeDismissed` | `false` |

**Dismissal** (private, one row per dismissed insight): `user_id`, `key` (unique per user), `dismissed_at`. Rows are kept until restored or the account is deleted. Reset my data deletes them (F01).

**The baseline** (D-333), used by the category trend and the savings recommendation:
- **Baseline months:** up to the 3 months before M that fall on or after the month of the user's earliest confirmed Transaction. With none, those detectors are skipped for M.
- **Baseline of a category:** its mean Out over those months.
- **Baseline total:** the mean total Out over the same months.

## 4. Business rules

**Data**

- **BR-F10-01** Insights use confirmed Transactions only (D-40); a pending change never produces, changes or removes an insight (OFF-6). They read the same shared functions as the dashboard: F03's `rollup` and list query, F04's `budgetMonth` and F05's `upcomingDue`. A figure in an insight therefore equals the figure on the dashboard, Budgets page or Transactions list for the same month.
- **BR-F10-02** `insightsFor(tx, ctx, month)` computes every insight for month M in one repeatable-read transaction, with at most 6 statements: the month and category rollup for M and the baseline months, `budgetMonth(M)`, the expense window for the outlier, `upcomingDue(7)` for the current month, the earliest month, and the user's dismissals, matched to insights by their full key. **Rounding (D-371, as F04's D-248):** each amount (a baseline mean, the median) is rounded once to the minor unit, and each percentage once to tenths, half away from zero. Thresholds then compare those rounded values, which are exactly the numbers the message shows, so a message never reads "+50.0%" at info severity. Messages are built with F02's formatters for the user's locale; the examples here write the minus sign as −.
- **BR-F10-03** A detector whose flag `insights.detector.<name>` resolves off is skipped (P4). The savings recommendation computes its own trends, so it works with the category trend switched off.

**The detectors** (D-56, D-332)

- **BR-F10-04** **Budget threshold** (`budgetThreshold`, alert). For each category budgeted in M, F04's state decides (BR-F04-09):
    - `over` (100.0% or more): critical, "Food is over budget: ₹6,220.00 of ₹5,000.00 (124.4%)."
    - `warning` (80.0% to below 100.0%): warning, "Transportation has used 90.0% of its Budget: ₹1,800.00 of ₹2,000.00."

    The subject is `<category>.<state>`, so an insight dismissed at 80% returns as a new one when the category passes 100%. Action: "View Budgets" → `/budgets?month=M`.
- **BR-F10-05** **Savings rate** (`savingsRate`, trend). It runs only for a complete month; the current month is skipped, since a month to date, with its salary already in, would beat a full month every time. Each month's rate is rounded to tenths of a percent (TXN-5). The first rule that applies fires, and at most one per month:
    1. **Below zero:** income in M above zero and net savings below zero; critical, "You spent more than you earned in October: net savings −₹2,000.00."
    2. **Down 5.0 points or more:** income above zero in M and the month before; warning, "Your savings rate fell to 63.3% from 71.1% in September (−7.8 points)."
    3. **Up 5.0 points or more:** as rule 2; info, "Your savings rate rose to 71.1% from 63.3% in October (+7.8 points)."

    The change is the difference of the two rounded rates. The subject is `all`. Action: "View dashboard" → `/dashboard?month=M`.
- **BR-F10-06** **Outlier** (`outlier`, alert, info).
    - **The window:** M and the 2 months before, counting expenses with source `manual` only, so Subscription charges never count. It needs at least 8 such expenses.
    - **The typical expense:** their median. With an even count it is the mean of the two middle amounts, rounded half away from zero.
    - **Firing:** the largest manual expense in M that is at least twice the typical expense fires, at most one per month. Of two equal amounts, the newer fires (list order, TIME-3). "Croma, ₹4,500.00 on 7 Oct, is at least twice your typical expense of ₹2,075.00."

    The subject is the Transaction id. Action: "View Transaction" → `/transactions?txn=<id>`.
- **BR-F10-07** **Category trend** (`categoryTrend`, trend). For each expense category with a baseline above zero, the increase is M's Out minus the baseline, and `increaseTenths` is that increase over the baseline, in tenths of a percent, rounded. It fires when both hold:
    - `increaseTenths` is at least 250 (+25.0%);
    - the increase is at least 2.0% of the baseline total (`increase × 1000 ≥ 20 × baselineTotal`, in minor units).

    Its severity is warning when `increaseTenths` is at least 500 (+50.0%), else info. "Entertainment spending is ₹2,148.00, up 231.0% on your recent average of ₹649.00." Only increases fire; a fall is good news, not an alert. The subject is the category. Action: "View Transactions" → `/transactions?from=<M's first day>&to=<M's last day>&cat=<c>`.
- **BR-F10-08** **Savings recommendation** (`savingsRecommendation`, tip, info). It takes the category that passes BR-F10-07's test with the largest increase in money (on a tie, the lowest key), and states what returning to the baseline saves: "Spending ₹649.00 on entertainment, your recent average, would save ₹1,499.00 a month." The subject is the category, and the action is the same as the category trend's.
- **BR-F10-09** **Renewals soon** (`renewalsSoon`, alert, info). It runs only when M is the current month. Each date `upcomingDue(7)` returns (F05, BR-F05-20), from today to today + 7 days inclusive, gives one insight: "Netflix renews on 5 Nov: ₹649.00." The subject is `<subscriptionId>@<due date>`, and its key's month is the due date's month, so a renewal dismissed on 30 October stays dismissed on 1 November. Action: "View Subscriptions" → `/subscriptions`.
- **BR-F10-10** **The current month.** M's figures are to date (PER-3). A category trend for the current month ends with "(to date)". The savings rate does not run for it (BR-F10-05).

**Order and display (D-334)**

- **BR-F10-11** Insights are ordered by:
    1. severity: critical, warning, info;
    2. detector: budget threshold, savings rate, outlier, category trend, savings recommendation, renewals soon;
    3. within one detector: Budget thresholds by `utilizationTenths`, highest first; category trends by the increase in money, largest first; renewals by due date, soonest first, then name;
    4. any remaining tie: by `key`, ascending.

    The order is therefore the same on the server and the client, and the top 5 never flips.
- **BR-F10-12** **The dashboard widget** (F08, BR-F08-10) shows the first 5 undismissed insights for the dashboard month, with "See all" to `/insights?month=M`. With none it says "No insights for October 2026."
- **BR-F10-13** **`/insights?month=YYYY-MM`** shows:
    - the month picker of the dashboard (F08, BR-F08-01);
    - the label "Simulated AI insights · not financial advice" (D-56);
    - every undismissed insight in order, each with its severity icon and word (Critical, Warning, Info), its message, its action and Dismiss;
    - "Show dismissed (3)" when any are dismissed, which lists them dimmed, each with Restore.

    An invalid `month` is dropped with the FIL-5 notice, as on the dashboard.

**Dismissing (D-120, D-335)**

- **BR-F10-14** Dismiss calls `POST /api/insights/[key]/dismiss`, which inserts the dismissal with `ON CONFLICT DO NOTHING`. The insight leaves the list at once, with the toast "Insight dismissed." and Undo, which restores it. Restore calls `POST /api/insights/[key]/restore`, which deletes the row. Both are online only; offline, the buttons are disabled with "Connect to dismiss insights."
- **BR-F10-15** A key that no longer matches a current insight is still accepted, so a dismissal made on a stale screen never fails. It only hides that key if the insight appears again.

## 5. Calculations

Golden ([03-golden-dataset.md, Insights](../03-golden-dataset.md#insights)), at the frozen clock of 2 November.

**October** (complete). Baseline months: September only, since the earliest Transaction is in September. Baseline total 28,049.00, so 2.0% of it is 560.98.

| # | Detector | Severity | Finding |
| --- | --- | --- | --- |
| 1 | Budget threshold | Critical | entertainment, 2,148.00 of 1,000.00 (214.8%) |
| 2 | Budget threshold | Critical | food, 6,220.00 of 5,000.00 (124.4%) |
| 3 | Budget threshold | Critical | shopping, 3,000.00 of 3,000.00 (100.0%) |
| 4 | Budget threshold | Warning | transportation, 1,800.00 of 2,000.00 (90.0%) |
| 5 | Savings rate | Warning | 63.3%, from 71.1% in September (−7.8 points) |
| 6 | Category trend | Warning | entertainment, 2,148.00 against 649.00 (+1,499.00, +231.0%) |
| 7 | Category trend | Warning | transportation, 1,800.00 against 450.00 (+1,350.00, +300.0%) |
| 8 | Outlier | Info | Croma, 4,500.00 on 7 Oct; typical expense 2,075.00 |
| 9 | Category trend | Info | shopping, 3,000.00 against 2,400.00 (+600.00, +25.0%) |
| 10 | Savings recommendation | Info | entertainment: back to 649.00 saves 1,499.00 a month |

The dashboard's top 5 are rows 1 to 5.

**How the borderline cases fall:**
- **Food:** 6,220.00 against 5,050.00 is +23.2%, below 125%, so no trend.
- **Shopping:** exactly 125% (3,000.00 × 100 = 2,400.00 × 125), and +600.00 ≥ 560.98, so it fires, as info since it is below 150%.
- **Housing:** unchanged. **Health:** fell to 0.00, and falls never fire.
- **The outlier window** (August has no data) holds the 10 manual expenses of September and October: 380, 450, 640, 1,800, 1,850, 2,300, 2,400, 2,900, 3,200 and 4,500. The median is (1,850.00 + 2,300.00) ÷ 2 = 2,075.00. Croma's 4,500.00 is at least 4,150.00.
- **The savings rate:** September is 68,951.00 ÷ 97,000.00 = 71.1% (711 tenths); October is 53,832.00 ÷ 85,000.00 = 63.3% (633). The change is −78 tenths, past the 50-tenth threshold.
- **No renewals:** October is not the current month.

**November** (to date, the current month): one insight, renewals soon for Netflix on 5 November, 649.00. Cult Gym on 10 November is outside the 7 days.
- **Budget threshold:** food is at 8.4%, so none fires.
- **Savings rate:** skipped: November is the current month (BR-F10-05).
- **Category trend:** food's 420.00 is far below its 5,635.00 baseline.
- **Outlier:** the window's 11 expenses have a median of 1,850.00, and November's largest manual expense is 420.00.
- **The pending 300.00:** changes nothing.

## 6. Screens and states

**`/insights`** (BR-F10-13) and the **dashboard widget** (BR-F10-12).

| State | What the user sees |
| --- | --- |
| Loading | Three skeleton cards |
| Empty | "No insights for October 2026." |
| Error | "Insights could not be loaded." with Retry |
| Offline | The saved current and last viewed months with "as of" (P1); other months: "You're offline. This month isn't saved on this device." Dismiss and Restore are disabled |
| Pending | n/a: pending changes never affect insights |
| Locked (Premium) | n/a |
| Read-only | Offline |

## 7. Flows

**7.1 Read and act.** On the October dashboard, the widget's first card says "Entertainment is over budget: ₹2,148.00 of ₹1,000.00 (214.8%)." View Budgets opens October's Budgets.

**7.2 Dismiss.** On `/insights?month=2026-10`, the user dismisses the outlier. It leaves the list, the toast offers Undo, and the dashboard's top 5 stay as they were, since the outlier was row 8. "Show dismissed (1)" appears.

**7.3 A Budget crosses 100%.** Transportation's warning was dismissed. A new expense takes it to 105.0%, and the critical insight `budgetThreshold:transportation.over:2026-10` appears.

## 8. Validation and messages

| Situation | Message shown |
| --- | --- |
| Label | Simulated AI insights · not financial advice |
| Budget over | Food is over budget: ₹6,220.00 of ₹5,000.00 (124.4%). |
| Budget near | Transportation has used 90.0% of its Budget: ₹1,800.00 of ₹2,000.00. |
| Savings rate below zero | You spent more than you earned in October: net savings −₹2,000.00. |
| Savings rate down | Your savings rate fell to 63.3% from 71.1% in September (−7.8 points). |
| Savings rate up | Your savings rate rose to 71.1% from 63.3% in October (+7.8 points). |
| Outlier | Croma, ₹4,500.00 on 7 Oct, is at least twice your typical expense of ₹2,075.00. |
| Category trend | Entertainment spending is ₹2,148.00, up 231.0% on your recent average of ₹649.00. |
| Savings recommendation | Spending ₹649.00 on entertainment, your recent average, would save ₹1,499.00 a month. |
| Renewal | Netflix renews on 5 Nov: ₹649.00. |
| Current month suffix | (to date) |
| Empty | No insights for October 2026. |
| Dismissed | Insight dismissed. |
| Offline dismiss | Connect to dismiss insights. |
| Load failure | Insights could not be loaded. |

## 9. Plan gating

None: insights are free (D-56). Each detector has a server-only flag (P4): `insights.detector.budgetThreshold`, `.savingsRate`, `.outlier`, `.categoryTrend`, `.savingsRecommendation` and `.renewalsSoon`.

## 10. Offline behavior

The current month's and the last viewed month's insights are saved (P1, BR-P1-11) and shown with "as of". Dismiss and Restore are online only and never queued.

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency |
| --- | --- | --- | --- | --- | --- |
| `/api/insights` | GET | `month`, `includeDismissed` (optional, `1`) | `{ month, partial, earliestMonth, items, dismissedCount, currency }` | 400 (also for a month after the current one), 401, 403 `profile_required` | Read |
| `/api/insights/[key]/dismiss` | POST | `{}` | 204 | 400 (malformed key), 401, 403 | `Idempotency-Key` required; online only |
| `/api/insights/[key]/restore` | POST | `{}` | 204 | 400, 401, 403 | `Idempotency-Key` required; online only |

A key must match `^[a-zA-Z]+:[A-Za-z0-9_.@-]{1,80}:\d{4}-(0[1-9]|1[0-2])$`, URL-encoded in the path. Dismiss and Restore invalidate the `insights` query prefix, which the dashboard widget reads.

**Shared function.** `insightsFor(tx, ctx, month)`, used by `/api/insights` and the dashboard's server prefetch (F08).

## 12. Cross-feature effects

- **F03 to F06:** a confirmed write invalidates the whole `insights` query prefix, every month, since baselines and windows reach back 3 months (D-337).
- **F04:** Budget alerts are F04's states plus this spec's Budget-threshold insights (BR-F04-13).
- **F08:** the widget shows the top 5 (BR-F10-12); F08's server render prefetches them.
- **F01:** Reset my data deletes dismissals; account deletion cascades them.
- **P1:** saves the current and last viewed months.
- **P4:** detector flags.

## 13. Edge cases

- **A new user with one month of data:** no baseline, so no category trend or recommendation; the other detectors run.
- **A month with fewer than 8 manual expenses in the window:** no outlier.
- **A category with a baseline of zero:** skipped by the trend; a large first expense can still be an outlier.
- **Refunds:** count through Out, so a refund can stop a trend from firing. The outlier looks at gross manual expenses.
- **Two expenses tie for largest:** the outlier takes the one earlier in list order (TIME-3).
- **A time-zone change:** months follow `occurred_on` (TIME-3), so insights do not move.
- **A detector flag switched off:** its insights vanish; dismissals stay for when it returns.
- **Demo data:** counts like any other data.

## 14. Acceptance criteria

- **AC-F10-01** (integration) On golden, `GET /api/insights?month=2026-10` returns section 5's 10 insights in that order, with those messages and evidence.
- **AC-F10-02** (integration) `month=2026-11` returns exactly the Netflix renewal, with the pending 300.00 queued changing nothing.
- **AC-F10-03** (unit) The category trend fires at exactly 125% and not at 124.9%, and needs the 2.0% margin: shopping at +600.00 fires against a baseline total of 28,049.00 and would not against 30,001.00.
- **AC-F10-04** (unit) The outlier median of an even count is the rounded mean of the middle two. Fewer than 8 expenses gives no outlier. Subscription charges never count.
- **AC-F10-05** (integration) Dismissing hides the insight in both `/api/insights` and the dashboard prefetch. Restoring brings it back. Dismissing twice leaves one row.
- **AC-F10-06** (integration) A Budget dismissed at `warning` returns as a new `over` insight after crossing 100%.
- **AC-F10-07** (integration) With `FLAG_INSIGHTS_DETECTOR_OUTLIER=off`, the October list has 9 insights.
- **AC-F10-08** (integration) `/api/insights` runs at most 6 statements after the wrapper's setup.
- **AC-F10-09** (E2E) The dashboard widget shows rows 1 to 5 for October. Dismissing one from `/insights` brings row 6 into the widget.
- **AC-F10-10** (accessibility) `/insights` passes axe with no serious or critical violations. Severity is given in words, not only by color or icon.

## 15. Illustrations

Illustrative, one item of `GET /api/insights?month=2026-10`:

```json
{
  "key": "categoryTrend:entertainment:2026-10",
  "detector": "categoryTrend",
  "severity": "warning",
  "kind": "trend",
  "message": "Entertainment spending is ₹2,148.00, up 231.0% on your recent average of ₹649.00.",
  "evidence": { "outMinor": 214800, "baselineMinor": 64900, "increaseMinor": 149900, "increaseTenths": 2310, "baselineMonths": ["2026-09"] },
  "action": { "label": "View Transactions", "href": "/transactions?from=2026-10-01&to=2026-10-31&cat=entertainment" }
}
```
