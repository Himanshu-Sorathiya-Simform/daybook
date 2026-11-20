import { useCallback, useEffect, useSyncExternalStore } from "react";

import { choiceOf, writeDeviceCookie } from "@/lib/device-cookies";

/** This tab's own writes, which the `storage` event reports only to other tabs. */
const listeners = new Set<() => void>();

/** Choices made while storage refuses writes, kept per key for this tab until it reloads. */
const unsaved = new Map<string, string>();

/**
 * A choice among a few fixed words, such as a page's List or Table, remembered on the device
 * under `key` and in step across its tabs. Anything else stored, or storage that cannot be
 * read, is `fallback`; where storage refuses writes, as in some private windows, the choice
 * still works and is kept for the tab until it reloads.
 *
 * The choice is also kept in a cookie named `key`, which the page's server render can read and
 * give back as `serverChoice`, so a remembered view is drawn from the first paint and not after
 * the browser has read storage (D-629). With no `serverChoice` the server renders `fallback`.
 * Storage stays the truth: where it holds a choice the browser follows it, and where it holds
 * none the cookie's word stands.
 */
export function useStoredChoice<T extends string>(
	key: string,
	allowed: readonly T[],
	fallback: T,
	serverChoice?: T,
): [T, (choice: T) => void] {
	const subscribe = useCallback(
		(onChange: () => void) => {
			listeners.add(onChange);
			const onStorage = (event: StorageEvent) => {
				if (event.key === null || event.key === key) onChange();
			};
			window.addEventListener("storage", onStorage);
			return () => {
				listeners.delete(onChange);
				window.removeEventListener("storage", onStorage);
			};
		},
		[key],
	);
	// Where storage holds nothing usable, the cookie's word stands, so the browser keeps the
	// server's draw rather than redrawing it.
	const unset = serverChoice ?? fallback;
	const pick = (value: string | null): T => choiceOf(value, allowed, unset);
	const read = (): T => {
		const kept = unsaved.get(key);
		if (kept !== undefined) return pick(kept);
		try {
			return pick(window.localStorage.getItem(key));
		} catch {
			return unset;
		}
	};
	const choice = useSyncExternalStore(subscribe, read, () => unset);
	// The cookie follows the choice, which also gives it to a device that chose before cookies.
	useEffect(() => {
		writeDeviceCookie(key, choice);
	}, [key, choice]);
	const setChoice = (next: T) => {
		try {
			window.localStorage.setItem(key, next);
			unsaved.delete(key);
		} catch {
			unsaved.set(key, next);
		}
		for (const listener of listeners) listener();
	};
	return [choice, setChoice];
}

/** Forgets every choice this tab kept because storage refused it, for tests. */
export function resetUnsavedChoices() {
	unsaved.clear();
}
