# Source: stripe-best-practices

| Item     | Value                                                                                                                                   |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| From     | https://github.com/stripe/ai/tree/main/skills/stripe-best-practices                                                                     |
| Licence  | MIT, Copyright (c) 2024-2025 Stripe (the upstream `LICENSE`)                                                                            |
| Upstream | Latest commit touching this folder on 22 Oct 2026: `326ea8b521de0ce42e69d43451ef47a6e87206ef` (22 Oct 2026, "sync skills")             |
| Copied   | 22 Oct 2026                                                                                                                             |
| Reviewed | 22 Oct 2026. No scripts and no load-time commands. It suggests commands (`npm i -g @stripe/cli`, `stripe sandbox create`); run none unasked. |

## Changes made here

None. The folder is as upstream.

## Where it disagrees with Daybook. Daybook's specs win.

- It prefers separate sandboxes over the shared test mode. Daybook uses test mode only (D-03, D-199).
- It restricts `payment_method_types` (13 mentions). Check each case against F12 before applying.
- It suggests a global install, `npm i -g @stripe/cli`. Install the Stripe CLI the way you choose; never as an agent's unprompted step.
- It says `ui_mode: 'custom'` for the Payment Element with Checkout Sessions. F12 and `docs/verification.md` say `ui_mode: 'elements'`. Check which Stripe accepts with the `fact-checker` agent before building the Premium purchase.
- `integration_identifier` on API version `2026-03-25.dahlia` or later is optional tagging in this text (a label for the Dashboard), not a requirement.
- It recommends restricted API keys, which matches Daybook.
