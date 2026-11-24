import { useCallback, useState } from "react";

/**
 * The width of an element in pixels, following its changes, for a layout that must choose how
 * much to show by the room it has, as the calendar's month row does (BR-F05-38). It returns
 * `[ref, width]`: give `ref` to the element. The width is `null` until the element is on the
 * page, and stays `null` in a browser without `ResizeObserver`. The first width is read as the
 * element mounts, before the browser paints, so nothing is drawn at a guessed size.
 */
export function useElementWidth<T extends HTMLElement>() {
	const [width, setWidth] = useState<number | null>(null);
	const ref = useCallback((element: T | null) => {
		if (element === null || typeof ResizeObserver === "undefined") return;
		setWidth(element.getBoundingClientRect().width);
		const observer = new ResizeObserver(([entry]) => {
			if (entry) setWidth(entry.contentRect.width);
		});
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}
