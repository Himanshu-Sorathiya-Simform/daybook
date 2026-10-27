---
paths:
    - "**/tests/**"
    - "**/*.test.{ts,tsx}"
    - "vitest.config.mts"
    - "vitest.setup.ts"
---

# Writing and running tests

## Where tests live

- A folder's tests live in a `tests/` folder inside it, with the same file name plus `.test` before the extension. `src/features/transactions/tests/x.test.tsx` covers `src/features/transactions/x.tsx`.
- Browser tests (Playwright) live in `e2e/` at the repo root. Vitest skips that folder.

## How to write them

- Import `test`, `expect` and the rest from `vitest`; globals are off. Use `test`, and `describe` only to group related tests.
- One behavior per test, named in plain English for what is expected.
- Query by role or label first, as a user would, and drive interaction with user-event.
- A test that proves an acceptance criterion has its ID in a comment directly above it, for example `// AC-F03-04`.
- Never depend on the real clock. Use the golden clock, 2026-11-02T12:00:00+05:30, as the fixed "now" (TST-3).
- When numbers matter, take the data from `docs/03-golden-dataset.md`. Any random data must be seeded.

## What to fake

- Fake only at the edges: the network with MSW, and outside services such as Stripe and Sanity.
- Never `vi.mock` our own modules or the database. Server tests use a real Postgres.
- Automated tests never call Stripe or Sanity. Only hand-run tests tagged `@stripe` or `@sanity` do.

## Bugs and failing tests

- To fix a bug, first write a test that reproduces it and show it failing. Then fix it and show it passing. If no test can reproduce the bug, say why and ask me.
- Never weaken an assertion, skip a test (`.skip`), focus one (`.only`) or delete one to get a green run. If a test looks wrong, tell me why and ask.
- Report a failing test you didn't cause by name; never hide it.

## Running

- While working, run only the tests for the file you changed: `pnpm test:run <path>`. Before saying work is done, run the full `pnpm test:run`.
- Never run `pnpm test`; it is watch mode and never exits.
- `pnpm test:coverage` runs every test once and lists the lines and branches of `src/components`, `src/lib` and `src/server` that no test reaches. Use it to find what is untested; a covered line is not yet a tested behaviour, so test states and props, not only lines.
