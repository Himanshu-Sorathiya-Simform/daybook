/** The cookie that keeps the sidebar's width on this device (D-513). The app shell's server
 * layout reads it, so the page renders at the chosen width. */
export const SIDEBAR_COOKIE = "daybook_sidebar";

/** One year. */
export const SIDEBAR_MAX_AGE = 31_536_000;

/** Whether a cookie value asks for the icon rail; anything else is full width. */
export const isRail = (value: string | undefined): boolean => value === "rail";

/** Keeps the choice; logout leaves it, like the theme. */
export function writeSidebarChoice(rail: boolean): void {
	document.cookie = `${SIDEBAR_COOKIE}=${rail ? "rail" : "full"}; Max-Age=${SIDEBAR_MAX_AGE}; Path=/; SameSite=Lax`;
}
