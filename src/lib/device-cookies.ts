/** One year, the life of the device cookies below (D-629). */
export const DEVICE_COOKIE_MAX_AGE = 31_536_000;

/** The cookie that keeps the last window class of this device, `wide` from 768 px and `narrow`
 * below (D-512, D-629). The server reads it, so a page that draws one thing wide and another
 * narrow is drawn the way the device last showed it. */
export const WIDE_COOKIE = "daybook_wide";

/** The cookie's value for a window class. */
export const wideValue = (wide: boolean): "wide" | "narrow" =>
	wide ? "wide" : "narrow";

/** Whether a cookie value says the window was wide; anything else, or none, is narrow. */
export const isWideValue = (value: string | undefined): boolean => value === "wide";

/** The one of `allowed` that a cookie or stored value names, else `fallback`. */
export const choiceOf = <T extends string>(
	value: string | null | undefined,
	allowed: readonly T[],
	fallback: T,
): T => allowed.find((choice) => choice === value) ?? fallback;

/** Keeps a device choice in a cookie for a year, on every path, for the server to read
 * (D-513, D-629). `Secure` when the page is served over https, as the queue cookie is (P1). */
export function writeDeviceCookie(name: string, value: string): void {
	const secure = window.location.protocol === "https:" ? "; Secure" : "";
	document.cookie = `${name}=${value}; Max-Age=${DEVICE_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`;
}
