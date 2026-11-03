import { safeNextPath } from "@/lib/next-path";

/** Where a login goes (BR-F01-09): `next` when it is one safe path in `origin`, else
 * `/dashboard`. A repeated `next` is ignored, since it names no single page. */
export function loginDestination(
	next: string | string[] | undefined,
	origin: string,
): string {
	return (
		(typeof next === "string" ? safeNextPath(next, origin) : null)
		?? "/dashboard"
	);
}
