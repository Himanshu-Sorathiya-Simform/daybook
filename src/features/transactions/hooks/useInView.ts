import { type RefObject, useEffect, useEffectEvent } from "react";

/**
 * Calls `onVisible` each time `ref`'s element scrolls into the screen, while `active`: the list
 * loads its next page as its end comes into view, and reloads trimmed pages as its top does
 * (BR-F03-30). A new `resetKey`, such as each page load, watches afresh, so an element still in
 * view once a page has loaded calls back again.
 */
export function useInView(
	ref: RefObject<HTMLElement | null>,
	active: boolean,
	onVisible: () => void,
	resetKey?: unknown,
) {
	const visible = useEffectEvent(onVisible);
	useEffect(() => {
		const element = ref.current;
		if (!active || !element) return;
		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) visible();
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref, active, resetKey]);
}
