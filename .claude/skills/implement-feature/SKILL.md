---
name: implement-feature
description: "Build a feature, or one part of it, from its spec: preflight, a plan I approve, tests from the acceptance criteria, one slice at a time, then checks. Run it as /implement-feature F03 or P2, optionally followed by the part to build."
argument-hint: "[F03 or P2] [part to build]"
disable-model-invocation: true
---

# Implement a feature

The spec decides what to build. This is the procedure for building it. The rules in `CLAUDE.md` and in `.claude/rules/` apply throughout.

The request: $ARGUMENTS

If no feature or platform spec is named above, ask me which one before doing anything.

Where we are now:

!`git status --short --branch`

## 1. Preflight (read only, no edits)

1. Find the spec: `docs/features/Fnn-*.md` or `docs/platform/Pn-*.md`. If a `spec-reader` agent exists in `.claude/agents/`, use it for the reading below and ask for an extract.
2. Read the header table first: Milestone, Plan, Depends on, Decisions. A feature can span milestones, so build only the part I name, or the part that belongs to the milestone I am working on.
3. Read sections 1 to 5, then the sections the part needs from 6 to 11 and 13. Read section 14 (acceptance criteria) for the part in full, and section 12 for what it affects elsewhere. Read sections in pieces; don't load a whole long spec at once.
4. Read each root rule the spec cites (`grep` the ID in `docs/01-root-spec.md`), the rows of the decisions it lists, and the golden dataset rows its examples use.
5. Build only what is in the "In" column of section 2. Anything marked Stretch or Out is not built unless I ask.
6. Check the prerequisites in "Depends on". Look in `src/` for the code they would have produced. If another feature or platform part that this part needs is not built, stop and tell me; don't build it inside this feature. Missing npm packages are not a prerequisite: list them in the plan with the reason for each, and add them when the plan is approved.
7. If the code and the spec disagree, or two specs do, stop and tell me before coding.
8. If the branch above is `main`, tell me to create a branch before you edit anything.
9. If `src/` does not exist yet, the first slice must create it, and the `@/*` path alias in `tsconfig.json` has to point at `src/` instead of the repo root. The one existing test imports `@/app/page`. Tell me before you change `tsconfig.json`.

## 2. The plan (wait for my yes)

Write the plan in chat and wait for my approval before editing anything:

- **Part:** what is in, and what is left for later.
- **Slices:** vertical, in build order. A slice is one thin piece that works from the data to the screen. Shared pure code goes first (money, time, schemas), then server, then client.
- **For each slice:** the files to create, in the layout from `CLAUDE.md`; the acceptance criteria it covers, by ID; which test type proves each one; and what it needs from other features.
- **Packages to add**, each with the reason it is needed. Check the spec's stack notes and `docs/verification.md` for the version it expects.
- **Spec changes** you expect, and any new decision.
- **Risks and anything the spec leaves unclear.** Ask me about those now. Never guess.

## 3. Build one slice at a time

For each slice:

1. **Tests first.** Write the tests for its criteria, with each ID in a comment above the test, as the testing rule says. Run them and show them failing for the right reason, such as a missing function or a wrong value, not a typo.
2. **Smallest code that passes.** Follow the spec's rules, messages and states exactly. Don't add behavior the spec doesn't ask for, and don't refactor unrelated code.
3. **Run the slice's tests**, then `pnpm lint` and `pnpm typecheck`. Fix what your change broke.
4. **Spec drift.** If building showed that the spec is wrong or silent, stop and use the `spec-change` skill. The spec changes in the same change as the code.
5. **Tests that cannot run here.** There is no local Postgres. Write database tests as the testing rule says, then say plainly that they did not run locally and that CI will run them first. Never say a test passed that you did not run.
6. **Report the slice** in a short table: what now works, which criteria are covered, which tests ran and the result, and what did not run. Then stop and wait for my go-ahead for the next slice. If I said to run the whole feature, continue instead.

## 4. Finish

1. **Coverage.** List every acceptance criterion of the part against the test that carries its ID. Name the ones with no test and why (for example, a browser test not written yet).
2. **Effects elsewhere.** Walk section 12 of the spec and confirm each effect is handled or say what is left.
3. **Spec sync.** Everything that moved is recorded through `spec-change`, then run `pnpm docs:check` on the files you changed.
4. **All checks.** Run the `ci-check` skill in full, including the build.
5. **Review.** Run the `spec-review` skill on the changes. Fix the confirmed findings that are Blockers, Gaps, Weak tests or Scope creep, then run it again. Do at most three rounds. Leave anything it marks as a spec problem for me.
6. **Final report.** What was built, by slice; criteria covered and not covered; new decisions marked Assumed, for me to confirm; spec changes; the check results; what is left or unclear. Don't write commit text unless I ask.

## Rules for the whole run

- Never weaken a test, an assertion or a config to get a green run.
- Say why whenever you add, remove or update a dependency.
- Don't edit configuration files, `docs/reviews/` or the golden dataset without asking first.
- Take example values from the golden dataset. Money is integers, dates go through the project's date library, and authorization lives in the data access layer.
- A hook block is final. Tell me instead of working around it.
- Flag existing code that doesn't follow a rule in one line. Don't fix it unless it is part of this feature.

## Keep this skill current

When the project gains a new kind of test or check, add it to steps 3 and 4. Remove step 9 of the preflight once `src/` and its path alias exist.
