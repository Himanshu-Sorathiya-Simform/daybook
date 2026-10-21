---
paths:
    - "docs/**"
---

# Writing and changing docs

## Voice

- US English. No em dashes in prose; use a comma, a colon or a new sentence. The "—" symbol is fine where a spec defines it as a display value.
- Plain, exact sentences. "Must" is required, "never" is forbidden, and "should" is a default that a feature spec may change only with a stated reason (root spec, section 1).
- "Subscription(s)" is the user-tracked recurring bill. Anything billed by Stripe is "Premium" or "Daybook Premium" (NAM-1).

## Specs

- A spec holds no questions, open items or "to decide" notes. Write the rule as it applies and ask questions in chat. Only files in `docs/reviews/` may hold questions.
- Start every feature and platform spec from `docs/features/_template.md`. Keep all 15 sections. For a section that doesn't apply, write "None" and one line saying why. Delete the template's comment block.
- Business rules are `BR-F03-01` (platform specs `BR-P2-01`), acceptance criteria are `AC-F03-01`. Cite root rules by ID (MON-3, TIME-7). A feature spec may narrow a root rule, never contradict it.
- Worked examples come from `docs/03-golden-dataset.md`. Label payload shapes and sketches "Illustrative". Draw diagrams as Mermaid.
- A new doc opens with `# Title`, then a line `DD Mon YYYY · @Himanshu` with today's date. Editing an existing doc leaves that date alone.

## The decisions log

- `docs/02-decisions.md` has one row per decision: ID, decision, status, why, ref. A new row goes under the section for its topic. Its ID continues from the highest D-number, which you find with grep.
- Status values: Decided (I confirmed it), Claude's call (I delegated it), Assumed (proposed, not yet confirmed), Stretch, Out.
- A decision made while building is Assumed until I confirm it. List it for me in chat.
- Never edit a Decided row without asking me first. If I agree, edit it in place and record the reason in that row.
- Options not taken go in the "Considered and not taken" tables at the end of the log.

## Other files

- `docs/reviews/` is history. Edit a file there only with my permission and a stated reason for the change.
- `docs/03-golden-dataset.md` holds the expected numbers every test relies on. Never change a number to make a test pass; ask me first.
- `docs/verification.md` records the sources behind tool and library facts. When a spec relies on a new one, add a row under the matching heading: opened the source page, ran code locally, search results only, or reasoning. Give the source link and the date checked.

## Before saying a docs change is finished

1. Every D-number, BR and AC you cite exists (check with grep).
2. Every relative link resolves to a file.
3. Section numbers run in order, and no rule ID appears twice.
4. `pnpm format:check` passes.
5. Report what you ran and anything that failed.
