import { useSyncExternalStore } from "react";

/**
 * Whether the window matches a CSS media query, following its changes, for layouts that change
 * behavior and not only look, such as the Transactions panel docked from 1180 px and a drawer
 * below (BR-F03-70). `onServer` is the answer while rendering on the server and hydrating,
 * where the window is unknown; pair it with CSS that hides the wrong layout until then. A
 * browser without `matchMedia` matches nothing.
 */
export function useMediaQuery(query: string, onServer: boolean): boolean {
	return useSyncExternalStore(
		(onChange) => {
			if (typeof window.matchMedia !== "function") return () => {};
			const list = window.matchMedia(query);
			list.addEventListener("change", onChange);
			return () => list.removeEventListener("change", onChange);
		},
		() =>
			typeof window.matchMedia === "function"
			&& window.matchMedia(query).matches,
		() => onServer,
	);
}
