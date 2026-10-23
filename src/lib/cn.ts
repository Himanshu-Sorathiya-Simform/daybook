import { createCn } from "cn/config";

/**
 * Joins class names like clsx and settles Tailwind conflicts like tailwind-merge, so the last
 * class of a kind wins. A component puts its own classes first and the caller's `className` last.
 *
 * `cn` only knows Tailwind's own class names. Without these lists it reads `text-title` as a
 * colour and removes it when `text-ink-2` follows, and it never merges `rounded-section`. Keep
 * them in step with the `@theme` blocks in `src/styles/`; the tests read those files and fail
 * when a name is missing here.
 */
export const cn = createCn({
	extend: {
		theme: {
			text: [
				"readout",
				"readout-unit",
				"title",
				"heading",
				"figure",
				"amount",
				"body-lg",
				"body",
				"label",
				"caption",
				"small",
				"axis",
			],
			radius: ["kbd", "bar", "chip", "control", "section", "card"],
			shadow: ["popover", "dialog"],
		},
	},
});
