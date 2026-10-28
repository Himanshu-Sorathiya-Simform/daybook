/**
 * The path to return to after login, from an untrusted `next` value (F01, BR-F01-09), or
 * `null` when it must be ignored. The raw value must start with `/` and hold no backslash,
 * and it must resolve against `origin` to that same origin, so `//evil.example` and
 * `/\evil.example`, which browsers read as other sites, are both refused. The result is the
 * resolved path, query and fragment, never a full URL.
 */
export function safeNextPath(
	next: string | null | undefined,
	origin: string,
): string | null {
	if (!next || !next.startsWith("/") || next.includes("\\")) return null;
	let url: URL;
	try {
		url = new URL(next, origin);
	} catch {
		return null;
	}
	if (url.origin !== new URL(origin).origin) return null;
	return `${url.pathname}${url.search}${url.hash}`;
}
