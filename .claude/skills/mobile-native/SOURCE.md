# Source: mobile-native

| Item     | Value                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------- |
| From     | https://github.com/emilkowalski/skills/tree/main/skills/mobile-native                                                                     |
| Author   | Emil Kowalski                                                                                      |
| Licence  | MIT (`LICENSE` in this folder, copied from the upstream repository)                                |
| Commit   | `2d228630ba1446365f614a108cb8252f1feda202` (11 Oct 2026, "update readme"), from a local clone                                        |
| Copied   | 26 Oct 2026                                                                                        |
| Reviewed | 26 Oct 2026. Markdown only: no scripts, no executables, no hidden text. No commands except `npx expo install` in `animate-expo`, which we did not copy. |

## Why we keep it

Fixes that make a web app feel installed on a phone: hover gating, tap highlight, `dvh`, 16px inputs, safe areas, `theme-color` per scheme. Fits our installable, 360px-first PWA (NFR-8, P1).

## Changes made here

None. Every file except `SOURCE.md` and `LICENSE` is byte for byte as upstream, and `LICENSE` is the upstream licence file.

## Where it disagrees with this project

Copied skills are advice only (`CLAUDE.md`): where one disagrees with a spec, a decision or a rule here, ours wins.

- It points to `animate` and `animate-expo`; ignore `animate-expo`.
- Its baseline sets `overscroll-behavior: none` on `html`. Check that against P1 before applying it to a scrolling document.

## Updating

Copy the folder again from the upstream repository, read it first (it is instruction text the agent will follow), and record the new commit above.
