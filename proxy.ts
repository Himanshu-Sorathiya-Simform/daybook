import type { NextRequest } from "next/server";
import { serverEnv } from "@/server/env";
import { handleProxy } from "@/server/security/proxy";

// Optimistic redirects, request ids, the early API reject and the CSP (BR-P2-28 to BR-P2-32).
// Never the only check: every route and page checks the session again (D-16).
export function proxy(request: NextRequest) {
	return handleProxy(request, {
		origin: serverEnv().APP_ORIGIN,
		development: process.env.NODE_ENV === "development",
	});
}

// Everything except static files, images, icons, the manifest, the service worker, Sentry's
// tunnel and the favicon, and never `next/link` prefetches (BR-P2-28). Must stay a literal:
// Next.js reads it at build time.
export const config = {
	matcher: [
		{
			source: "/((?!_next/static|_next/image|favicon\\.ico$|manifest\\.webmanifest$|(?:apple-)?icon\\d*(?:\\.\\w+)?$|icons/|serwist/|monitoring(?:/|$)).*)",
			missing: [
				{ type: "header", key: "next-router-prefetch" },
				{ type: "header", key: "purpose", value: "prefetch" },
			],
		},
	],
};
