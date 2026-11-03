/** The offline-logout marker cookie (F01, D-367). Only Daybook's own script sets it; until P1
 * (M5) it is the whole marker (D-502). */
export const LOGOUT_COOKIE = "daybook_logout";

/** Whether this browser still holds the marker of a logout that did not finish. */
export function hasLogoutMarker(cookies: string = document.cookie): boolean {
	return cookies.split(";").some((pair) => pair.trim() === `${LOGOUT_COOKIE}=1`);
}

/** How long the marker lasts: 8 days, longer than a session (F01 section 5, D-367). */
export const LOGOUT_MAX_AGE = 691_200;

/** Writes the marker after a logout whose sign-out did not count as done (BR-F01-15, D-502). */
export function writeLogoutMarker(): void {
	document.cookie = `${LOGOUT_COOKIE}=1; Max-Age=${LOGOUT_MAX_AGE}; Path=/; SameSite=Lax`;
}

export function clearLogoutMarker(): void {
	document.cookie = `${LOGOUT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** Whether a sign-out answer means the old session is gone (F01, BR-F01-15): any 2xx, or a 400
 * or 401, which say there was no session left. Anything else, or no answer, does not. */
export function signOutCountsAsDone(status: number | null): boolean {
	return (
		status !== null
		&& ((status >= 200 && status < 300) || status === 400 || status === 401)
	);
}
