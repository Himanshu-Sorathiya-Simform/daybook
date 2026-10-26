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
- Import every `react-aria-components` name, types included, with an `Aria` prefix: `import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components"`. It keeps our `Button` and React Aria's apart, and shows at a glance which part brings the behavior.
- Don't write a React Aria component from memory. Read its types in `node_modules/react-aria-components/dist/types/src/<Name>.d.ts` for props and render props. For its parts and structure, ask me to paste its docs page, and name the component you need.
- Style with Tailwind classes from our tokens: `bg-page`, `text-ink-2`, `rounded-control`, `text-body`, `figures` on every amount. Never a hex value, a `--text-*` variable or a spacing override (D-387).
- No inline `style`, except a value computed at run time, such as a bar's width.
- Icons are named imports from `lucide-react` (D-170), for example `import { Plus } from "lucide-react"`. Never `import *`, and never a lookup by name string. A component that shows an icon takes it as a prop typed `LucideIcon`: `icon={Plus}` (D-392).
- Keep the focus ring from `base.css`. Meaning is never carried by colour alone: pair it with text, an icon or a dashed outline.
- Touch targets are at least `--target-min` (44px) on phones.
- A text input is at least 16px on touch devices: add `pointer-coarse:text-base` to the `Input` or `TextArea` (D-408). Under 16px, iOS Safari zooms the page on focus. Never turn zoom off to avoid it.

## Class names

- Every component takes a `className` for its root element, and no `style` prop. Callers add layout through `className` (a grid, `flex-1`, a margin, a height).
- Merge with `cn` from `@/lib/cn`, the component's own classes first and the caller's last, so the caller wins any conflict: `cn("inline-flex h-9.5", className)`. Never join class strings by hand.
- A caller who needs something the base styles forbid (a different colour, no left padding) is a missing variant or prop. Add it to the component instead of overriding it from outside.
- Style states with the variants from `tailwindcss-react-aria-components`: `pressed:`, `selected:`, `hover:`, `focus-visible:`, `disabled:`, `invalid:`. They match React Aria's data attributes on its parts and the usual pseudo-classes on plain elements. Don't write `data-[pressed]:` by hand.
- A new `--text-*`, `--radius-*` or `--shadow-*` name in `src/styles/` goes into the theme lists in `src/lib/cn.ts`. Its test fails until it does.
- A part whose `className` may be a function of its state keeps that working. Read the types of `composeRenderProps` before writing one.

## Types

- Props extend the React Aria props type of the part they wrap, and add only what Daybook needs.
- `exactOptionalPropertyTypes` is on: never pass an explicit `undefined` to an optional prop. Leave it out, or type the prop `T | undefined`.

## Tests

- Every component has tests for what it does and for each state it shows: default, disabled, invalid, pending, selected, where it applies.
- Query by role or label and drive keyboard and pointer with user-event. A keyboard path that a user needs has its own test.
