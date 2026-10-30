# Daybook: Golden Dataset

16 Oct 2026 · @Himanshu

A fixed, hand-checked dataset and the exact value every screen, list total and report must show for it. Integration tests load it and assert these numbers (TST-2, TST-3), and every feature spec takes its worked examples from it. If code and this file disagree, the code is wrong unless a decision changes the rule.

It is built to catch the mistakes that matter:

- **Refunds:** a refund lowers Shopping to exactly 100%; counted as income, it would read 150%.
- **Timezone boundaries:** three rows fall on a different month in UTC.
- **Carry-forward:** a Budget change applies only from its month.
- **Tombstones:** a skipped Subscription charge stays skipped.
- **Withdrawals:** a Goal withdrawal lowers its progress.
- **Pending:** a pending change never touches confirmed numbers.
- **Threshold edges:** utilization of exactly 80% and exactly 100%.

## Setup

| Item         | Value                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| User         | `golden@daybook.test`, Premium (so every report and chart is reachable)                                          |
| Profile      | Country IN, currency INR (exponent 2), timezone Asia/Kolkata (UTC+05:30, no daylight saving), week starts Monday |
| Frozen clock | 2026-11-02T12:00:00+05:30 (2026-11-02T06:30:00Z); today is 2026-11-02                                            |
| Amounts      | Shown in rupees; stored in paise (MON-1). Examples: 18,000.00 is stored as `1800000`; 649.00 as `64900`          |

**Budgets**

| Category       | Limit    | Effective from                                         |
| -------------- | -------- | ------------------------------------------------------ |
| food           | 6,000.00 | 2026-09                                                |
| food           | 5,000.00 | 2026-10 (replaces the September limit from October on) |
| shopping       | 3,000.00 | 2026-09                                                |
| entertainment  | 1,000.00 | 2026-09                                                |
| transportation | 2,000.00 | 2026-10                                                |

**Subscriptions** (each created on its start date, without backfill)

| Name               | Amount    | Cadence | Start      | Category      | Note                                                   |
| ------------------ | --------- | ------- | ---------- | ------------- | ------------------------------------------------------ |
| Sunrise Apartments | 18,000.00 | monthly | 2026-09-01 | housing       |                                                        |
| Netflix            | 649.00    | monthly | 2026-09-05 | entertainment |                                                        |
| Cult Gym           | 1,500.00  | monthly | 2026-09-10 | health        | The 2026-10-10 charge was deleted, leaving a tombstone |
| Amazon Prime       | 1,499.00  | yearly  | 2026-10-12 | entertainment |                                                        |

**Goals** (both created 2026-09-01, both active)

| Name           | Target     | Target date |
| -------------- | ---------- | ----------- |
| Emergency fund | 100,000.00 | none        |
| Vacation       | 30,000.00  | 2027-03-31  |

## Transactions

Local time is Asia/Kolkata. "Auto" marks a Subscription charge, stored at 00:00 local (TIME-6). Rows marked ⚑ fall in a different month in UTC than locally; every charge also falls on the day before in UTC, at 18:30.

