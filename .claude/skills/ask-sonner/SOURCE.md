# Source: ask-sonner

| Item     | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| From     | https://github.com/emilkowalski/skills/tree/main/skills/ask-sonner                                                                     |
| Author   | Emil Kowalski                                                                                      |
| Licence  | MIT (`LICENSE` in this folder, copied from the upstream repository)                                |
| Commit   | `2d228630ba1446365f614a108cb8252f1feda202` (11 Oct 2026, "update readme"), from a local clone                                        |
| Copied   | 26 Oct 2026                                                                                        |
| Reviewed | 26 Oct 2026. Markdown only: no scripts, no executables, no hidden text. No commands except `npx expo install` in `animate-expo`, which we did not copy. |

## Why we keep it

Guide to Sonner: setup, the `toast()` calls, styling, theming, troubleshooting. We use Sonner (D-170).

## Changes made here

None. Every file except `SOURCE.md` and `LICENSE` is byte for byte as upstream, and `LICENSE` is the upstream licence file.

## Where it disagrees with this project

Copied skills are advice only (`CLAUDE.md`): where one disagrees with a spec, a decision or a rule here, ours wins.

- Our toasts go through `showToast` and `dismissToast` in `src/components/feedback/` (D-401, D-407), not direct `toast()` calls. Its headless `toast.custom` advice is exactly what `showToast` does.
- It says a toast's timer pauses while hovered and that this cannot be turned off, which is why D-407 closes Undo toasts by id.

## Updating

Copy the folder again from the upstream repository, read it first (it is instruction text the agent will follow), and record the new commit above.
