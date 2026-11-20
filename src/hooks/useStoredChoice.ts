import { useCallback, useSyncExternalStore } from "react";

/** This tab's own writes, which the `storage` event reports only to other tabs. */
const listeners = new Set<() => void>();

/** Choices made while storage refuses writes, kept per key for this tab until it reloads. */
const unsaved = new Map<string, string>();

/**
 * A choice among a few fixed words, such as a page's List or Table, remembered on the device
 * under `key` and in step across its tabs. Anything else stored, or storage that cannot be
 * read, is `fallback`; where storage refuses writes, as in some private windows, the choice
 * still works and is kept for the tab until it reloads. The server cannot know the device's
 * choice, so it renders `fallback` and the browser follows.
 */
export function useStoredChoice<T extends string>(
	key: string,
	allowed: readonly T[],
	fallback: T,
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
	const pick = (value: string | null): T =>
		allowed.find((choice) => choice === value) ?? fallback;
	const read = (): T => {
		const kept = unsaved.get(key);
		if (kept !== undefined) return pick(kept);
		try {
			return pick(window.localStorage.getItem(key));
		} catch {
			return fallback;
		}
	};
	const choice = useSyncExternalStore(subscribe, read, () => fallback);
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
