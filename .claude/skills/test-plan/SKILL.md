---
name: test-plan
description: "List the test cases to consider for a feature or change, from its spec and a checklist of project traps, each assigned a test type and checked against the tests that already exist. Reports only; writes no tests. Use before writing tests, or to find what is untested."
argument-hint: "[F03 or P2] [part]"
---

# Test plan

A list of what is worth testing for a spec, and what is already tested. This skill only reports. It writes no tests and edits nothing; tests are written by `implement-feature` or when I ask.

The request: $ARGUMENTS

If no spec is named above, infer it from the branch name and the changed paths and say what you inferred. If you cannot tell, ask me.

## 1. Collect the cases from the spec

If a `spec-reader` agent exists in `.claude/agents/`, use it for the reading and ask for an extract. Otherwise read the spec in pieces. Take cases from:

- **Acceptance criteria** (section 14): every one is a case, with its ID and its level tag (unit, integration, E2E).
- **Business rules** (section 4): each rule that no acceptance criterion covers is a case with no ID. Note it.
- **Worked examples** (section 5) and the golden dataset rows they use: each number is a case.
- **Screens and states** (section 6): each cell of the state matrix that applies.
- **Validation and messages** (section 8): each message, matched exactly.
- **Plan gating** (section 9), **offline behavior** (section 10), **server surface** (section 11): each error code, refusal and queue behavior.
- **Cross-feature effects** (section 12) and **edge cases** (section 13).

## 2. Add the traps that apply

Read [checklist.md](checklist.md) in this folder. For each group, add the cases that apply to this part and that the spec does not already state. Say which groups you skipped as not applicable. Do not pad: a case that has no connection to this part is noise.

## 3. Give each case a test type

- **Unit:** a pure function, run by Vitest. Money, dates, parsing, filter-to-SQL, schedules.
- **Component:** a screen with its real code, where MSW answers the network calls. Forms, states, pending annotations, gating display.
- **Server:** a route handler against a real Postgres. Runs in CI; there is no local Postgres, so mark it "CI only".
- **Browser:** a Playwright journey in `e2e/`. Runs only when I ask; mark it "on request".
- **Accessibility:** axe in a Playwright test, plus keyboard checks.

Follow `.claude/rules/testing.md`: fake only the network and outside services, never our own modules or the database.

## 4. Compare with what exists

Search the tests (`**/tests/**`) with Grep for each acceptance criterion ID. For each case, mark one of:

- **Covered:** a test carries the ID, with its file and line, and it asserts what the criterion says.
- **Weak:** a test carries the ID but asserts less, is skipped, or only checks the happy path.
- **Missing:** no test.

Cases without an ID can only be matched by reading test names. Mark those "not traceable" unless you find a clear match.

## 5. Report

- A one-line summary: how many cases, and how many are covered, weak and missing.
- A table with the columns Case, Source (an AC or BR ID, a spec section, or "checklist"), Type, Runs here (yes, CI only, on request), and Status (with file and line).
- **Write first:** the missing cases that matter most, in order: money, dates, isolation and plan gating, then validation messages, then states, then the rest.
- **Not in the spec:** behavior worth testing that no criterion states. Propose each as a new acceptance criterion with its likely test type. Adding one is a spec change, so I decide and `spec-change` records it. Do not add any yourself.

Keep it to the point. Group rows by source if the table is long.

## Keep this skill current

When a new kind of test or a new project trap appears, add it to step 3 or to `checklist.md`.
