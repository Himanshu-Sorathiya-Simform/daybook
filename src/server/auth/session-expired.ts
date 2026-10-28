import "server-only";
import { safeNextPath } from "@/lib/next-path";
import { describeError } from "./log";

/** The offline-logout marker cookie (F01, D-367). Only Daybook's own script sets it. */
export const LOGOUT_COOKIE = "daybook_logout";

const SESSION_PREFIXES = ["daybook.", "__Secure-daybook."];
const SESSION_TOKENS = ["daybook.session_token", "__Secure-daybook.session_token"];

// A cookie name as RFC 6265 allows it, so a name copied into Set-Cookie cannot carry
// separators or anything else.
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** The names of the cookies a `Cookie` header carries, with their values. */
export function parseCookies(header: string | null): Map<string, string> {
	const cookies = new Map<string, string>();
	for (const part of (header ?? "").split(";")) {
		const index = part.indexOf("=");
		if (index === -1) continue;
		const name = part.slice(0, index).trim();
		if (TOKEN.test(name) && !cookies.has(name)) {
			cookies.set(name, part.slice(index + 1).trim());
		}
	}
	return cookies;
}

/** A Set-Cookie value that expires `name` (BR-P2-39). `Path=/` matches how every Daybook
 * cookie is set, and a `__Secure-` name needs `Secure`, or the browser ignores the expiry. */
export function expireCookie(name: string): string {
	const secure = name.startsWith("__Secure-") ? "; Secure" : "";
	return `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${secure}`;
}

export type SessionExpiredDeps = {
	/** `APP_ORIGIN`: every redirect goes to this origin, never to the request's host. */
	origin: string;
	/** Revokes the session the cookies name, through Better Auth. */
	revoke: (cookieHeader: string) => Promise<unknown>;
};

/** `GET /api/session/expired`, the one place session cookies are cleared (BR-P2-39, D-204).
 *
 * 1. **Offline logout** (`reason=logout`): acts when the request carries `daybook_logout=1`,
 *    whichever site it came from, since only Daybook's script sets that cookie, or when it is
 *    same-origin. It revokes the session when a session cookie is present, clears
 *    `daybook_logout` and the session cookies, and goes to `/login?expired=1`.
 * 2. **Another site:** anything not `same-origin` or `none` (a missing `Sec-Fetch-Site`
 *    included) clears nothing and goes to `/login?expired=1`, so another site cannot log the
 *    user out.
 * 3. **Deleted account** (`reason=deleted`): clears the session cookies and goes to
 *    `/?deleted=1` (F01).
 * 4. **Otherwise:** clears the session cookies and goes to `/login?next=<path>&expired=1`,
 *    or `/login?expired=1` when `next` is missing or unsafe (BR-F01-09).
 *
 * Every refusal goes to `/login?expired=1`, which the proxy always lets through, so no
 * redirect loops between `/login` and `/dashboard` (D-367). */
export async function sessionExpired(
	request: Request,
	{ origin, revoke }: SessionExpiredDeps,
): Promise<Response> {
	const params = new URL(request.url).searchParams;
	const reason = params.get("reason");
	const cookieHeader = request.headers.get("cookie");
	const cookies = parseCookies(cookieHeader);
	const site = request.headers.get("sec-fetch-site");
	const sameSite = site === "same-origin" || site === "none";
	const sessionCookies = [...cookies.keys()].filter((name) =>
		SESSION_PREFIXES.some((prefix) => name.startsWith(prefix)),
	);
	const redirect = (path: string, expire: string[] = []) => {
		const headers = new Headers({
			location: new URL(path, origin).toString(),
			"cache-control": "no-store",
		});
		for (const name of expire) headers.append("set-cookie", expireCookie(name));
		return new Response(null, { status: 303, headers });
	};

	if (reason === "logout" && (cookies.get(LOGOUT_COOKIE) === "1" || sameSite)) {
		if (cookieHeader && SESSION_TOKENS.some((name) => cookies.has(name))) {
			try {
				await revoke(cookieHeader);
			} catch (error) {
				// The cookies are still cleared: this device is logged out either way, and the
				// session row expires on its own.
				console.error(
					"[auth] Revoking a session failed",
					describeError(error),
				);
			}
		}
		return redirect("/login?expired=1", [...sessionCookies, LOGOUT_COOKIE]);
	}
	if (!sameSite) return redirect("/login?expired=1");
	if (reason === "deleted") return redirect("/?deleted=1", sessionCookies);
	const next = safeNextPath(params.get("next"), origin);
	const login =
		next ?
			`/login?${new URLSearchParams({ next, expired: "1" })}`
		:	"/login?expired=1";
	return redirect(login, sessionCookies);
}
