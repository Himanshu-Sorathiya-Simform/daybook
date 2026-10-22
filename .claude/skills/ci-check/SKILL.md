---
name: ci-check
description: "Run the project's CI checks (lint, format, typecheck, tests, build) and report exactly what passed, failed or was not run. Use before saying any work is done, and whenever I ask to verify or check the work."
argument-hint: "[quick]"
---

# CI check

The definition of done for this repo. It mirrors CI (`.github/workflows/ci.yml`), so a green result here means CI should be green.

Files with changes right now:

!`git status --short`

## Steps

If `node_modules` is missing, as in a fresh worktree, run `pnpm install --frozen-lockfile` first.

Run these in order, with the Bash timeout raised to 5 minutes. Run every one even when an earlier one fails, so the report is complete. A result from before your latest edit is stale; run the check again.

1. `pnpm lint`
2. `pnpm format:check`
3. `pnpm typecheck`
4. `pnpm test:run`
5. `pnpm build`. Skip it when the argument is `quick`, or when typecheck failed, since it would fail the same way. Say so in the report.

## Not run locally

- Database suites (integration, RLS) run in CI on a Postgres service container, because there is no local Postgres. If `package.json` has scripts for them, such as `test:integration` or `test:rls`, don't run them; list them as "CI only".
- Browser tests (`e2e/`, a `test:e2e` script) run only when I ask.
- Tests tagged `@stripe` or `@sanity` are hand-run before a release, never part of verify.

## Report

Give a table with the columns Check, Result and Detail. Result is Passed, Failed, or Not run with the reason. For a failure, give the file, the line and the first error message, never the whole log.

Then one closing line: "All checks passed", or how many failed. Say "done" or "ready" only when every check passed in this run. After a quick run, say "passed, build not run".

## When something fails

- Never change a test, an assertion, a lint rule or a config file just to get a green run. If a check looks wrong, say why and ask me.
- Fix failures your change caused, then run verify again from the start.
- A failure in a file that is not in the list of changed files above may already exist. Report it as existing, and don't fix unrelated code.
- For a format failure, run `pnpm exec prettier --write` on the changed files only. Never run `pnpm format`; it rewrites every file in the repo.

## Keep this skill current

When CI gains a step, or a new local suite appears, add it to the steps or to the not-run list, so verify keeps mirroring CI.
