# Source: review-animations

| Item     | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| From     | https://github.com/emilkowalski/skills/tree/main/skills/review-animations                                                                     |
| Author   | Emil Kowalski                                                                                      |
| Licence  | MIT (`LICENSE` in this folder, copied from the upstream repository)                                |
| Commit   | `2d228630ba1446365f614a108cb8252f1feda202` (11 Oct 2026, "update readme"), from a local clone                                        |
| Copied   | 26 Oct 2026                                                                                        |
| Reviewed | 26 Oct 2026. Markdown only: no scripts, no executables, no hidden text. No commands except `npx expo install` in `animate-expo`, which we did not copy. |

## Why we keep it

Strict reviewer of motion code against ten standards. Manual only (`disable-model-invocation: true`), so it adds nothing to the skill list.

## Changes made here

None. Every file except `SOURCE.md` and `LICENSE` is byte for byte as upstream, and `LICENSE` is the upstream licence file.

## Where it disagrees with this project

Copied skills are advice only (`CLAUDE.md`): where one disagrees with a spec, a decision or a rule here, ours wins.

- Its `STANDARDS.md` asks for the `cubic-bezier(0.23, 1, 0.32, 1)` curve. Our `--ease-out` token wins (D-387).
- It flags `transform-origin: center` on popovers. Ours fade with no scale, so that finding is a design question, not a defect.

## Updating

Copy the folder again from the upstream repository, read it first (it is instruction text the agent will follow), and record the new commit above.
