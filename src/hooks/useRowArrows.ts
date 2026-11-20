import { useShortcut } from "@/hooks/useShortcut";

/** What Up and Down do: select, only move focus, or nothing (D-571). */
export type RowArrows = "select" | "focus" | "off";

/**
 * Up and Down on a page of rows with a selection (BR-F04-32, BR-F05-45): they move the selection
 * one row on through `ids`, the rows shown in their order, and focus the row. In the `focus` mode, below 1180 px,
 * they only move focus, and while the drawer holds focus they are `off` (D-571). They start
 * from the focused row, else the selected one, else the first row. Inside `holder` they run
 * ahead of React Aria's own arrow keys, which only move focus, except where React Aria's are
 * needed to reach a table's headings: Up from the first row or from a heading is left to it,
 * and Down from a heading goes to the first row. Anywhere else on the page, outside text
 * fields and other widgets, they do the same.
 */
export function useRowArrows<T = string>({
	holder,
	ids,
	selected,
	onSelect,
	mode = "select",
	selectionOf,
}: {
	/** The element holding the rows, each with its id as `data-key`. */
	holder: HTMLElement | null;
	ids: readonly string[];
	/** What the page selects: the row's id itself, or what `selectionOf` makes of it. */
	selected: T | null;
	onSelect: (value: T) => void;
	mode?: RowArrows;
	/** What a row id stands for, when the page selects something other than the id: Budgets
	 * ids hold a group and a category, "budget:food", and select the category. */
	selectionOf?: (id: string) => T;
}) {
	const selectionFor = (id: string) =>
		selectionOf ? selectionOf(id) : (id as unknown as T);
	/** Moves the selection, or answers `false` when the key is left to React Aria. */
	const move = (step: 1 | -1): boolean => {
		const active = document.activeElement as HTMLElement | null;
		const inside = active !== null && holder?.contains(active) === true;
		const heading = inside && active.closest('[role="columnheader"]') !== null;
		// The focused row, from any cell or button in it, by its `data-key`.
		const row =
			inside ? active.closest<HTMLElement>('[role="row"][data-key]') : null;
		let at = row ? ids.indexOf(row.dataset["key"] as string) : -1;
		if (step === -1 && (heading || (row !== null && at === 0))) return false;
		if (!heading && at < 0 && selected !== null) {
			at = ids.findIndex((id) => selectionFor(id) === selected);
		}
		const next = at < 0 ? 0 : Math.min(Math.max(at + step, 0), ids.length - 1);
		const id = ids[next] as string;
		if (mode === "select") onSelect(selectionFor(id));
		holder
			?.querySelector<HTMLElement>(`[data-key="${CSS.escape(id)}"]`)
			?.focus();
		return true;
	};
	const run = (step: 1 | -1) => (event: KeyboardEvent) => {
		if (!move(step)) return;
		event.preventDefault();
		event.stopPropagation();
	};
	const keys = {
		enabled: mode !== "off" && ids.length > 0,
		preventDefault: false,
		stopPropagation: false,
	};
	const inside = { ...keys, target: holder, capture: true, ignoreInputs: false };
	useShortcut("ArrowDown", run(1), inside);
	useShortcut("ArrowUp", run(-1), inside);
	useShortcut("ArrowDown", run(1), keys);
	useShortcut("ArrowUp", run(-1), keys);
}
