---
name: spec-change
description: "Add or change anything under docs/ the way this project requires: a spec, a rule, a decision, the golden dataset, a verification row. Use for any request to write, change or fix a spec, rule or decision, and when code needs a spec to change with it."
argument-hint: "[what to change]"
---

# Spec change

The specs are the source of truth and code follows them. This is the procedure for changing them. The writing rules live in `.claude/rules/docs.md` and load when you touch `docs/`; apply them, don't restate them.

The change: $ARGUMENTS

If no change is stated above, ask me what to change before doing anything.

## 1. Name the kind of change

| Kind                                       | What it needs                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typo, wording or link fix, same behavior   | Edit it. No decision.                                                                                                                                                           |
| Clarifying an existing rule, same behavior | Edit the rule, then update every doc that repeats it.                                                                                                                           |
| New behavior no decision covers yet        | Edit the specs and add a decision (steps 3 and 4).                                                                                                                              |
| A new feature or platform spec             | Copy the template, add decisions, and update the root spec lists (step 4).                                                                                                      |
| Changing a decision marked Decided         | Stop. Ask me first, with the reason. If I agree, edit that row in place and record the reason in the row. No new decision ID. Then update every spec that states the old value. |
| Changing a golden dataset number           | Stop. Ask me first.                                                                                                                                                             |
| A new tool, library or platform fact       | Add a row to `docs/verification.md`. The `fact-checker` agent checks the fact and drafts the row.                                                                               |

If you can't tell which kind it is, ask me.

## 2. Find what is affected, before editing

- The owner of the change: cross-cutting rules are in `docs/01-root-spec.md`, a feature in `docs/features/Fnn-*`, a platform area in `docs/platform/Pn-*`, a decision in `docs/02-decisions.md`.
- Run `grep -rn` for the rule ID or key words across `docs/`, and read only the sections that cite or repeat it.
- Check where a change usually spreads: the root spec's route table (section 4), endpoint map (API-10), scripts and environment variables (section 13) and milestone and spec map (section 14); the Terms table; the feature's "Cross-feature effects" section; the Decisions row in the spec's header table; the golden dataset when a number moves.
- If the change contradicts another spec or a Decided decision, stop and tell me before editing. A feature spec may narrow a root rule, never contradict it.

## 3. Record the decision (new behavior only)

This step is for a decision that does not exist yet. A change to a Decided row is edited in place instead (step 1).

- Find the highest D-number with grep. The next number is the new ID. Never reuse or renumber one.
- Add the row under the section for its topic: ID, the decision, status Assumed, the reason in one sentence, and Ref. For a decision made while building, Ref is `Build`; the first time you use it, add it to the "Ref values" line at the top of the log.
- If you turned down an alternative worth remembering, add a row to the "Considered and not taken" table: the option, why not, and when to reopen it.

## 4. Edit the specs

- A business rule: the next BR number in that file (find the highest with grep), one rule per bullet, written as it applies.
- An acceptance criterion: the next AC number, tagged `(unit)`, `(integration)` or `(E2E)`, written as Given, when, then. Take example numbers from the golden dataset.
- Keep the section numbers in order, and add the new D-number to the Decisions row of the spec's header table.
- A new spec: copy `docs/features/_template.md`, keep all 15 sections, delete the comment block, and put today's date in the byline. Add it to the spec list in `docs/00-brief.md` and the milestone table in the root spec if it is not covered there.
- A behavior change updates its spec in the same change as the code. If code is also needed, say so; this skill does not edit code.

## 5. Check

- For a new spec, or a change that touches more than one spec, get an independent read. Start a fresh subagent with only the changed files and the root rules, and ask it for contradictions, gaps, missing IDs and anything that cannot be tested. Fix what is real. Repeat once if the fixes were large.
- Run `pnpm docs:check <changed files>` and `pnpm format:check`.
- A finding in a file you did not change may already exist. Report it and don't fix it.

## 6. Report

- The files you changed, one line each.
- Each new or changed decision: its ID, status and one sentence, so I can confirm the Assumed ones.
- What you checked, and what you could not check.
- What the change implies for code or tests, if anything.

Don't write commit text unless I ask.

## Never

- Edit anything in `docs/reviews/` without my permission and a stated reason.
- Change a Decided decision or a golden dataset number without asking first.
- Put a question, open item or "to decide" note in a spec. Ask me in chat instead.
