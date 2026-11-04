import { type RefObject, useEffect, useEffectEvent } from "react";

/** Calls `onVisible` each time `ref`'s element scrolls into view, while `active`: the list's
 * trimmed pages reload as the reader scrolls back up to them (BR-F03-30). */
export function useInView(
	ref: RefObject<HTMLElement | null>,
	active: boolean,
	onVisible: () => void,
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
	}, [ref, active]);
}
