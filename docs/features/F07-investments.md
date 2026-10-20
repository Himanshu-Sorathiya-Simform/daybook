# F07 Investments

17 Oct 2026 · @Himanshu

Every user gets a sample investment portfolio when onboarding completes. It holds 7 mock assets across stocks, ETFs, crypto and mutual funds, bought and sold over the two years before onboarding. Its prices are simulated: a deterministic random walk per asset, extended every day to today. Nothing is live market data.

The Investments page shows:

- **Value:** what the portfolio is worth;
- **Change:** how much it changed over a period, without counting money put in;
- **Gains:** the unrealized gain or loss;
- **Time-weighted return:** how the investments themselves performed;
- **Allocation:** the split across asset types;
- **Per holding:** the gain on each one.

The portfolio is read-only; it exists so the dashboard and charts have real time series and cash flows to work with.

| Item       | Value                                                                                                                                                                                                                                                                                    |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Milestone  | M3. Offline reading arrives with P1 (M5)                                                                                                                                                                                                                                                 |
| Plan       | Free and Premium; no capability codes                                                                                                                                                                                                                                                    |
| Depends on | [F02](F02-onboarding-profile-settings.md) (onboarding seeds the portfolio; currency), [P2](../platform/P2-data-access-and-security.md) (system module, daily pass, request clock), [F15](F15-demo-and-seed-data.md) (scenario accounts, the golden loader); F08 and F09 show its figures |
| Decisions  | D-05, D-34, D-58, D-104 to D-107, D-272 to D-278, D-291, D-292, D-295                                                                                                                                                                                                                    |

## 1. User stories

- As a user, I want to see a realistic portfolio's value and growth without connecting a real account, so that the dashboard shows what an investment view looks like.
- As a user, I want the change over a period to exclude money I put in, so that a new purchase does not look like growth.
- As a user, I want to know how the investments themselves performed, separately from when money went in.
- As a user, I want to see what I hold, what I paid, and my gain or loss on each holding.
- As a user, I want my allocation across stocks, ETFs, crypto and mutual funds.
- As a user, I want it clearly labelled as simulated.

## 2. Scope

| In                                                                                                                                                                                                                                                                                                                                                         | Stretch (M8) | Out                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The mock asset catalog; deterministic daily prices and their catch-up; the per-user seeded portfolio of dated buys and sells; the golden fixture asset; value, period change, unrealized gain, time-weighted return, allocation and per-holding figures; the value-over-time series; the Investments page with trailing and custom ranges; offline reading | None         | User-added holdings or trades (D-105, round 1 I1); live market data (D-05); realized gains and tax lots; dividends; XIRR (D-58); per-asset price pages; real tickers or company names; exchange rates (D-107) |

## 3. Concepts and fields

**Asset** (reference data. Migrations write the catalog; only the golden loader writes the fixture asset. The runtime role reads both)

| Field            | Meaning                                                                                           | Example                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `key`            | Stable identifier (NAM-2): the lowercase symbol for catalog assets                                | `mix`                                                   |
| `symbol`, `name` | Fictional; never a real company or coin                                                           | `MIX`, Mock Index ETF                                   |
| `type`           | `stock`, `etf`, `crypto`, `mutual_fund`                                                           | `etf`                                                   |
| `quantityScale`  | Decimal places allowed in quantities                                                              | 0 for stocks and ETFs, 3 for mutual funds, 8 for crypto |
| `originPrice`    | The base price on the origin date, 2020-01-01. For the fixture asset, its first price             | `10000000000` (100.00 USD)                              |
| `position`       | Order within its type, 1 to 6: the order of the catalog table below. The generator's picks use it | `1`                                                     |
| `fixture`        | True only for the golden test asset (BR-F07-17). Price catch-up and the generator skip it         | `false`                                                 |

**Price** (reference data, written only by the system module): `(assetKey, date, basePrice)`.

- **`date`:** a UTC calendar date.
- **`basePrice`:** an integer number of 10⁻⁸ USD, stored as `bigint`. The fine unit keeps a cheap coin's price exact.

**Money from units** (D-107, D-274, MON-9). The money value of a number of units of an asset at a price is

`round(units × basePrice × num × 10^e ÷ (den × 10^8))` minor units,

where num/den is the currency's factor below and `e` is its exponent.

