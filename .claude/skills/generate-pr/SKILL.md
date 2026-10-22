---
name: generate-pr
description: "Write the title and description for a pull request from the branch's commits and changes. Only when I ask. Text only: it never pushes, opens or edits a pull request."
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

## 2. Look at what matters

Read these parts of the diff, not all of it:

- `package.json`: every dependency added, removed or updated. The project requires a reason for each. If no commit message gives one, ask me.
- `docs/02-decisions.md`: new or changed decision rows, with their IDs and status. List the Assumed ones for the reviewer to confirm.
- The specs under `docs/` that changed, and whether code behavior changed without a matching spec change.
- Migrations under `drizzle/`, new or changed environment variables, and changes under `.claude/` or `.github/`.
- The tests that were added or changed.

## 3. Things to consider

Mention a point in the text only when it applies:

- What changes for the user or the developer, and why.
- Spec and decisions: which specs changed, which decisions are new, which are waiting for my confirmation.
- Checks: say which of lint, format, typecheck, tests and build ran, and the result. Never write that a check passed unless it ran in this session after the last change. If it did not, write "not run" and tell me.
- Tests that cannot run locally, such as database tests, which run in CI first.
- New migrations, environment variables or secrets, and anything security related.
- Known gaps, work left for later, and breaking changes.

## 4. Write it

If `.github/pull_request_template.md` exists, follow it. Otherwise use this shape and leave out any section that does not apply, except Summary and Changes:

- **Title:** `type: short imperative summary`, at most 72 characters, with type one of feat, fix, chore, docs, ci, test, refactor. Pick the type of the main change.
- **Summary:** one to three sentences on what and why.
- **Changes:** bullets by area, not by file.
- **Spec and decisions:** the specs changed, and each new decision as its ID, status and one sentence.
- **Tests and checks:** what was added, which checks ran and their result, and what did not run.
- **Dependencies:** each one with its reason.
- **Notes for the reviewer:** where to look, risks, and anything to confirm.
- **Follow-ups:** known gaps and planned next steps of the project. Never the state of uncommitted local files; those go in the note after the text (step 5).

## 5. Output

Give the title in one code block and the description in a second markdown code block, ready to paste. Then list in a few lines anything you could not determine, such as a missing reason for a dependency, and any uncommitted files.

## Rules

- No attribution lines of any kind, such as "Generated with" or "Co-Authored-By".
- Write only about what is in the diff. Never invent a reason, a result or a file.
- Never include a secret, a token or the contents of an environment file.
- Keep it short and plain. Don't explain how the work was done.

## Keep this skill current

When `.github/pull_request_template.md` is added, remove the default shape in step 4 and follow the template.
