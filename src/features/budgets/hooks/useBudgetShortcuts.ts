import { useShortcut } from "@/hooks/useShortcut";
import type { ExpenseCategory } from "@/lib/budgets/model";

export type BudgetShortcutsOptions = {
	/** The selected category, or `null` for none. */
	selected: ExpenseCategory | null;
	/** Which keys act on the selection, as its buttons do: none while a dialog is open. */
	keys: { changeLimit: boolean; stop: boolean; remove: boolean };
	onChangeLimit: (category: ExpenseCategory) => void;
	onStop: (category: ExpenseCategory) => void;
	onDelete: (category: ExpenseCategory) => void;
	onClear: () => void;
};

/**
 * The page's keys for the selected category (BR-F04-32, D-573): L changes the limit, S stops
 * budgeting, Delete or Backspace deletes, each on only while the selection's buttons offer it.
 * Escape clears the selection, and leaves a text field, a menu, the month grid or a dialog its
 * own Escape.
 */
export function useBudgetShortcuts({
	selected,
	keys,
	onChangeLimit,
	onStop,
	onDelete,
	onClear,
}: BudgetShortcutsOptions) {
	useShortcut("Escape", onClear, {
		enabled: selected !== null,
		ignoreInputs: true,
		ignoreDefaultPrevented: true,
	});
	// Each is on only while the selection has a record, which needs a selection.
	const onSelected = (act: (category: ExpenseCategory) => void) => () => {
		if (selected !== null) act(selected);
	};
	useShortcut("L", onSelected(onChangeLimit), { enabled: keys.changeLimit });
	useShortcut("S", onSelected(onStop), { enabled: keys.stop });
	useShortcut("Delete", onSelected(onDelete), { enabled: keys.remove });
	useShortcut("Backspace", onSelected(onDelete), { enabled: keys.remove });
}
