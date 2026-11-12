import { formatForDisplay, type Hotkey, useHotkey } from "@tanstack/react-hotkeys";

/**
 * A page's keyboard shortcut, while the component is mounted: TanStack Hotkeys' `useHotkey`
 * behind one hook, so the pinned alpha package sits in one place (D-171). It keeps the
 * package's typed keys and options; a single key never fires inside a text field, a button
 * or a list that uses it, since `ignoreInputs` defaults to `'auto'`.
 */
export function useShortcut(...args: Parameters<typeof useHotkey>): void {
	useHotkey(...args);
}

/**
 * A shortcut as a hint names it, through the package's own formatter, so the label and the
 * key it listens for resolve `Mod` alike: "Ctrl Enter", or "⌘ Enter" on macOS (BR-F03-48).
 * Modifiers show as symbols on macOS, keys as words, with a space between. Call it in the
 * browser: on the server the package can only guess the platform.
 */
export function shortcutLabel(hotkey: Hotkey): string {
	return formatForDisplay(hotkey, {
		useSymbols: { modifiers: true, keys: false },
		separatorToken: " ",
	});
}
