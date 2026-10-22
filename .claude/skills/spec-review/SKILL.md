---
name: spec-review
description: "Review the current code changes against the spec they implement. Runs the spec-conformance-reviewer agent, checks each of its findings yourself, and reports. Reports only; never edits. Use after building or changing a feature, or when I ask for a review against the spec."
argument-hint: "[F03 or P2] [what changed]"
---

# Spec review

An independent check that the code matches its spec and that the tests prove the acceptance criteria. This skill reports. It never edits anything.

The request: $ARGUMENTS

Where we are now:

!`git status --short --branch`

## 1. Scope

- **The spec:** the feature or platform spec named above. If none is named, infer it from the branch name and the changed paths, and say what you inferred. If you cannot tell, ask me.
- **What changed:** unless I say otherwise, everything that differs from `main` (`git diff main...HEAD --stat`) plus uncommitted and untracked files from the status above.
- **The part:** the part of the spec that was built. If I did not say, use the whole change.
- If nothing changed, say so and stop.

## 2. Run the reviewers

Start the `spec-conformance-reviewer` agent with the Agent tool. It does not see this conversation, so its task message must say: the spec ID, how to find the change (the git commands from step 1, or the file paths), and the part that was built.

If `.claude/agents/isolation-security-reviewer.md` exists and the change touches `src/server`, `proxy.ts`, `drizzle`, authentication, billing or any route handler, start it in the same step so the two run together.

## 3. Check every finding yourself

A reviewer's report is information, not a verdict, and reviewers can be wrong. For each finding, read the code it points to and the spec text it cites. Mark it:

- **Confirmed:** the code or test really departs from the spec.
- **Wrong:** say in one line why, for example the reviewer misread the code or the spec allows it.
- **Cannot tell:** say what is missing, for example a test that needs a database and cannot run here.

Do not add findings of your own that the reviewer did not raise, unless you saw them while checking. Mark those as yours.

## 4. Report

- **Verdict:** Conforms, Does not conform, or Cannot tell.
- **Confirmed findings,** most serious first, in a table with severity, file and line, the spec reference, what is wrong and the fix.
- **Dropped findings,** one line each with the reason.
- **Acceptance criteria coverage:** each criterion and the test that carries its ID, or "none".
- **Spec problems,** kept apart from code findings. These need a decision from me and then the `spec-change` skill. Never decide them yourself.
- **Not checked,** and why.

Do not edit code, tests or docs in this skill.

## After the report

When another skill, such as `implement-feature`, called this one: the caller fixes the confirmed findings that are Blockers, Gaps, Weak tests or Scope creep, then runs this skill again on the same scope. Do at most three rounds, and stop sooner when no Blocker or Gap is left.

When I called it directly: wait for me to say what to fix.

## Keep this skill current

When another reviewer agent is added to `.claude/agents/`, add it to step 2 with the paths that trigger it.
