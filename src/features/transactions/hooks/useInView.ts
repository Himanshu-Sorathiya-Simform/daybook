import { type RefObject, useEffect, useEffectEvent } from "react";

/**
 * Calls `onVisible` each time `ref`'s element scrolls into the screen, while `active`: the list
 * loads its next page as its end comes into view, and reloads trimmed pages as its top does
 * (BR-F03-30). A new `resetKey`, such as each page load, watches afresh, so an element still in
 * view once a page has loaded calls back again. `margin` widens the screen by that much on each
 * side it names, as `rootMargin` does, so the callback comes before the element is visible:
 * "0px 0px 1000px 0px" calls back while it is still 1,000 px below the screen (D-620).
 */
export function useInView(
	ref: RefObject<HTMLElement | null>,
	active: boolean,
	onVisible: () => void,
	resetKey?: unknown,
	margin = "0px",
) {
	const visible = useEffectEvent(onVisible);
	useEffect(() => {
		const element = ref.current;
		if (!active || !element) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) visible();
			},
			{ rootMargin: margin },
		);
		observer.observe(element);
		return () => observer.disconnect();
	}, [ref, active, resetKey, margin]);
}