- **One step:** it is computed on the whole quantity and rounded once, half away from zero (MON-7).
- **Arithmetic:** BigInt in the pure functions of `shared/portfolio/figures`, never SQL `numeric` or floating point. SQL only loads trades and prices (BR-F07-16), so every figure is computed one way.
- **Where it applies:** every value, trade flow and cost.
- **Per-unit figures:** a unit price or an average cost per unit is the same formula for one unit, for display only. One that rounds to 0 shows as less than one minor unit, for example "< £0.01".

| Currency | Factor (num/den) |
| -------- | ---------------- |
| USD      | 1/1              |
| INR      | 83/1             |
| EUR      | 9/10             |
| GBP      | 4/5              |
| JPY      | 150/1            |
| KWD      | 3/10             |

**Trade** (private; the portfolio is its trades)

| Field           | Meaning          | Rules                                                                                  |
| --------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `id`, `user_id` | P2               |                                                                                        |
| `assetKey`      | The asset        | References the catalog                                                                 |
| `tradeDate`     | When it happened | Before the onboarding date (BR-F07-05)                                                 |
| `side`          | `buy` or `sell`  |                                                                                        |
| `quantity`      | Units            | Positive decimal, at most the asset's `quantityScale` places; a string in JSON (MON-9) |

Trades hold **no money**. Money always comes from a trade's units and a price in the user's current currency. A currency change therefore re-prices the whole portfolio automatically (D-275). A trade happens at the close of its date (golden): its flow is its quantity valued at that date's price.

**The catalog** (D-106, D-272): 24 fictional assets, 6 per type. Origin prices are in USD.

| Type        | Assets (symbol, origin price)                                                                                                                                                           | Daily drift and volatility                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| stock       | Northwind Tech (NWT, 182.00), Contoso Retail (CTR, 64.50), Fabrikam Energy (FBE, 41.20), Tailspin Air (TSA, 23.80), Litware Health (LWH, 118.00), Adventure Works (ADW, 77.40)          | Drift +250 ppm, volatility 15,000 ppm                                  |
| etf         | Mock Index ETF (MIX, 100.00), Global Bond ETF (GBE, 52.00), Green Energy ETF (GEE, 34.60), Tech Leaders ETF (TLE, 145.00), Dividend ETF (DVE, 61.30), Emerging Markets ETF (EME, 28.90) | Drift +200 ppm, volatility 9,000 ppm                                   |
| crypto      | Aurum Coin (AUC, 42,000.00), Nimbus Token (NBT, 2,600.00), Lumen Coin (LMC, 140.00), Quartz (QTZ, 22.00), Pebble (PBL, 1.20), Zephyr (ZPH, 0.08)                                        | Drift +1,000 ppm, volatility 30,000 ppm                                |
| mutual_fund | Steady Growth Fund (SGF, 24.00), Balanced Advantage Fund (BAF, 18.50), Liquid Fund (LQF, 10.00), Small Cap Fund (SCF, 31.20), Index Fund 500 (IF5, 56.00), Tax Saver Fund (TSF, 12.70)  | Drift +220 ppm, volatility 7,000 ppm (LQF: drift +150, volatility 300) |

On its median path a price grows by about drift − volatility² ÷ 2 a day. In ppm that is:

- stocks +138, about 5% a year;
- ETFs +160, about 6%;
- crypto +550, about 22%;
- funds +196, about 7%;
- the Liquid Fund +150, about 6%.

So no type drifts towards zero.

## 4. Business rules

**Prices (D-105, JOB-3)**

- **BR-F07-01** Prices exist for every catalog asset and every UTC calendar date from the origin date, 2020-01-01, through today's UTC date, weekends included (D-273). Each day's price follows from the previous day's with integer arithmetic only. Any machine therefore produces the same series.
    1. **Generator:** xoshiro128\*\* is seeded with the first 16 bytes of SHA-256 of `price:<assetKey>:<date>`, read as four little-endian 32-bit words, s0 to s3. If all four are 0, s0 becomes 1. Each day's draws are therefore independent of every other day's.
    2. **Daily return** in parts per million: r = drift + Σ (xᵢ mod (2V + 1) − V) for i = 1 to 3, where xᵢ are three 32-bit draws and V is the volatility. The sum of three uniform draws approximates a normal step with standard deviation V. r is clamped to the range −500,000 to +500,000.
    3. **Price:** `basePrice(d) = max(100, round(basePrice(d − 1) × (1,000,000 + r) ÷ 1,000,000))`, rounded half away from zero with BigInt, with the origin date's price equal to `originPrice`.
        - **The floor:** 100 is one millionth of a USD, far below any catalog path.
        - **Never stuck:** at the floor, any r of 5,000 ppm or more still moves the price.

    The step and the pure price function live in `shared/portfolio/prices`. Price catch-up, the portfolio generator and tests all use it.