| #    | `occurred_on` | Local time | `occurred_at` (UTC)  | Type              | Category or Goal | Payee              | Description       | Amount    | Source                                          |
| ---- | ------------- | ---------- | -------------------- | ----------------- | ---------------- | ------------------ | ----------------- | --------- | ----------------------------------------------- |
| 1 ⚑  | 2026-09-01    | Auto       | 2026-08-31T18:30:00Z | expense           | housing          | Sunrise Apartments |                   | 18,000.00 | subscription                                    |
| 2    | 2026-09-01    | 10:15      | 2026-09-01T04:45:00Z | income            | salary           | Acme Corp          |                   | 85,000.00 | manual                                          |
| 3    | 2026-09-02    | 08:00      | 2026-09-02T02:30:00Z | goal_contribution | Emergency fund   |                    |                   | 5,000.00  | manual                                          |
| 4    | 2026-09-03    | 13:20      | 2026-09-03T07:50:00Z | expense           | food             | Swiggy             |                   | 1,850.00  | manual                                          |
| 5    | 2026-09-05    | Auto       | 2026-09-04T18:30:00Z | expense           | entertainment    | Netflix            |                   | 649.00    | subscription                                    |
| 6    | 2026-09-08    | 19:40      | 2026-09-08T14:10:00Z | expense           | shopping         | Myntra             |                   | 2,400.00  | manual                                          |
| 7    | 2026-09-10    | Auto       | 2026-09-09T18:30:00Z | expense           | health           | Cult Gym           |                   | 1,500.00  | subscription                                    |
| 8    | 2026-09-12    | 18:05      | 2026-09-12T12:35:00Z | expense           | food             | BigBasket          | Monthly groceries | 3,200.00  | manual                                          |
| 9    | 2026-09-15    | 09:30      | 2026-09-15T04:00:00Z | goal_contribution | Vacation         |                    |                   | 3,000.00  | manual                                          |
| 10   | 2026-09-20    | 21:10      | 2026-09-20T15:40:00Z | expense           | transportation   | Uber               |                   | 450.00    | manual                                          |
| 11   | 2026-09-25    | 12:00      | 2026-09-25T06:30:00Z | income            | freelance        | Studio Nine        |                   | 12,000.00 | manual                                          |
| 12 ⚑ | 2026-10-01    | Auto       | 2026-09-30T18:30:00Z | expense           | housing          | Sunrise Apartments |                   | 18,000.00 | subscription                                    |
| 13   | 2026-10-01    | 10:05      | 2026-10-01T04:35:00Z | income            | salary           | Acme Corp          |                   | 85,000.00 | manual                                          |
| 14   | 2026-10-02    | 08:00      | 2026-10-02T02:30:00Z | goal_contribution | Emergency fund   |                    |                   | 5,000.00  | manual                                          |
| 15   | 2026-10-04    | 20:30      | 2026-10-04T15:00:00Z | expense           | food             | Zomato             |                   | 2,300.00  | manual                                          |
| 16   | 2026-10-05    | Auto       | 2026-10-04T18:30:00Z | expense           | entertainment    | Netflix            |                   | 649.00    | subscription                                    |
| 17   | 2026-10-07    | 11:45      | 2026-10-07T06:15:00Z | expense           | shopping         | Croma              |                   | 4,500.00  | manual                                          |
| 18   | 2026-10-09    | 16:20      | 2026-10-09T10:50:00Z | refund            | shopping         | Croma              |                   | 1,500.00  | manual                                          |
| 19   | 2026-10-11    | 09:10      | 2026-10-11T03:40:00Z | expense           | transportation   | Indian Oil         |                   | 1,800.00  | manual                                          |
| 20   | 2026-10-12    | Auto       | 2026-10-11T18:30:00Z | expense           | entertainment    | Amazon Prime       |                   | 1,499.00  | subscription                                    |
| 21   | 2026-10-14    | 19:00      | 2026-10-14T13:30:00Z | expense           | food             | BigBasket          | Monthly groceries | 2,900.00  | manual                                          |
| 22   | 2026-10-15    | 09:30      | 2026-10-15T04:00:00Z | goal_contribution | Vacation         |                    |                   | 3,000.00  | manual                                          |
| 23   | 2026-10-18    | 17:45      | 2026-10-18T12:15:00Z | goal_withdrawal   | Vacation         |                    |                   | 1,000.00  | manual                                          |
| 24   | 2026-10-19    | 22:15      | 2026-10-19T16:45:00Z | expense           | food             | Swiggy             |                   | 640.00    | manual                                          |
| 25   | 2026-10-31    | 23:50      | 2026-10-31T18:20:00Z | expense           | food             | Swiggy             |                   | 380.00    | manual                                          |
| 26 ⚑ | 2026-11-01    | 00:30      | 2026-10-31T19:00:00Z | expense           | food             | Swiggy             |                   | 420.00    | manual                                          |
| 27 ⚑ | 2026-11-01    | Auto       | 2026-10-31T18:30:00Z | expense           | housing          | Sunrise Apartments |                   | 18,000.00 | subscription, created by catch-up on 2026-11-02 |

**Not in the table:**

- **The Cult Gym charge for 2026-10-10** is a tombstone, so it is not a Transaction.
- **Charges not yet due:** Netflix on 2026-11-05 and Cult Gym on 2026-11-10.

**Pending (in the write queue, never confirmed)**

| #   | `occurred_on` | Local time | `occurred_at` (UTC)  | Type    | Category | Payee      | Amount |
| --- | ------------- | ---------- | -------------------- | ------- | -------- | ---------- | ------ |
| P1  | 2026-11-02    | 11:40      | 2026-11-02T06:10:00Z | expense | food     | Chai Point | 300.00 |

