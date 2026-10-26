# Source: animate

| Item     | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| From     | https://github.com/emilkowalski/skills/tree/main/skills/animate                                                                     |
| Author   | Emil Kowalski                                                                                      |
| Licence  | MIT (`LICENSE` in this folder, copied from the upstream repository)                                |
| Commit   | `2d228630ba1446365f614a108cb8252f1feda202` (11 Oct 2026, "update readme"), from a local clone                                        |
| Copied   | 26 Oct 2026                                                                                        |
| Reviewed | 26 Oct 2026. Markdown only: no scripts, no executables, no hidden text. No commands except `npx expo install` in `animate-expo`, which we did not copy. |

## Why we keep it

Builds an animation from scratch: should it animate, why, which tool, properties, curve, duration, interruption. Fits our rule that motion only follows an action.

## Changes made here

None. Every file except `SOURCE.md` and `LICENSE` is byte for byte as upstream, and `LICENSE` is the upstream licence file.

## Where it disagrees with this project

Copied skills are advice only (`CLAUDE.md`): where one disagrees with a spec, a decision or a rule here, ours wins.

- It points to `pick-ui-library`, `improve-animations` and `animate-expo`, which we did not copy. Ignore those pointers; the stack is fixed (`docs/00-brief.md`).
- It names `cubic-bezier(0.23, 1, 0.32, 1)` and Motion (`motion.dev`). Our curve is `--ease-out` and our durations are `--dur-fast`, `--dur-base` and `--dur-layout` in `src/styles/space.css` (D-387), and Motion is not in the stack. Its own rule 3 says to extend the codebase's tokens, so use ours and add no library.
- A press `scale(0.97)` and other motion not in the design (Claude Design) needs the design owner's yes before it goes in.

## Updating

Copy the folder again from the upstream repository, read it first (it is instruction text the agent will follow), and record the new commit above.
