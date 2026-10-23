---
paths:
    - "src/components/**"
---

# Shared components

## Where they live

- `src/components/<group>/<Name>.tsx`, one component per file, grouped as `actions`, `forms`, `surfaces`, `feedback`, `data`, `navigation`. A named export, and an exported `NameProps` type.
- Tests go in the group's `tests/` folder (testing rule): `src/components/forms/tests/Select.test.tsx` covers `src/components/forms/Select.tsx`.
- Pure logic (money formatting, category keys) belongs in `src/lib`, not in a component. A component imports it.
- A feature never imports another feature's internals, so a component used by two features lives here.

## Building them

- Interactive behavior comes from `react-aria-components` (D-168). Never hand-roll focus handling, keyboard support or ARIA attributes that it already provides. Components with no behavior of their own (badge, section, banner) stay plain markup.
- Don't write a React Aria component from memory. Read its types in `node_modules/react-aria-components/dist/types/src/<Name>.d.ts` for props and render props. For its parts and structure, ask me to paste its docs page, and name the component you need.
- Style with Tailwind classes from our tokens: `bg-page`, `text-ink-2`, `rounded-control`, `text-body`, `figures` on every amount. Never a hex value, a `--text-*` variable or a spacing override (D-387).
- No inline `style`, except a value computed at run time, such as a bar's width.
- Icons are named imports from `lucide-react` (D-170), for example `import { Plus } from "lucide-react"`. Never `import *`, and never a lookup by name string.
- Keep the focus ring from `base.css`. Meaning is never carried by colour alone: pair it with text, an icon or a dashed outline.
- Touch targets are at least `--target-min` (44px) on phones.

## Types

- Props extend the React Aria props type of the part they wrap, and add only what Daybook needs.
- `exactOptionalPropertyTypes` is on: never pass an explicit `undefined` to an optional prop. Leave it out, or type the prop `T | undefined`.

## Tests

- Every component has tests for what it does and for each state it shows: default, disabled, invalid, pending, selected, where it applies.
- Query by role or label and drive keyboard and pointer with user-event. A keyboard path that a user needs has its own test.
