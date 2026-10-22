# Source: composition-patterns

| Item     | Value                                                                                                                         |
| -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| From     | https://github.com/vercel-labs/agent-skills/tree/main/skills/composition-patterns                                             |
| Licence  | MIT (stated in this skill's frontmatter and on the upstream repository)                                                       |
| Upstream | Latest commit touching this folder on 22 Oct 2026: `a5343bd997c4cc4d8bf2ca61021bdc74b4d6c9d5` (28 Jan 2026, "react19 ruels") |
| Copied   | 22 Oct 2026                                                                                                                   |
| Reviewed | 22 Oct 2026. No scripts, no network access, no load-time commands.                                                            |

## Changes made here

- Removed `AGENTS.md` (946 lines, a compiled duplicate of the rules that Claude Code loads when it reads a file in this folder), `README.md`, `metadata.json` and the rule templates.
- Edited `SKILL.md`: the name is `composition-patterns` (was `vercel-composition-patterns`), and the pointer to the compiled document is gone.

## Where it can disagree with Daybook

The examples use React Native names such as `TextInput` and `onPress`; read them as patterns, not as code to paste. The context-provider patterns are about component structure. Daybook's UI state lives in per-request Zustand stores and server data in TanStack Query, and those rules win (STATE-1, STATE-2).