- **BR-F07-02** Price catch-up is part of the system module's global daily pass (P2, BR-P2-27), which the route wrapper starts on a server process's first request of each UTC day.
    - **What it writes:** prices from each catalog asset's last stored date to today's UTC date, from `ctx.now`. Fixture assets are skipped.
    - **Idempotent:** it inserts with `ON CONFLICT (asset_key, date) DO NOTHING`, so a repeated or concurrent run changes nothing.
    - **First run:** on an empty table it fills from the origin, about 2,500 days × 24 assets. `db:seed` runs it ahead of time (F15).
- **BR-F07-03** Valuation on a local date D uses each asset's latest price dated on or before D.
    - **East of UTC:** early in the morning, a user therefore sees yesterday's close until the next UTC date's price exists.
    - **No price at all:** an asset with no price on or before D is worth 0. Only the fixture asset can lack one, and only on dates before any units of it are held.

**The seeded portfolio (D-104, D-276)**

- **BR-F07-04** Onboarding seeds the portfolio inside its own write transaction, in the user's context (F02, BR-F02-08).
    - **No table reads:** the generator sizes each trade with the pure price function (BR-F07-01), which gives the same prices as the stored table.
    - **Scenario accounts:** seeded through the system module with the same generator (F15).
    - **Deterministic:** the generator is xoshiro128\*\*, seeded as in BR-F07-01 from SHA-256 of `portfolio:<userId>`, or `portfolio:<email>` for scenario accounts (for example `portfolio:stress@daybook.test`). Each user gets a different but stable portfolio.
    - **Prices are stored first:** every trade is dated before O, and O − 1 is never after today's UTC date. The wrapper runs the daily pass before the onboarding handler when it is due (P2, BR-P2-27). Each trade's price is therefore stored before any figure is read, unless that pass failed.
    - **If the pass failed:** figures use the latest earlier price until a later pass writes the missing days (BR-F07-03). The trades themselves never change.
