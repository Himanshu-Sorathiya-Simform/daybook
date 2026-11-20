import { useEffect } from "react";

import { WIDE_COOKIE, wideValue, writeDeviceCookie } from "@/lib/device-cookies";
import { useMediaQuery } from "./useMediaQuery";

/** From 48rem, 768 px, a page shows its wide layout (D-512). */
export const WIDE_QUERY = "(min-width: 48rem)";

/**
 * Whether the window is 768 px wide or more, for a page whose content, and not only its look,
 * depends on it: the Subscriptions calendar's grid or days, a remembered Table. It also keeps
 * the answer in the `daybook_wide` cookie, which the page's server render reads and gives back
 * as `onServer`, so repeat visits are drawn the right way from the first paint. A device the
 * server has no cookie for is drawn as `onServer` says and corrected once the browser knows
 * (D-629).
 */
export function useWideWindow(onServer: boolean): boolean {
	const wide = useMediaQuery(WIDE_QUERY, onServer);
	useEffect(() => {
		writeDeviceCookie(WIDE_COOKIE, wideValue(wide));
	}, [wide]);
	return wide;
}
