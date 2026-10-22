---
name: golden-test
description: "Write or review a test that checks a total, a percentage, a date bucket, a list order or a report against the golden dataset and its frozen clock. Covers where the expected numbers come from, how to freeze the clock at each test level, how to load the data, and what such a test must assert."
argument-hint: "[what to test]"
---

# Golden test

The golden dataset (`docs/03-golden-dataset.md`) is a fixed, hand-checked set of data with the exact value every screen, total and report must show. A golden test checks the code against those values. It is how the project catches wrong money, wrong months and wrong totals.

The request: $ARGUMENTS

If no request is stated above, ask me what to test.

This skill covers how to write the test. The general rules are in `.claude/rules/testing.md`; apply them too.

## 1. Find the expected numbers

- Look up the figure in the dataset's own sections: monthly totals, spending by category, budgets, goals, subscriptions, transactions list checks (order and timezone), the calendar heat map, insights, the October report, investments and the Q4 report.
- Copy the expected value from the document, with its meaning. Never compute it with the code under test or with a formula you wrote to match the code.
- Put the source in a comment above the test, such as `// golden: Budgets, October food` and the row numbers it uses (for example `#26`).
- If the figure is not in the dataset, stop. Say so, and propose adding it through `spec-change`. Never invent a number.
- Never change a number in the dataset to make a test pass. Ask me first.

## 2. Freeze the clock

The frozen clock is 2026-11-02T12:00:00+05:30, which is 2026-11-02T06:30:00Z. Today is 2 November 2026. The profile is India: INR, Asia/Kolkata, week starts Monday. Nothing may read the real clock (TST-3).

- **Pure functions and components:** freeze only `Date`, with `vi.useFakeTimers({ toFake: ["Date"] })` and `vi.setSystemTime(new Date("2026-11-02T06:30:00Z"))` in `beforeEach`, and `vi.useRealTimers()` in `afterEach`. Leave the timers real, so Testing Library and user-event keep working.
- **Server tests:** do not fake the system time for SQL. Pass the frozen instant as the request clock (`ctx.now`); every business date and instant in SQL is a bound parameter (BR-P2-43). Test factories mint ids and `createdAt` values from the same injected clock. SQL never uses `now()`.
- **Browser tests:** use the frozen-clock mechanism the specs define for the running app. If none exists yet, ask me.

## 3. Load the data

- The spec names a fixture module, `seed/golden.ts`, that encodes the dataset row for row, and integration tests use it (F15, BR-F15-26). Find where it lives in the repo. Never retype the rows.
- Row 27 is not in the fixture: the first request on 2 November creates it through catch-up, as the dataset says. The pending item P1 appears only in write-queue tests.
- Isolation: the fixture is built once into a template database. A test file that changes golden data runs in its own copy, made with `CREATE DATABASE ... TEMPLATE`, and first clears the catch-up note (`resetCatchUpNote()`, BR-P2-14).
- If the fixture does not exist yet, it belongs to the demo-data work (F15). Until then, a pure-function test may use inline values copied from the dataset rows. Label them "copied from the golden dataset" and name the rows.

## 4. What the test asserts

- **Exact integers in the minor unit** for money. 18,000.00 is stored as `1800000` paise. When the test covers a screen, assert the displayed text too, exactly as the spec shows it for that screen: some show `₹18,000.00`, some `18,000.00`.
- **Exact percentages** to one decimal, such as food in October at 124.4%.
- **The edge rows** the dataset was built for:
    - the timezone rows (#1, #12, #26 and #27), which fall in a different month if bucketed by UTC;
    - the refund, which lowers October shopping to exactly 100.0%;
    - the Cult Gym tombstone, which is not a Transaction;
    - the budget thresholds at exactly 80% and 100%;
    - the withdrawal, which lowers a Goal's progress.
- **The invariants** listed at the end of the dataset, as cross-checks:
    1. category spending sums to total spending, for each month;
    2. the dashboard, the list header totals and the October report summary show the same income, spending and To Goals;
    3. each Goal's progress equals its contributions minus its withdrawals;
    4. replaying the queue item for P1 twice creates one Transaction;
    5. after P1 syncs, November spending is 18,720.00 and food is 720.00 (14.4%), and the pending annotation goes once the queries refetch;
    6. removing the frozen clock changes no September or October figure.

## 5. Write it

Follow the testing rule: the test lives in the `tests/` folder beside the code, carries the criterion ID in a comment, and fakes only the network and outside services. Show it failing for the right reason before the code makes it pass.

Never use the real clock, never mock our own modules or the database, never skip a test, and never weaken an assertion.

## Keep this skill current

When the fixture module is written, replace the "if it does not exist yet" note in step 3 with its real location and how tests load it.
