---
name: generate-pr
description: "Write the title and description for a pull request from the branch's commits and changes, using the repository's pull request template. Only when I ask. Text only: it never pushes, opens or edits a pull request."
argument-hint: "[base branch]"
disable-model-invocation: true
---

# Generate a pull request description

This skill writes the pull request text for me to paste. I open the pull request myself. It runs only when I ask, and it never pushes, commits, opens a pull request or uses `gh`.

Base branch: $ARGUMENTS (use `main` when none is given)

Where we are now:

!`git status --short --branch`

## 1. Gather, read only

1. Confirm the base branch exists. If `main` is not a local branch, look at `git branch -a` for `origin/main`, and say which one you used.
2. Run `git log <base>..HEAD --oneline`, then read the full messages of those commits, then `git diff <base>...HEAD --stat`.
3. If no commit is ahead of the base, say there is nothing to put in a pull request and stop.
4. Uncommitted and untracked files from the status above are not in the pull request. If there are any, say so at the end.
5. Read `.github/pull_request_template.md`. It decides the shape of the description. If it is missing, tell me and stop.

## 2. Look at what matters

Read these parts of the diff, not all of it:

- `package.json`: every dependency added, removed or updated. The project requires a reason for each. If no commit message gives one, ask me.
- `docs/02-decisions.md`: new or changed decision rows, with their IDs and status. Note the Assumed ones, which wait for my confirmation.
- The specs under `docs/` that changed, and whether code behavior changed without a matching spec change.
- Migrations under `drizzle/`, new or changed environment variables, and changes under `.claude/` or `.github/`.
- The tests that were added or changed.
- Whether the change touches the UI, money or time, data access or security, offline behavior, or payments. This decides which checklist groups stay.

## 3. Things to consider

- What changes for the user or the developer, and why.
- Checks: say which of `pnpm lint`, `format:check`, `typecheck`, `test:run`, `build` and `docs:check` ran, and the result. Never write that a check passed unless it ran in this session after the last change. If it did not, write "not run" and tell me.
- Tests that cannot run locally, such as database tests, which run in CI first.
- New migrations, environment variables or secrets, and anything security related.
- Known gaps, work left for later, and breaking changes.

## 4. Write it

**Title:** always write one. It is `type: short imperative summary`, at most 72 characters, with type one of feat, fix, refactor, perf, test, docs, chore, ci, build.

The title names the work of the whole branch, not its last commit:

1. List every commit from step 1 and group them by purpose.
2. Name the one purpose that covers the most of the diff. That is the title, and its type is the type of that main change.
3. Never copy a commit message. If the title you wrote is the same as any single commit's subject, rewrite it so it covers the whole branch.
4. If the branch has several unrelated purposes, still pick the main one, and say in the note after the text that the branch mixes concerns and may need splitting.

**Description:** start from the template and keep its headings and order. Remove its HTML comments, which are instructions to the author. Fill the sections like this:

- **Summary:** one to three sentences, leading with the why.
- **Context:** the milestone, the feature spec path, and the related decision. Write "None" where nothing applies, and don't guess a milestone.
- **What changed:** bullets by area, not by file. Call out anything non-obvious: new tables, routes, environment variables, changed query shapes.
- **Screenshots / recordings:** if the UI changed, keep the section and write "Needs your screenshots (mobile width, dark theme)". Otherwise delete it.
- **How I tested:** the steps that were actually run, the user state used, and the expected result. Say what did not run.
- **Self-review checklist:** keep only the groups that apply, as the template says, and delete the rest. Leave every box unticked. Ticking is my own review.
- **Migrations and rollout:** fill it when there are migrations, backfills or new setup, otherwise delete it.
- **Notes:** trade-offs, each dependency change with its reason, Assumed decisions waiting for my confirmation, accepted findings, and follow-ups. Never the state of uncommitted local files; those go in the note after the text (step 5).

## 5. Output

Give exactly two blocks, in this order, each with its label above it:

1. **Title:** the title on one line in its own code block. Never leave it out. If you cannot write a title, say why instead.
2. **Description:** the description in a second markdown code block, ready to paste.

Before you answer, check that the title exists, is at most 72 characters, follows the format, and is not the subject of any single commit. Then, in a few lines:

- the checklist boxes you have evidence for, such as checks that ran in this session, so I can tick them;
- anything you could not determine, such as a missing reason for a dependency;
- any uncommitted files.

## Rules

- Always give a title, and base it on the whole branch, never on the latest commit alone.
- No attribution lines of any kind, such as "Generated with" or "Co-Authored-By".
- Write only about what is in the diff. Never invent a reason, a result or a file.
- Never tick a checklist box.
- Never include a secret, a token or the contents of an environment file.
- Keep it short and plain. Don't explain how the work was done.

## Keep this skill current

When the template's headings change, update step 4 to match.
