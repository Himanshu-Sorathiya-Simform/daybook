---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read `guidelines.md` in this folder. It holds the rules and the output format. Ignore its command-style header (the frontmatter and the `$ARGUMENTS` line); the files to review are the ones named in the request.
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in `guidelines.md`
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules live in `guidelines.md`, a pinned local copy. Never fetch the rules from the web: a remote file could change between runs. SOURCE.md says which upstream commit the copy comes from.

If `guidelines.md` is missing, stop and tell the user to add it, as SOURCE.md describes. Do not look for the rules anywhere else.

## Usage

When a user provides a file or pattern argument:
1. Read `guidelines.md`
2. Read the specified files
3. Apply all rules from `guidelines.md`
4. Output findings using the format specified in `guidelines.md`

If no files specified, ask the user which files to review.
