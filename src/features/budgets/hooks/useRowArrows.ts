import { useShortcut } from "@/hooks/useShortcut";
import type { ExpenseCategory } from "@/lib/budgets/model";
import { categoryOf } from "../lib/rows";

/**
 * Up and Down on the Budgets page (BR-F04-32): they move the selection one row on through
 * `ids`, the rows shown in their order, and focus the row. They start from the focused row,
 * else the selected one, else the first row. Inside `holder` they run ahead of React Aria's
 * own arrow keys, which only move focus; anywhere else on the page, outside text fields and
 * other widgets, they do the same.
 */
export function useRowArrows({
	holder,
	ids,
	selected,
	onSelect,
}: {
	/** The element holding the rows, each with its id as `data-key`. */
	holder: HTMLElement | null;
	ids: readonly string[];
	selected: ExpenseCategory | null;
	onSelect: (category: ExpenseCategory) => void;
}) {
	const move = (step: 1 | -1) => {
		const focused = (
			document.activeElement as HTMLElement | null
		)?.closest<HTMLElement>("[data-key]");
		let at =
			focused && holder?.contains(focused) ?
				// The row was found by its `data-key`.
				ids.indexOf(focused.dataset["key"] as string)
			:	-1;
		if (at < 0 && selected !== null) {
			at = ids.findIndex((id) => categoryOf(id) === selected);
		}
		const next = at < 0 ? 0 : Math.min(Math.max(at + step, 0), ids.length - 1);
		const id = ids[next] as string;
		onSelect(categoryOf(id));
		holder
			?.querySelector<HTMLElement>(`[data-key="${CSS.escape(id)}"]`)
			?.focus();
	};
	const keys = { enabled: ids.length > 0 };
	const inside = { ...keys, target: holder, capture: true, ignoreInputs: false };
	useShortcut("ArrowDown", () => move(1), inside);
	useShortcut("ArrowUp", () => move(-1), inside);
	useShortcut("ArrowDown", () => move(1), keys);
	useShortcut("ArrowUp", () => move(-1), keys);
}
