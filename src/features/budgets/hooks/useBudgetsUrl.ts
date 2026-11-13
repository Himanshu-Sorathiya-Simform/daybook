import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { Month } from "@/lib/budgets/months";
import { budgetsHref, readMonthParam } from "../lib/url";

/**
 * The Budgets page's month in its URL (BR-F04-14, D-566).
 * - **Reading:** `month`, the current month when absent.
 * - **An invalid `month`** is dropped with the notice (FIL-5): the URL is replaced by the page's
 *   own, and `notice` stays true until dismissed or the month changes.
 * - **Writing:** a month change pushes a history entry, which Next's router follows without
 *   asking the server again, so the page's prefetch runs only on a real page load. The current
 *   month is written as the page with no `month`.
 */
export function useBudgetsUrl(current: Month) {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const { month, invalid } = readMonthParam(
		new URLSearchParams(searchParams.toString()),
		current,
	);
	const [notice, setNotice] = useState(false);

	// The notice is set while rendering, React's pattern for state that follows what was read;
	// only the URL, which lives outside React, is changed in an effect.
	if (invalid && !notice) setNotice(true);

	useEffect(() => {
		if (!invalid) return;
		// Next's router starts following the history API in an effect of its own component,
		// which runs after this one on the first render; a microtask later it is listening.
		let live = true;
		queueMicrotask(() => {
			if (live) window.history.replaceState(null, "", pathname);
		});
		return () => {
			live = false;
		};
	}, [invalid, pathname]);

	return {
		month,
		/** "Some filters in this link weren't valid and were removed." (FIL-5). */
		notice,
		dismissNotice: () => setNotice(false),
		/** Shows `month`, with a history entry, and drops the notice. The month already shown
		 * adds no entry, so Back never repeats a month. */
		setMonth: (next: Month) => {
			setNotice(false);
			if (next === month) return;
			window.history.pushState(null, "", budgetsHref(next, current));
		},
	};
}