- **BR-F07-05** The generator works from three dates, in the profile time zone:
    - **O:** the onboarding date;
    - **S:** the first day of the month 24 months before O's month;
    - **L:** O − 1, the last date a trade can have.

    **Draws.**
    - **`draw(n)`:** the generator's next 32-bit output, modulo n.
    - **"A date between X and Y":** X plus `draw(days from X to Y + 1)` days.
    - **Month arithmetic:** date-fns, which clamps month ends.

    The draws run in this order, so the seed fixes the result:

    | Step | Holding                                  | Draws and trades                                                                                                                                                                                                         | Amount per buy (USD, before quantity rounding) |
    | ---- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
    | 1    | All                                      | Pick 2 stocks, 2 ETFs, 1 crypto and 2 mutual funds, in that type order. Within a type, the first pick is `draw(6)` into its 6 assets in `position` order, and the second is `draw(5)` into the 5 left, in the same order |                                                |
    | 2    | Each stock, then each ETF, in pick order | A count `3 + draw(3)`, then for each buy a date between S and L and an amount                                                                                                                                            | `300 + draw(1201)`                             |
    | 3    | The crypto                               | 4 buys, each a date between S and L and an amount                                                                                                                                                                        | `100 + draw(301)`                              |
    | 4    | The crypto                               | 1 sell of 3/10 of the units held. Its date falls between the later of (the day after its last buy) and (O − 6 months), and L                                                                                             |                                                |
    | 5    | The first stock                          | 1 sell of 1/2 of the units held. Its date falls between the later of (the day after its last buy) and (O − 9 months), and L                                                                                              |                                                |
    | 6    | Each mutual fund                         | No draws: a buy on the 5th of every month from S's month, for each 5th on or before L (a monthly SIP), so 24 or 25 buys                                                                                                  | 150                                            |
    - **Quantity per buy:** `floor(amount × 10^8 × 10^scale ÷ basePrice(date))` smallest units (10^−scale each), at least 1. `basePrice(date)` is that date's price.
    - **Quantity per sell:** `floor(units held × share)` in smallest units, with integers.
    - **Skipped sells:** a sell whose date range is empty (its asset's last buy falls on L) draws nothing and is skipped, and the next step's draws follow. A sell whose quantity is 0 is also skipped, after its date draw.
    - **Order:** each sell is dated after every buy of its asset, so it never sells more than is held.
    - **Count:** 64 to 76 trades.
    - **Currency independence:** amounts are in USD before rounding, and quantities depend only on base prices, so the portfolio is the same in every currency.

- **BR-F07-06** The portfolio is read-only. No endpoint creates, edits or deletes a trade. Reset my data keeps it (F01, D-191), and a currency change keeps it unchanged (D-275).

**Figures (D-58, D-277)**

For a period from date A to date B (inclusive, local dates):

- **BR-F07-07** **Value at D** = Σ over assets of the money from units (section 3), for the units held at the close of D at price(D). Each holding is rounded once. "Units held at the close of D" includes trades dated D.
- **BR-F07-08** **Net flows** in the period = Σ buys − Σ sells over trades dated A to B. Each trade is the money from its quantity at its date's price, rounded once.
- **BR-F07-09** **Change over the period** = value at the close of B − value at the close of the day before A − net flows. It is the growth that is not new money.
    - **Its percentage:** change ÷ start value, in tenths of a percent.
    - **No start value:** when the start value is 0, the percentage is `null`, shown "—" (MON-8). That is always so for `all`, which starts on the first trade date, and for a range that starts before the first trade.
- **BR-F07-10** **Cost basis and unrealized gain** use average cost.
    - **A buy:** adds its flow (BR-F07-08) to the asset's cost.
    - **A sell:** removes `round(cost × quantity sold ÷ units held)`, rounded half away from zero.
    - **Unrealized gain at D:** value at D − remaining cost.
    - **Its percentage:** gain ÷ cost, in tenths of a percent, or "—" when the cost is 0.
- **BR-F07-11** **Time-weighted return** (D-34, D-58) for the period splits it at every date with a trade. Each trade happens at the close of its date.
    1. **Sub-periods:** each runs from the close of one split point (after its trades, or the day before A) to the close of the next (before its trades), or to the close of B.
    2. **Factors:** each sub-period's factor is end value ÷ start value. Sub-periods with a start value of 0 are skipped.
    3. **Return:** the product of the factors, minus 1.

    The product is computed exactly with BigInt fractions and rounded once to tenths of a percent, half away from zero. It is "—" when no sub-period has a start value (MON-8).

- **BR-F07-12** **Allocation** at D is each type's share of value, in tenths of a percent. Types with zero value are left out. The four types use fixed colors.
- **BR-F07-13** **Per holding** at D: units, average cost per unit, cost basis, value, unrealized gain and its percentage, and the share of the portfolio. Sold-out holdings are not listed.
- **BR-F07-14** **The value series** for a range gives one point per local date from A to B: the value at that date's close. Line series above 1,000 points are drawn with LTTB sampling (F09, BR-F09-18), but the series sent holds every day.

**The page**

- **BR-F07-15** `/investments` takes either a trailing `range` or a custom `from` and `to`, as dates in the profile time zone (D-278). The page passes them to the endpoints as they are, and the server resolves a range with `shared/portfolio/ranges`. Trailing ranges end at B = today. Month and year steps use date-fns, which clamps month ends.

    | Range          | First day A                                    | Example, today 2027-03-31       |
    | -------------- | ---------------------------------------------- | ------------------------------- |
    | `1m`           | The day after `subMonths(today, 1)`            | 2027-03-01                      |
    | `3m`           | The day after `subMonths(today, 3)`            | 2027-01-01                      |
    | `6m`           | The day after `subMonths(today, 6)`            | 2026-10-01                      |
    | `ytd`          | 1 January of today's year                      | 2027-01-01                      |
    | `1y` (default) | The day after `subYears(today, 1)`             | 2026-04-01                      |
    | `all`          | The first trade date                           |                                 |
    | Custom         | `from`; B is `to`, or today when `to` is later | `from=2026-10-01&to=2026-10-31` |

    The start value of a trailing range is therefore the close one period before today.
    - **Invalid input:** it is dropped with the FIL-5 notice, and the default applies. Invalid means an unknown `range`, a malformed date, only one of `from` and `to`, `from` after B, `from` before the origin (2020-01-01), or `range` together with dates.
    - **A custom range:** shows its dates in place of the range buttons, for example "1 Oct – 31 Oct 2026".

    The page shows, top to bottom:
    1. **A banner:** "Sample portfolio. Prices are simulated, not real market data."
    2. **Summary:** value at B, change over the range with its percentage of the starting value, time-weighted return, unrealized gain or loss with its percentage.
    3. **Value over time:** a line chart for the range, with buy and sell markers, data zoom, and View as table (F09's chart rules).
    4. **Allocation by type at B:** a donut with the four types and their values.
    5. **Holdings at B:** a TanStack Table (D-171), sortable, with the BR-F07-13 columns. The total row equals the summary. For a custom range that ends before today, the heading says "Holdings on 31 Oct 2026".

- **BR-F07-16** Every figure is computed on the server in one read transaction (D-34). The client never computes a figure.
    - **Loading:** `loadPortfolio` reads the trades and the prices they need, in two statements.
    - **Computing:** pure functions in `shared/portfolio/figures` compute every figure from those rows with BigInt.
- **BR-F07-17** **The golden fixture** (TST-2, D-291). The golden loader (F15, BR-F15-26) writes these through the system module:
    - the asset `golden-mix`: symbol MIX, name "Mock Index ETF (golden)", type `etf`, `quantityScale` 0, `fixture` true, and `originPrice` equal to its first price;
    - its three prices (section 5) and no others;
    - golden's two trades, in place of a generated portfolio.

    Price catch-up and the generator skip fixture assets. The fixture therefore keeps exactly those prices and never appears in another portfolio.

- **BR-F07-18** **Freshness.** An investment query on the client goes stale when both of these hold:
    - the UTC date is later than its `asOfPriceDate`;
    - its range ends after `asOfPriceDate`.

    That covers the summary, series and holdings, and the dashboard's data. A stale query refetches on mount and when the window regains focus, so an open page picks up a new day's prices without a reload. A past month or range never goes stale this way.

## 5. Calculations

**Golden** ([03-golden-dataset.md, Investments](../03-golden-dataset.md#investments)). Golden holds only the fixture (BR-F07-17). With the real INR factor of 83/1, its base prices give exactly 100.00, 110.00 and 99.00 per unit:

| Date       | `basePrice` (10⁻⁸ USD) | One unit in INR                                               | Trade        |
| ---------- | ---------------------- | ------------------------------------------------------------- | ------------ |
| 2026-09-30 | 120,481,928            | `round(120,481,928 × 83 × 100 ÷ 10^8)` = 10,000 paise, 100.00 | Buy 10 units |
| 2026-10-15 | 132,530,120            | 11,000 paise, 110.00                                          | Buy 10 units |
| 2026-10-31 | 119,277,108            | 9,900 paise, 99.00                                            | none         |

Whole holdings round to the same figures. Ten units on 30 Sep are `round(100,000.00024)` = 100,000 paise, and twenty on 31 Oct are `round(197,999.99928)` = 198,000 paise. Between price dates the latest earlier price applies (BR-F07-03). The daily value is therefore:

- 1,000.00 from 30 Sep to 14 Oct;
- 2,200.00 from 15 to 30 Oct;
- 1,980.00 from 31 Oct on.

| Figure, October (A = 1 Oct, B = 31 Oct)           | Value                                                                           | Rule      |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| Value at start (close of 30 Sep, after its buy)   | 1,000.00                                                                        | BR-F07-07 |
| Net flows (only 15 Oct falls in the period)       | +1,100.00                                                                       | BR-F07-08 |
| Value at end (close of 31 Oct, 20 units at 99.00) | 1,980.00                                                                        | BR-F07-07 |
| Change over the period                            | 1,980.00 − 1,000.00 − 1,100.00 = −120.00 (−12.0% of the start value)            | BR-F07-09 |
| Cost basis                                        | 1,000.00 + 1,100.00 = 2,100.00                                                  | BR-F07-10 |
| Unrealized gain                                   | −120.00, −5.7%                                                                  | BR-F07-10 |
| Time-weighted return                              | 1,100.00 ÷ 1,000.00 = 1.10; 1,980.00 ÷ 2,200.00 = 0.90; 1.10 × 0.90 − 1 = −1.0% | BR-F07-11 |
| Allocation                                        | ETF 100.0%                                                                      | BR-F07-12 |

The gain on cost (−5.7%) and the time-weighted return (−1.0%) differ on purpose: the second buy landed before a fall.

**One price step.**

- A stock at basePrice 18,200,000,000 (182.00 USD), with draws giving r = +12,000 ppm, moves to `round(18,200,000,000 × 1,012,000 ÷ 1,000,000)` = 18,418,400,000.
- One unit for an INR user is `round(18,418,400,000 × 83 × 100 ÷ 10^8)` = `round(1,528,727.2)` = 1,528,727 paise, or ₹15,287.27.

**Currency independence.** 7.5 units of a mutual fund priced at 24.00 USD (basePrice 2,400,000,000) are worth:

- `round(7.5 × 2,400,000,000 × 83 × 100 ÷ 10^8)` = 1,494,000 paise, or ₹14,940.00, to an INR user;
- `round(7.5 × 2,400,000,000 × 9 × 100 ÷ (10 × 10^8))` = 16,200 cents, or €162.00, to an EUR user.

Same units, different currency, no rebuild.

**A cheap coin.** 5,000 Zephyr at basePrice 3,000,000 (0.03 USD), for a GBP user:

- **The holding:** `round(5,000 × 3,000,000 × 4 × 100 ÷ (5 × 10^8))` = 12,000 pence, or £120.00.
- **The unit price:** shows as £0.02, from 2.4p rounded.
- **Never multiplied:** the holding is never valued as 5,000 × £0.02 = £100.00.

## 6. Screens and states

**`/investments`.** BR-F07-15.

| State            | What the user sees                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading          | Skeleton summary, chart area of fixed height, donut and table rows                                                                               |
| Empty            | Never empty after onboarding. A profile created before M3 in development gets its portfolio from `db:seed --reset`, or from F15's portfolio step |
| Error            | "Investments could not be loaded." with Retry                                                                                                    |
| Offline (M5)     | The last viewed range from cache with "as of"; other ranges: "You're offline. This range isn't saved on this device."                            |
| Pending          | n/a (read-only)                                                                                                                                  |
| Locked (Premium) | n/a                                                                                                                                              |
| Read-only        | Always; there are no write actions                                                                                                               |

## 7. Flows

**7.1 Onboarding seeds the portfolio.**

1. `POST /api/profile` succeeds (F02, BR-F02-08).
2. In the same transaction, BR-F07-05 writes 64 to 76 trades: 24 or 25 monthly buys per fund, plus the stock, ETF and crypto trades.
3. The first `/investments` visit shows two years of history.

**7.2 Daily prices.**

1. A server process's first request on a new UTC day runs the daily pass (P2, BR-P2-27), which appends one price per catalog asset.
2. The value series gains one point.
3. Open pages refetch once the UTC date passes their `asOfPriceDate` (BR-F07-18).

**7.3 Change the range.**

1. Selecting `3m` updates the URL, and the summary and chart refetch for 3 months.
2. Allocation and holdings are at today for every trailing range, so they stay as they are.
3. The previous range stays cached for offline use (from M5).

**7.4 Currency change before finance data (F02).** The trades stay unchanged. The next request values them in the new currency.

**7.5 From the dashboard.** The October investments widget opens `/investments?from=2026-10-01&to=2026-10-31`, which shows the same change and return as the widget (F08).

## 8. Validation and messages

| Situation                                                        | Message shown                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Banner                                                           | Sample portfolio. Prices are simulated, not real market data. |
| Invalid `range`, `from` or `to`                                  | Some filters in this link weren't valid and were removed.     |
| Custom range label                                               | 1 Oct – 31 Oct 2026                                           |
| Custom range holdings heading                                    | Holdings on 31 Oct 2026                                       |
| No change percentage or time-weighted return (no starting value) | — (with the tooltip "Not enough history in this range.")      |
| Per-unit figure below one minor unit                             | < £0.01 (in the user's currency)                              |
| Load failure                                                     | Investments could not be loaded.                              |

## 9. Plan gating

None. Investments are free (root 2).

## 10. Offline behavior

Read-only, from M5 (P1). The last viewed range's summary and series, and the holdings, are persisted (root 7.3) and shown with "as of". Other ranges need a connection. There are no writes.

## 11. Server surface

| Endpoint                    | Method | Input                                                    | Output                                                                                                                                                                                                       | Errors                           |
| --------------------------- | ------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `/api/investments/summary`  | GET    | `range`, or `from` and `to`                              | `{ from, to, valueMinor, changeMinor, changeTenths, netFlowsMinor, startValueMinor, costMinor, gainMinor, gainTenths, twrTenths, allocation: [{ type, valueMinor, shareTenths }], currency, asOfPriceDate }` | 400, 401, 403 `profile_required` |
| `/api/investments/series`   | GET    | As for the summary                                       | `{ from, to, points: [{ date, valueMinor }], trades: [{ date, assetKey, side, quantity }], currency, asOfPriceDate }`                                                                                        | 400, 401, 403                    |
| `/api/investments/holdings` | GET    | `on` (date, default today; a later date counts as today) | `{ items: [{ assetKey, symbol, name, type, quantity, avgCostMinor, costMinor, valueMinor, gainMinor, gainTenths, shareTenths }], currency, asOfPriceDate }`                                                  | 400, 401, 403                    |

- **Transactions:** each endpoint is a read in one repeatable-read transaction (P2).
- **Input:** `range` resolves on the server as in BR-F07-15, so `all` starts on the first trade date. With dates:
    - a `to` after today counts as today;
    - a `from` before the origin counts as the origin;
    - a `from` after the resulting `to` gets 400 `bad_request`.

    A request with neither form, or with both, gets 400 `bad_request`.

- **Output:** the resolved `from` and `to`.
- **Nullable fields:** `changeTenths`, `gainTenths` and `twrTenths` are `null` where section 4 shows "—".
- **`asOfPriceDate`:** the latest price date used.

**Shared functions.** F08's widget (for the dashboard month), F09's charts and these endpoints use them.

- `loadPortfolio(tx, ctx, { from, to })` reads the trades and the prices they need, in two statements. `to` is clipped to today.
- `portfolioFigures(data, { from, to })` is pure and returns the summary.
- `portfolioSeries(data, { from, to })` is pure and returns the daily values and the trades.

**Modules**

- `shared/portfolio/prices`: the price step and the pure price function (BR-F07-01).
- `shared/portfolio/generate`: the pure generator (BR-F07-05).
- `shared/portfolio/figures`: the pure figure functions (BR-F07-07 to BR-F07-14).
- `shared/portfolio/ranges`: range resolution (BR-F07-15).
- `server/dal/portfolio.seed(tx, ctx)`: seeds at onboarding.
- `server/system/prices.catchUp()`: runs in the daily pass.

## 12. Cross-feature effects

- **F02:** onboarding seeds the portfolio. A currency change needs no rebuild (D-275).
- **F08:** the investment growth widget shows the dashboard month's change and time-weighted return, and links here with that month's `from` and `to`.
- **F09:** charts portfolio value and allocation.
- **F15:** seeds scenario portfolios with the same generator, runs price catch-up in `db:seed`, and loads the golden fixture.
- **F11:** reports leave investments out (D-121).
- **F01:** reset keeps the portfolio; account deletion cascades trades.

## 13. Edge cases

- **A trade on the period's first day:** the start value is the close of the day before, and the trade is a flow inside the period.
- **A period before the first trade:** start value 0, so the change percentage and the time-weighted return are "—", and the change is 0.
- **A cheap coin:** values come from units and the base price with one rounding (section 3). A unit price of 0 or 2 minor units therefore never distorts a holding, and the floor of 100 keeps the price moving.
- **Onboarding on the 1st to the 5th of a month:** that month's 5th is not before O, so each fund has 24 buys.
- **A sell with no room:** when an asset's last buy falls on L, its sell is skipped.
- **The daily pass has not run yet today (UTC):** valuation uses yesterday's price (BR-F07-03), and `asOfPriceDate` shows it.
- **The daily pass failed:** trades dated after the latest stored price are valued at that price until a later pass writes the missing days. The trades do not change.
- **A user moves time zone:** local dates map to UTC price dates by BR-F07-03; history does not change.
- **Two server processes run the daily pass at once:** the marker row makes one of them do nothing (P2, BR-P2-27).
- **The golden account:** its portfolio is the fixture (BR-F07-17), not a generated one.

## 14. Acceptance criteria

- **AC-F07-01** (integration) With the golden fixture and the INR factor 83, October's summary returns every value in section 5's table. The daily series is 1,000.00, 2,200.00 and 1,980.00 on the dates given there.
- **AC-F07-02** (unit) The price generator is deterministic.
    - **Reference vector:** xoshiro128\*\* seeded with words 1, 2, 3, 4 gives 11520, 0, 5927040, 70819200.
    - **Test vector:** Northwind Tech (`nwt`) is 18,379,088,000 on 2020-01-02 (r = +9,840 ppm) and 18,556,280,787 on 2020-01-03 (r = +9,641 ppm).
    - **Agreement:** two runs from the origin give identical series, and for every catalog asset the pure function equals the prices catch-up stores.
    - **No floating point:** no module uses `Math.exp`, `Math.log`, `Math.pow` or floating-point division, and price and money arithmetic uses BigInt.
- **AC-F07-03** (integration) Price catch-up run twice on the same UTC day inserts each catalog asset's price once and writes no price for the fixture asset.
- **AC-F07-04** (unit) The portfolio generator is checked for onboarding dates on the 1st, the 5th, the 6th and the last day of a month. For each, it:
    - gives the same trades for the same seed;
    - dates every trade before O;
    - places every sell after its asset's buys, never selling more units than are held;
    - writes no zero quantity;
    - gives each fund 24 buys when O is on or before the 5th of its month, and 25 otherwise.
- **AC-F07-05** (integration) Two users onboarded on the same day get different portfolios. One user's portfolio is identical in INR and USD by units, and its value differs only through the currency factor.
- **AC-F07-06** (unit) Time-weighted return and change percentage:
    - the golden fixture's time-weighted return is −1.0%;
    - for a single buy with no later trade, the return equals the price change;
    - a range before any trade gives `twrTenths` and `changeTenths` of `null`;
    - every `all` range gives `changeTenths` of `null`.
- **AC-F07-07** (unit) Average cost: buying 10 at 100.00 and 10 at 110.00, then selling 5, leaves a cost of 1,575.00 for 15 units.
- **AC-F07-08** (integration) The holdings table's totals equal the summary's value, cost and gain for the same date.
- **AC-F07-09** (integration) A currency change on an account with only the portfolio leaves every trade unchanged (F02, AC-F02-10).
- **AC-F07-10** (accessibility) The page passes axe with no serious or critical violations. The chart offers View as table, and the holdings table works by keyboard.
- **AC-F07-11** (unit) A cheap coin:
    - 5,000 Zephyr at basePrice 3,000,000 are worth £120.00 to a GBP user (section 5);
    - its unit price shows as £0.02;
    - from a price at the floor of 100, a day with r = +5,000 ppm moves it to 101.
- **AC-F07-12** (unit) Ranges on 2027-03-31 give the first days in BR-F07-15's table. A custom `to` after today counts as today. `range` together with dates is dropped with the FIL-5 notice.
- **AC-F07-13** (integration) Endpoint input:
    - `range=all` returns `from` equal to the first trade date;
    - `from=2019-06-01` counts as 2020-01-01;
    - a request with neither form, or both, gets 400.
- **AC-F07-14** (unit) Freshness: with `asOfPriceDate` 2026-11-02, an October query never goes stale; a query ending 2026-11-03 goes stale once the UTC date is 2026-11-03.

## 15. Illustrations

Illustrative, `GET /api/investments/summary?from=2026-10-01&to=2026-10-31` with the golden fixture:

```json
{
	"valueMinor": 198000,
	"startValueMinor": 100000,
	"netFlowsMinor": 110000,
	"changeMinor": -12000,
	"changeTenths": -120,
	"costMinor": 210000,
	"gainMinor": -12000,
	"gainTenths": -57,
	"twrTenths": -10,
	"allocation": [{ "type": "etf", "valueMinor": 198000, "shareTenths": 1000 }],
	"currency": "INR",
	"asOfPriceDate": "2026-10-31"
}
```

Illustrative, the page:

```text
Sample portfolio. Prices are simulated, not real market data.
[1M] [3M] [6M] [YTD] [1Y] [All]
Value ₹4,12,380.55   Change −₹3,210.40 (−0.8%)   Return −1.1%   Gain +₹38,902.10 (+10.4%)
[ line chart: value over time, ▲ buys ▼ sells ]
[ donut: Stocks 38% · ETFs 27% · Mutual funds 25% · Crypto 10% ]
Asset              Type    Units      Avg cost   Value        Gain
Steady Growth Fund Fund    412.315    ₹180.42    ₹84,122.04   +13.1%
```
