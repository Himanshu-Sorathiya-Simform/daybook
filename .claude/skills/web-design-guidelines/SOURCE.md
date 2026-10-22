# Source: web-design-guidelines

This skill has two upstream sources: the skill itself and the rules file it reads.

| Item           | Skill (`SKILL.md`)                                                                                                                                     | Rules (`guidelines.md`)                                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| From           | https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines                                                                     | `command.md` in https://github.com/vercel-labs/web-interface-guidelines                                                             |
| Licence        | MIT (the upstream repository)                                                                                                                          | MIT (the upstream repository, confirmed through the GitHub API on 22 Oct 2026)                                                      |
| Upstream       | Latest commit touching this folder on 22 Oct 2026: `ba46938889d4e58635362fb8f618e1178ac3ec46` (16 Jan 2026, "Fix SKILL.md frontmatter formatting ...") | Latest commit on 22 Oct 2026: `4ecfb9fb8d1d3b7009674869b3aaee2f904042e1` (5 Oct 2026, "Add desktop overscroll guideline")           |
| Copied         | 22 Oct 2026                                                                                                                                            | 22 Oct 2026, from a clone of that repository. The exact commit of the clone was not recorded.                                       |
| Reviewed       | 22 Oct 2026. No scripts.                                                                                                                               | 22 Oct 2026. 191 lines: rules and an output format only. No URLs, no commands, no hidden text.                                      |

## Changes made here

- `SKILL.md` no longer fetches the rules from a `main`-branch URL on every run, which let a remote file steer the agent. It reads the local `guidelines.md`, and stops if that file is missing.
- `SKILL.md` tells the agent to ignore the command-style header of `guidelines.md` (its frontmatter and the `$ARGUMENTS` line), and to use the files named in the request.
- `guidelines.md` is unchanged from upstream.

## Updating the rules

To take newer rules, copy `command.md` from the upstream repository over `guidelines.md`, read it first (it is instruction text the agent will follow), and note the new commit here.
