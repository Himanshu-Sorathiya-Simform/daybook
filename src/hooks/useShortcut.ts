import { useHotkey } from "@tanstack/react-hotkeys";

/**
 * A page's keyboard shortcut, while the component is mounted: TanStack Hotkeys' `useHotkey`
 * behind one hook, so the pinned alpha package sits in one place (D-171). It keeps the
 * package's typed keys and options; a single key never fires inside a text field, a button
 * or a list that uses it, since `ignoreInputs` defaults to `'auto'`.
 */
export function useShortcut(...args: Parameters<typeof useHotkey>): void {
	useHotkey(...args);
}
