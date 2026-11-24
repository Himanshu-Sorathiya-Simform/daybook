import { useShortcut } from "@/hooks/useShortcut";
import { type MenuAction, shortcutAction, type ShortcutKey } from "../lib/menu";
import type { SubscriptionItem, SubscriptionsLocale } from "../lib/types";

export type SubscriptionShortcutsOptions = {
	/** The selected Subscription, or `null` for none. */
	item: SubscriptionItem | null;
	/** A dialog, or the conflict view of a refused write, takes the keys: the page behind rests. */
	covered: boolean;
	locale: SubscriptionsLocale;
	onEdit: (id: string) => void;
	/** The menu item a key acts as (D-630). */
	onAction: (action: MenuAction, id: string) => void;
	onClear: () => void;
};

/**
 * The page's keys for the selected Subscription (BR-F05-45, D-630). E edits. S, P, R, C and
 * Delete or Backspace act as the selection's menu items do, and only where it offers them, so a
 * press that finds none does nothing. Escape clears the selection, and leaves a text field, a
 * menu or a dialog its own Escape. While a dialog or the conflict view is up, none of them act.
 */
export function useSubscriptionShortcuts({
	item,
	covered,
	locale,
	onEdit,
	onAction,
	onClear,
}: SubscriptionShortcutsOptions) {
	const active = item !== null && !covered;
	useShortcut("E", () => item && onEdit(item.id), { enabled: active });
	const keyed = (key: ShortcutKey) =>
		active && shortcutAction(key, item, locale) !== null;
	const press = (key: ShortcutKey) => () => {
		const action = item && shortcutAction(key, item, locale);
		if (item && action) onAction(action, item.id);
	};
	useShortcut("S", press("S"), { enabled: keyed("S") });
	useShortcut("P", press("P"), { enabled: keyed("P") });
	useShortcut("R", press("R"), { enabled: keyed("R") });
	useShortcut("C", press("C"), { enabled: keyed("C") });
	useShortcut("Delete", press("Delete"), { enabled: keyed("Delete") });
	useShortcut("Backspace", press("Delete"), { enabled: keyed("Delete") });
	useShortcut("Escape", onClear, {
		enabled: active,
		// Escape in a text field, a menu or a dialog belongs to them.
		ignoreInputs: true,
		ignoreDefaultPrevented: true,
	});
}
