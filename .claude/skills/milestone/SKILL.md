---
name: milestone
description: "Plan the start of a milestone, or check whether it is ready to close. Use as /milestone start M1 or /milestone close M1. Reports only; creates no files."
argument-hint: "[start|close] [M0 to M8]"
disable-model-invocation: true
---

# Milestone

The root spec splits the build into milestones (`docs/01-root-spec.md`, section 14). This skill plans how one begins and checks whether it is done. It reports in chat. It creates no status file, edits nothing and writes no code.

The request: $ARGUMENTS

If the request is not `start` or `close` followed by a milestone from M0 to M8, ask me which. Always name a milestone in plain words with its label from section 14, for example "M1 Ledger: onboarding and profile, Transactions, demo data".

M8 holds the Stretch items. Plan or close it only if I ask for it by name.

## Start

1. **What the milestone builds.** Read its row in section 14 of the root spec, and the "Writing order" list under it.
2. **Which specs and which parts.** Run `grep -rn "^| Milestone" docs/features docs/platform` and keep the specs whose cell names this milestone. A spec can span several milestones, so read its Milestone cell and section 2 (scope) to find the part that belongs here, and any stand-ins it uses until a later milestone supplies the real thing.
3. **Size.** For each spec part, count its business rules and acceptance criteria, and how many criteria are unit, integration and E2E.
4. **Prerequisites.** Read each spec's "Depends on". For every dependency from an earlier milestone, look in `src/` and the code for what it would have produced, and say whether it exists.
5. **Order.** Put platform parts before the features that depend on them, and a dependency before what needs it.
6. **Packages.** List the packages the milestone's specs expect (root spec section 13, and each spec's notes), as candidates. Don't install anything; `implement-feature` adds them with reasons.
7. **Success criteria.** Section 15 of the root spec lists twelve. The release checklist in `docs/platform/P3-observability-performance-quality.md` (search for "Release checklist") maps each one to the acceptance criteria that prove it. List the criteria this milestone helps prove.

Report:

- A table: spec, the part in this milestone, rule count, criterion count, depends on, and whether the prerequisite exists.
- The build order, and the first command to run, such as `/implement-feature P2 foundation`.
- Stand-ins and risks to watch, and anything unclear.
- The success criteria within reach, and what is left to a later milestone.

Then ask me where to start.

## Close

1. **Scope.** Use steps 1 and 2 of Start to get the specs and parts.
2. **Acceptance criteria.** For each spec part, list the criteria that belong to this milestone. Leave out any that depend on a later milestone, and say so.
3. **Coverage.** Search the tests (`**/tests/**`) for each criterion ID and mark it Covered, Weak or Missing. Read the test when you cannot tell. For depth on one spec, tell me to run `spec-review` on it.
4. **Checks.** Run the `ci-check` skill in full, then `pnpm docs:check`. Never say the milestone is ready if a check failed or did not run.
5. **Success criteria.** For each criterion this milestone is responsible for, say whether it can be demonstrated now, and how: a passing test, or manual steps for me. Don't claim it without evidence.
6. **Open items.** Run `grep -n "| Assumed" docs/02-decisions.md` and list the decisions still waiting for my confirmation. List the stand-ins that a later milestone must replace, and any spec changes made during the milestone.

Report:

- A verdict: Ready to close, or Not ready, with the blockers.
- Coverage by spec as counts of Covered, Weak and Missing, with the Missing and Weak ones named.
- The check results.
- Success criteria: demonstrable, not yet, or by hand.
- The Assumed decisions to confirm, and what carries forward.

Don't write commit or pull request text unless I ask.

## Keep this skill current

When a status file or a GitHub milestone becomes the place where progress is tracked, update the close step to point there.
