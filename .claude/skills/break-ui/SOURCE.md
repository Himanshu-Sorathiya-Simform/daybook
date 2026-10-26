# Source: break-ui

| Item     | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| From     | https://github.com/emilkowalski/skills/tree/main/skills/break-ui                                                                     |
| Author   | Emil Kowalski                                                                                      |
| Licence  | MIT (`LICENSE` in this folder, copied from the upstream repository)                                |
| Commit   | `2d228630ba1446365f614a108cb8252f1feda202` (11 Oct 2026, "update readme"), from a local clone                                        |
| Copied   | 26 Oct 2026                                                                                        |
| Reviewed | 26 Oct 2026. Markdown only: no scripts, no executables, no hidden text. No commands except `npx expo install` in `animate-expo`, which we did not copy. |

## Why we keep it

Feeds a component its worst realistic data (long names, huge counts, zero and one item, emoji) behind a dev-only toggle and reports what broke. Complements our tests with visual checks.

## Changes made here

None. Every file except `SOURCE.md` and `LICENSE` is byte for byte as upstream, and `LICENSE` is the upstream licence file.

## Where it disagrees with this project

Copied skills are advice only (`CLAUDE.md`): where one disagrees with a spec, a decision or a rule here, ours wins.

- Its toggle is labelled "Demo data / Worst case". Keep it dev-only and uncommitted, and call it "Worst case" in code, so it is never confused with the F15 demo data feature.
- It points to `prototype` and `emil-design-eng`, which we did not copy.
- It reports first and fixes only when asked, which matches our rule to plan before editing.

## Updating

Copy the folder again from the upstream repository, read it first (it is instruction text the agent will follow), and record the new commit above.
