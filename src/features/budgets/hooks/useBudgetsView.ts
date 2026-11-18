import { useSyncExternalStore } from "react";

/** Where the device remembers List or Table (BR-F04-14). */
export const VIEW_KEY = "daybook.budgets.view";

export type BudgetsView = "list" | "table";

/** This tab's own writes, which the `storage` event reports only to other tabs. */
const listeners = new Set<() => void>();

/** The choice made while storage refuses writes, kept for this tab until it reloads. */
let unsaved: BudgetsView | null = null;

function subscribe(onChange: () => void) {
	listeners.add(onChange);
	const onStorage = (event: StorageEvent) => {
		if (event.key === null || event.key === VIEW_KEY) onChange();
	};
	window.addEventListener("storage", onStorage);
	return () => {
		listeners.delete(onChange);
		window.removeEventListener("storage", onStorage);
	};
}

/** The choice: this tab's unsaved one, else the stored one. Anything else stored, or storage
 * that cannot be read, is List. */
function read(): BudgetsView {
	if (unsaved !== null) return unsaved;
	try {
		return window.localStorage.getItem(VIEW_KEY) === "table" ? "table" : "list";
	} catch {
		return "list";
	}
}

/** The server cannot know the device's choice; it renders List, and the browser follows. */
const readOnServer = (): BudgetsView => "list";

/**
 * The Budgets page's List or Table, remembered on the device (BR-F04-14) and in step across
 * its tabs. Where storage refuses, as in some private windows, the choice still works and is
 * kept for the tab until it reloads.
 */
export function useBudgetsView(): [BudgetsView, (view: BudgetsView) => void] {
	const view = useSyncExternalStore(subscribe, read, readOnServer);
	const setView = (next: BudgetsView) => {
		try {
			window.localStorage.setItem(VIEW_KEY, next);
			unsaved = null;
		} catch {
			unsaved = next;
		}
		for (const listener of listeners) listener();
	};
	return [view, setView];
}

/** Forgets this tab's unsaved choice, for tests. */
export function resetUnsavedView() {
	unsaved = null;
}
