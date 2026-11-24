import { useShortcut } from "@/hooks/useShortcut";

export type TransactionShortcutsOptions = {
	/** A row is selected and no dialog or drawer holds the keys: E, D and Delete act on it. */
	actionable: boolean;
	/** A row is selected and nothing is open over the page: Escape clears the selection. */
	canClear: boolean;
	onEdit: () => void;
	onDuplicate: () => void;
	onRemove: () => void;
	onClear: () => void;
};

/**
 * The page's keys for the selected row (BR-F03-73): E edits, D duplicates, Delete or Backspace
 * deletes, each only while the selection is actionable. Escape clears the selection, and leaves
 * a text field, a menu or the drawer its own Escape.
 */
export function useTransactionShortcuts({
	actionable,
	canClear,
	onEdit,
	onDuplicate,
	onRemove,
	onClear,
}: TransactionShortcutsOptions) {
	useShortcut("E", onEdit, { enabled: actionable });
	useShortcut("D", onDuplicate, { enabled: actionable });
	useShortcut("Delete", onRemove, { enabled: actionable });
	useShortcut("Backspace", onRemove, { enabled: actionable });
	useShortcut("Escape", onClear, {
		enabled: canClear,
		ignoreInputs: true,
		ignoreDefaultPrevented: true,
	});
}
