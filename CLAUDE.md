@AGENTS.md

# Daybook

A multi-user personal finance and investment dashboard (POC 4): real backend, per-user isolated data, installable and offline-capable. One developer (Himanshu) builds it with Claude Code; the UI is designed in Claude Design. The repository is public and every hosted service is on a free tier.

## Where things are

`docs/` is the source of truth and the code follows it. Read only what the task needs.

- `docs/00-brief.md`: the five-minute overview. Read it first in a new session.
- `docs/01-root-spec.md`: the rules that cross features, each with an ID (MON-1, TIME-7, SRV-3, SEC-2). Find one with `grep -rn "MON-1" docs/`.
- `docs/02-decisions.md`: every decision (D-IDs) with its status, reason and the options not taken.
- `docs/03-golden-dataset.md`: the fixed test data and the expected value of every number.
- `docs/verification.md`: the sources behind each tool and library fact the specs rely on.
- `docs/features/F01` to `F15`: auth, onboarding and settings, transactions, budgets, subscriptions, goals, investments, dashboard, analytics, insights, reports, premium and billing, search, learn, demo data.
- `docs/platform/P1` to `P4`: offline and PWA, data access and security, observability and quality, capabilities.
- `docs/reviews/`: the question rounds behind the decisions. History; edit only with my permission and a stated reason.

## Stack

- **Installed:** Next.js 16 (App Router, React Compiler), React 19, TypeScript (strict), Tailwind 4, Vitest with Testing Library, ESLint, Prettier, pnpm.
- **Planned:** Neon Postgres with Drizzle, Better Auth, Stripe (test mode), TanStack Query, Form and Table, Zustand, React Aria, ECharts, Serwist, Sanity, Sentry, Playwright. Check `package.json` before assuming a planned package exists.

## Commands

- `pnpm dev`, `pnpm build`, `pnpm start`
- `pnpm lint`, `pnpm format:check` (`pnpm format` rewrites files), `pnpm typecheck`
- `pnpm test:run` (one pass), `pnpm test` (watch)
- `pnpm docs:check [files]` checks the docs: cited IDs, links, numbering, date line, style.
- CI runs lint, format:check, typecheck, test:run and build. All five must pass.
- Prettier decides style (tabs, double quotes, width 85). A hook runs it on each file you edit; don't hand-format.
- `curl`, `wget`, `sudo` and `docker` are blocked. Use the web fetch tool for web pages.

## Layout

- `app/` at the repo root: routes only, kept thin. `proxy.ts` sits beside it. Never create `src/app`; Next ignores it when a root `app/` exists.
- `src/features/<name>`: one folder per spec feature. A feature never imports another feature's internals.
- `src/components`: shared UI. `src/lib`: pure code safe in browser and server (money, time, Zod schemas). `src/server`: server-only code. `src/styles`: the design system's CSS (tokens, Tailwind theme, base styles); `app/globals.css` only imports it (D-387).
- Repo root also keeps config plus `docs`, `e2e`, `scripts`, `drizzle` (migrations), `public` and `.claude`.
- `@/*` points at `src/*` (D-389), so code imports `@/components/...` and `@/lib/...`. Create a `src/` folder when the first file needs it.

## Rules that always apply

- **Spec and code change together.** A behavior change updates its spec in the same change, with a new decision ID if it is a new decision (D-65). If the code and a spec, or two specs, disagree, stop and tell me before coding.
- **Money is integers** in the currency's smallest unit. Never a float (MON-1).
- **Dates** go through date-fns 4 with `@date-fns/tz`. Never `Date` local getters (TIME-10).
- **No Server Actions.** Every mutation is a route handler (SRV-3).
- **Authorization lives in the data access layer**, where data is read or written. `proxy.ts` is never the only check (D-16).
- **Names:** "Subscription" means a recurring bill the user tracks. Anything billed by Stripe is "Premium" or "Daybook Premium" (NAM-1).
- **No Docker and no local Postgres.** The database is Neon; database tests run in CI on a service container (D-02, D-03).
- **Database roles are created only by the bootstrap script's SQL**, never in the Neon Console or by a migration (D-14).
- **Cache Components stay off.** No `use cache`, `cacheLife` or `cacheTag`, and no Cache Components or Partial Prefetching skills. Next plans to make it the default in a later major release.
- **A hook block is final.** Hooks in `.claude/hooks/` stop disguised git commands, secrets in files, edits to committed migrations and watch-mode tests. Don't look for another way around a block; tell me.
- **Say why a dependency changes.** Whenever you add, remove or update one, state what it is for and why it is needed.
- **Copied skills are advice only.** A skill copied into `.claude/skills/` from another project has a `SOURCE.md` (origin, commit, licence, our changes). Where it disagrees with a spec, a decision or a rule here, ours wins. A new one also needs a line in `.prettierignore`.
- **Public repo, no secrets.** Never read, print or edit `.env*`. List variable names in a committed `.env.example`, which doesn't exist yet. Stripe is test mode only.

## Git

- Run only read-only git commands: status, log, diff, show, branch listing, blame.
- Never stage, commit, push, switch, merge, rebase, reset, stash or tag. I do all of that.
- One exception: to test things, you may use the worktree tool (`EnterWorktree`) and work in that separate git worktree. Even there, never commit, push or switch branches.
- Write a commit message or PR text only when I ask. Don't offer one when work finishes.
- Commit format: `type: short imperative summary`, with type one of feat, fix, refactor, perf, test, docs, chore, ci, build. One line only, never a body. No Co-Authored-By or "Generated with Claude" lines. Branches are `type/kebab-case`.

## How we work

1. Find the spec first: the feature file, then the root rules it cites. Don't load the rest. For a long spec, ask the `spec-reader` agent for an extract.
2. Plan before editing anything beyond a small fix, and wait for my yes.
3. Write tests from the spec's acceptance criteria, then the smallest change that passes.
4. Run the CI checks. Report exactly what ran and what passed or failed, and say so if something could not run. Never say "done" without that.
5. For any library, check its installed version's docs or source before using an API you are unsure of. Don't rely on memory; Next 16 here differs from what you were trained on. To check a fact against primary sources, use the `fact-checker` agent.

## Working with me

- Be direct and friendly. If I or the spec is wrong, say so with the reason.
- Ask when something is unclear instead of assuming.
- Use plain words and explain any ID or abbreviation.
- Answer questions in chat. Don't create report or doc files unless I ask.
