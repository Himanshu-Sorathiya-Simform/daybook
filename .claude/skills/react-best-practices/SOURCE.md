# Source: react-best-practices

| Item           | Value                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| From           | https://github.com/vercel-labs/agent-skills/tree/main/skills/react-best-practices                                                      |
| Licence        | MIT (stated in this skill's frontmatter and on the upstream repository)                                                                |
| Upstream       | Latest commit touching this folder on 22 Oct 2026: `dc8367e6f91c022d83361f03c3313fa05e848ee5` (14 Apr 2026, "update example")          |
| Copied         | 22 Oct 2026                                                                                                                            |
| Reviewed       | 22 Oct 2026. No scripts, no network access, no load-time commands. Two rule examples mention `npx svgo`, which only runs if you do it. |

## Changes made here

- Removed `AGENTS.md`, `README.md`, `metadata.json` and the rule templates. The compiled `AGENTS.md` (3,810 lines) duplicates the rules, and Claude Code loads an `AGENTS.md` when it reads a file in the same folder.
- Removed 7 rules that contradict Daybook's decisions:
  - `client-swr-dedup` and `client-event-listeners` (they use SWR; Daybook uses TanStack Query);
  - `rerender-memo`, `rerender-memo-with-default-value` and `rerender-simple-expression-in-memo` (manual memoization; the React Compiler is on, D-08);
  - `server-cache-lru` (a cross-request cache; per-user data is never shared through a cache);
  - `server-auth-actions` (Server Actions are not used, SRV-3).
- Edited `SKILL.md`: the name is `react-best-practices` (was `vercel-react-best-practices`), the rule count is 63, the removed rules are gone from the quick reference, and a note says Daybook wins on any disagreement.

## Where it can still disagree with Daybook

Several remaining rules mention `useMemo`, `useCallback` or `memo` in passing. With the React Compiler on, Daybook allows manual memoization only for ECharts options, heavy derivations and Zustand selectors (D-08).
