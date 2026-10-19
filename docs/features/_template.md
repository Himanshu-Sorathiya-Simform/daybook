# F00 Feature name

DD Mon YYYY · @Himanshu

<!--
How to use this template
- Copy to features/Fnn-name.md (or platform/Pn-name.md) and fill every section.
- A section that does not apply says "None" with one line of why; never delete a section.
- No questions, open items or "to decide" notes: every rule is stated as it applies.
  Questions are asked in chat; answers become decisions in 02-decisions.md.
- Rule IDs: BR-Fnn-01, BR-Fnn-02, ... Cite root rules by their IDs (MON-3, TIME-7).
- Worked examples come from 03-golden-dataset.md.
- Payload shapes and sketches are illustrations, not schemas.
- Delete this comment block when the spec is written.
-->

One paragraph: what the feature does for the user and why it exists.

| Item | Value |
| --- | --- |
| Milestone | M? |
| Plan | Free, Premium, or both (name the capability codes) |
| Depends on | Specs this one builds on |
| Decisions | D-IDs this spec implements |

## 1. User stories

- As a user, I want ..., so that ....

## 2. Scope

| In | Stretch (M8) | Out |
| --- | --- | --- |
| | | |

## 3. Concepts and fields

| Field | Meaning | Required | Rules | Example |
| --- | --- | --- | --- | --- |
| | | | | |

## 4. Business rules

- **BR-Fnn-01** ...

## 5. Calculations

Each formula, with a worked example from the golden dataset.

## 6. Screens and states

For each screen: purpose, sections, actions. Then the state matrix:

| State | What the user sees |
| --- | --- |
| Loading | |
| Empty | |
| Error | |
| Offline | |
| Pending | |
| Locked (Premium) | |
| Read-only | |

## 7. Flows

Numbered steps for each flow, including every failure branch.

## 8. Validation and messages

| Field or action | Rule | Message shown |
| --- | --- | --- |
| | | |

## 9. Plan gating

The capability codes, what the server refuses (status and error code), and what the client shows.

## 10. Offline behavior

What is readable offline, what can be written, how it queues, and how conflicts and rejections appear.

## 11. Server surface

| Endpoint | Method | Input | Output | Errors | Idempotency and versioning |
| --- | --- | --- | --- | --- | --- |
| | | | | | |

## 12. Cross-feature effects

What this feature invalidates or feeds (queries, widgets, insights, reports, search).

## 13. Edge cases

- ...

## 14. Acceptance criteria

- **AC-Fnn-01** (unit | integration | E2E) Given ..., when ..., then ....

## 15. Illustrations

Rough UI sketches or payload shapes, each labelled "Illustrative".