## Monthly totals

Formulas are TXN-5. Every figure counts confirmed rows only.

| Figure             | September      | October         | November (to 2 Nov) |
| ------------------ | -------------- | --------------- | ------------------- |
| Transactions       | 11 (#1 to #11) | 14 (#12 to #25) | 2 (#26, #27)        |
| Income             | 97,000.00      | 85,000.00       | 0.00                |
| Expenses           | 28,049.00      | 32,668.00       | 18,420.00           |
| Refunds            | 0.00           | 1,500.00        | 0.00                |
| Spending (Out)     | 28,049.00      | 31,168.00       | 18,420.00           |
| Net savings        | 68,951.00      | 53,832.00       | −18,420.00          |
| To Goals           | 8,000.00       | 7,000.00        | 0.00                |
| Unallocated        | 60,951.00      | 46,832.00       | −18,420.00          |
| Savings rate       | 71.1%          | 63.3%           | — (no income)       |
| Pending annotation | none           | none            | 300.00 pending      |

October against September: spending up 3,119.00 (+11.1%); savings rate down 7.8 points.

**All time, to 2 November:** income 182,000.00; spending 77,637.00; net savings 104,363.00; To Goals 15,000.00; unallocated 89,363.00.

## Spending by category

| Category       | September     | October       | Change                 | November (to 2 Nov) |
| -------------- | ------------- | ------------- | ---------------------- | ------------------- |
| housing        | 18,000.00     | 18,000.00     | 0.00 (0.0%)            | 18,000.00           |
| food           | 5,050.00      | 6,220.00      | +1,170.00 (+23.2%)     | 420.00              |
| shopping       | 2,400.00      | 3,000.00      | +600.00 (+25.0%)       | 0.00                |
| entertainment  | 649.00        | 2,148.00      | +1,499.00 (+231.0%)    | 0.00                |
| transportation | 450.00        | 1,800.00      | +1,350.00 (+300.0%)    | 0.00                |
| health         | 1,500.00      | 0.00          | −1,500.00 (−100.0%)    | 0.00                |
| **Total**      | **28,049.00** | **31,168.00** | **+3,119.00 (+11.1%)** | **18,420.00**       |

October shopping is 4,500.00 spent minus the 1,500.00 refund.

## Budgets

| Category                          | September limit, spent, utilization                     | October limit, spent, utilization                         | November limit, spent, utilization |
| --------------------------------- | ------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------- |
| food                              | 6,000.00 · 5,050.00 · 84.2% (80% alert)                 | 5,000.00 · 6,220.00 · 124.4% (100% alert)                 | 5,000.00 · 420.00 · 8.4%           |
| shopping                          | 3,000.00 · 2,400.00 · 80.0% (80% alert, exact boundary) | 3,000.00 · 3,000.00 · 100.0% (100% alert, exact boundary) | 3,000.00 · 0.00 · 0.0%             |
| entertainment                     | 1,000.00 · 649.00 · 64.9%                               | 1,000.00 · 2,148.00 · 214.8% (100% alert)                 | 1,000.00 · 0.00 · 0.0%             |
| transportation                    | no Budget                                               | 2,000.00 · 1,800.00 · 90.0% (80% alert)                   | 2,000.00 · 0.00 · 0.0%             |
| **Overall (budgeted categories)** | 10,000.00 · 8,099.00 · 81.0%                            | 11,000.00 · 13,168.00 · 119.7%                            | 11,000.00 · 420.00 · 3.8%          |
| **Unbudgeted spending**           | 19,950.00 (housing, health, transportation)             | 18,000.00 (housing)                                       | 18,000.00 (housing)                |

- September keeps its 6,000.00 food limit even though the limit changed in October.
- November inherits October's limits by carry-forward.
- The pending 300.00 at Chai Point leaves November food at 8.4% and fires no alert.

## Goals (as of 2 November)

| Goal           | Contributions       | Withdrawals    | Progress  | Percent | Required monthly      |
| -------------- | ------------------- | -------------- | --------- | ------- | --------------------- |
| Emergency fund | 10,000.00 (#3, #14) | 0.00           | 10,000.00 | 10.0%   | none (no target date) |
| Vacation       | 6,000.00 (#9, #22)  | 1,000.00 (#23) | 5,000.00  | 16.7%   | 6,250.00              |

- The required monthly amount is 25,000.00 remaining over the 4 calendar months after November through March 2027 (December, January, February, March), rounded up (MON-7). It comes out exact.
- A new contribution above 89,363.00 (all-time unallocated) shows the over-saving warning. A contribution of exactly 89,363.00 does not.

## Subscriptions (as of 2 November)

| Name               | Next due   | Monthly equivalent               | Yearly cost    |
| ------------------ | ---------- | -------------------------------- | -------------- |
| Netflix            | 2026-11-05 | 649.00                           | 7,788.00       |
| Cult Gym           | 2026-11-10 | 1,500.00                         | 18,000.00      |
| Sunrise Apartments | 2026-12-01 | 18,000.00                        | 216,000.00     |
| Amazon Prime       | 2027-10-12 | 124.92 (shown; summed unrounded) | 1,499.00       |
| **Total**          |            | **20,273.92**                    | **243,287.00** |

- The monthly total is 243,287.00 ÷ 12 = 20,273.9166…, rounded once to 20,273.92 (MON-7).
- **Upcoming, next 30 days** (2 November to 2 December, inclusive): Netflix 5 Nov, Cult Gym 10 Nov, Sunrise Apartments 1 Dec; total 20,149.00.
- **Renewals within 7 days** (2 to 9 November, inclusive): Netflix only. Cult Gym on 10 November is just outside.
- **Charges in October:** 20,148.00 (#12, #16, #20). The tombstoned Cult Gym charge is not included.

## Transactions list checks

Header totals are count, In, Out and To Goals for the filter (D-82). Pending rows appear in the list with a badge and are never counted.

| Check | Filter (URL)                                 | Rows                  | Count             | In        | Out                            | To Goals  |
| ----- | -------------------------------------------- | --------------------- | ----------------- | --------- | ------------------------------ | --------- |
| A     | `from=2026-10-01&to=2026-10-31`              | #12 to #25            | 14                | 85,000.00 | 31,168.00                      | 7,000.00  |
| B     | A plus `cat=food`                            | #15, #21, #24, #25    | 4                 | 0.00      | 6,220.00                       | 0.00      |
| C     | `from=2026-09-01&to=2026-10-31&cat=shopping` | #6, #17, #18          | 3                 | 0.00      | 5,400.00                       | 0.00      |
| D     | `q=swiggy`                                   | #4, #24, #25, #26     | 4                 | 0.00      | 3,290.00                       | 0.00      |
| E     | A plus `src=subscription`                    | #12, #16, #20         | 3                 | 0.00      | 20,148.00                      | 0.00      |
| F     | `type=goal_contribution,goal_withdrawal`     | #3, #9, #14, #22, #23 | 5                 | 0.00      | 0.00                           | 15,000.00 |
| G     | `q=groceries` (matches description)          | #8, #21               | 2                 | 0.00      | 6,100.00                       | 0.00      |
| H     | `q=649` (numeric, exact amount)              | #5, #16               | 2                 | 0.00      | 1,298.00                       | 0.00      |
| I     | `from=2026-11-01&to=2026-11-02`              | #26, #27              | 2, plus 1 pending | 0.00      | 18,420.00, plus 300.00 pending | 0.00      |

**Order checks**

- **Newest first** (default): P1 (pending), #26, #27, #25, #24 … Same-day order follows `occurred_at`. On 1 October, #13 (10:05) sorts above #12 (Auto, 00:00); on 1 November, #26 (00:30) sorts above #27 (Auto, 00:00).
- **October by amount, largest first:**
    - #13 85,000.00, #12 18,000.00, #14 5,000.00, #17 4,500.00, #22 3,000.00,
    - #21 2,900.00, #15 2,300.00, #19 1,800.00, #18 1,500.00, #20 1,499.00,
    - #23 1,000.00, #16 649.00, #24 640.00, #25 380.00.

**Timezone checks.** Bucketing by the UTC date instead of `occurred_on` would put #1 in August, #12 in September, and #26 and #27 in October. October food would then read 6,640.00 instead of 6,220.00. Each assertion above fails under that bug.

## Calendar heat map, October

Daily spending is expenses minus refunds on that day.

| Day             | Spending  | Shown                                                    |
| --------------- | --------- | -------------------------------------------------------- |
| 1 Oct           | 18,000.00 | 18,000.00                                                |
| 4 Oct           | 2,300.00  | 2,300.00                                                 |
| 5 Oct           | 649.00    | 649.00                                                   |
| 7 Oct           | 4,500.00  | 4,500.00                                                 |
| 9 Oct           | −1,500.00 | 0, with the footnote "Refunds exceeded spending" (D-185) |
| 11 Oct          | 1,800.00  | 1,800.00                                                 |
| 12 Oct          | 1,499.00  | 1,499.00                                                 |
| 14 Oct          | 2,900.00  | 2,900.00                                                 |
| 19 Oct          | 640.00    | 640.00                                                   |
| 31 Oct          | 380.00    | 380.00                                                   |
| Every other day | 0.00      | 0.00                                                     |

The unclamped daily values sum to 31,168.00, October's spending.

**Color levels for 2026** (F09, BR-F09-09). The year has 17 positive days: 7 in September, 9 in October, and 1 November (18,420.00).

- **Ascending:** 380, 450, 640, 649, 649, 1,499, 1,500, 1,800, 1,850, 2,300, 2,400, 2,900, 3,200, 4,500, 18,000, 18,000, 18,420.
- **Thresholds,** by nearest rank: t1 = 649.00 (rank 5), t2 = 1,850.00 (rank 9) and t3 = 3,200.00 (rank 13).
- **October:**
    - level 4: 1 Oct and 7 Oct;
    - level 3: 4 Oct and 14 Oct;
    - level 2: 11 Oct and 12 Oct;
    - level 1: 5 Oct, 19 Oct and 31 Oct;
    - level 0: 9 Oct and every other day.

## Insights

At the frozen clock of 2 November (F10).

**October** (complete; baseline months: September only):

| #   | Detector               | Severity | Finding                                                                                                        |
| --- | ---------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| 1   | Budget threshold       | Critical | entertainment, 2,148.00 of 1,000.00 (214.8%)                                                                   |
| 2   | Budget threshold       | Critical | food, 6,220.00 of 5,000.00 (124.4%)                                                                            |
| 3   | Budget threshold       | Critical | shopping, 3,000.00 of 3,000.00 (100.0%)                                                                        |
| 4   | Budget threshold       | Warning  | transportation, 1,800.00 of 2,000.00 (90.0%)                                                                   |
| 5   | Savings rate           | Warning  | 63.3%, from 71.1% in September (−7.8 points)                                                                   |
| 6   | Category trend         | Warning  | entertainment, 2,148.00 against 649.00 (+1,499.00, +231.0%)                                                    |
| 7   | Category trend         | Warning  | transportation, 1,800.00 against 450.00 (+1,350.00, +300.0%)                                                   |
| 8   | Outlier                | Info     | Croma, 4,500.00 on 7 Oct; typical expense 2,075.00 (median of the 10 manual expenses in September and October) |
| 9   | Category trend         | Info     | shopping, 3,000.00 against 2,400.00 (+600.00, +25.0%; exactly at the 125% boundary)                            |
| 10  | Savings recommendation | Info     | entertainment: back to 649.00 saves 1,499.00 a month                                                           |

Food (+23.2%) does not reach the 125% trend threshold. Renewals do not appear, since October is not the current month.

**November** (current month, to date): Netflix renews on 5 November, 649.00 (renewals within 7 days, 2 to 9 November inclusive). Cult Gym on 10 November is just outside. No other detector fires, and the pending 300.00 changes nothing.

## October monthly report

Generated on 2 November, so the period is complete, not "to date".

- **Summary:** income 85,000.00; spending 31,168.00; net savings 53,832.00; To Goals 7,000.00; savings rate 63.3%.
- **Spending by category, and budget against actual:** the October columns above.
- **Goals at 31 October:** Emergency fund 10,000.00 (10.0%); Vacation 5,000.00 (16.7%).
- **Subscription costs:** charges in October 20,148.00; monthly equivalent 20,273.92.
- **Largest expenses** (gross amounts; October has only 9 expenses):
    1. Sunrise Apartments 18,000.00
    2. Croma 4,500.00
    3. BigBasket 2,900.00
    4. Zomato 2,300.00
    5. Indian Oil 1,800.00
    6. Amazon Prime 1,499.00
    7. Netflix 649.00
    8. Swiggy 640.00
    9. Swiggy 380.00
- **CSV:** the expected Transactions CSV rows and the summary CSV's first rows are in F11, section 5. The Transactions rows net to 46,832.00, October's unallocated savings.

## Investments

Golden holds a fixed fixture in place of a generated portfolio (F07, BR-F07-17).

- **The asset:** `golden-mix`, Mock Index ETF (golden), type ETF. It is a test-only asset that price catch-up and the generator skip, so it has exactly these three prices.
- **Prices:** each base price is in 10⁻⁸ USD, and the real INR factor of 83/1 turns it into an exact INR price.

| Date       | Base price  | Close price (INR) | Event                   |
| ---------- | ----------- | ----------------- | ----------------------- |
| 2026-09-30 | 120,481,928 | 100.00            | Buy 10 units (1,000.00) |
| 2026-10-15 | 132,530,120 | 110.00            | Buy 10 units (1,100.00) |
| 2026-10-31 | 119,277,108 | 99.00             | none                    |

The latest earlier price applies between dates. The daily value is therefore:

- 1,000.00 from 30 Sep to 14 Oct;
- 2,200.00 from 15 to 30 Oct;
- 1,980.00 from 31 Oct on, November included.

Cash flows happen at the close of their date. A time-weighted sub-period ends at that close, before the flow is added.

| Figure, October                                | Value                   |
| ---------------------------------------------- | ----------------------- |
| Value at start (30 Sep close)                  | 1,000.00                |
| Net flows                                      | +1,100.00               |
| Value at end (31 Oct close, 20 units at 99.00) | 1,980.00                |
| Change over the period, excluding flows        | −120.00                 |
| Cost basis                                     | 2,100.00                |
| Unrealized gain or loss                        | −120.00 (−5.7%)         |
| Time-weighted return                           | −1.0% (1.10 × 0.90 − 1) |
| Allocation                                     | ETF 100.0%              |

The two sub-periods are 30 Sep to 15 Oct (1,000.00 to 1,100.00, +10.0%) and 15 Oct after the buy to 31 Oct (2,200.00 to 1,980.00, −10.0%). The gain on cost (−5.7%) and the time-weighted return (−1.0%) differ on purpose. The second buy landed before a fall, which hurt the money but not the investment's own performance.

## Q4 2026 quarterly report, to date

Generated on 2 November, so the quarter is partial: its covered months are October and November (F11).

- **Summary:** income 85,000.00; spending 49,588.00; net savings 35,412.00; To Goals 7,000.00; savings rate 41.7%.
- **Spending by category:** housing 36,000.00; food 6,640.00; shopping 3,000.00; entertainment 2,148.00; transportation 1,800.00.
- **Budget against actual** (limits summed over October and November):
    - entertainment 2,148.00 of 2,000.00 (107.4%);
    - food 6,640.00 of 10,000.00 (66.4%);
    - shopping 3,000.00 of 6,000.00 (50.0%);
    - transportation 1,800.00 of 4,000.00 (45.0%);
    - overall 13,588.00 of 22,000.00 (61.8%), with unbudgeted 36,000.00.
- **Subscription charges:** 38,148.00 (Sunrise Apartments 36,000.00, Amazon Prime 1,499.00, Netflix 649.00). Current monthly cost 20,273.92.
- **Largest expenses:** Sunrise Apartments 18,000.00 on 1 Nov, then on 1 Oct (a tie, newest first); Croma 4,500.00; BigBasket 2,900.00; Zomato 2,300.00; Indian Oil 1,800.00; Amazon Prime 1,499.00; Netflix 649.00; Swiggy 640.00; Swiggy 420.00.
- **Goals at 2 November:** Emergency fund 10,000.00 (10.0%); Vacation 5,000.00 (16.7%).
- **Month by month:** October as its monthly report; November income 0.00, spending 18,420.00, net savings −18,420.00, savings rate "—".

## Invariants to assert

1. Category spending sums to total spending, for each month above.
2. The dashboard, check A's header totals and the October report summary show the same income, spending and To Goals.
3. Each Goal's progress equals its contributions minus its withdrawals.
4. Replaying the queue item for P1 twice creates exactly one Transaction.
5. After P1 syncs, November spending becomes 18,720.00 and food 720.00 (14.4%), and the pending annotation disappears once the queries refetch.
6. Removing the frozen clock changes no figure for September or October.
