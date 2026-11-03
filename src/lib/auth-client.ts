import { createAuthClient } from "better-auth/react";

/** Better Auth's browser client (F01). It calls `/api/auth/*` on the page's own origin, so it
 * needs no URL. Its session store is the app's session check (BR-F01-12, D-508).
 *
 * Better Auth keeps the `fetch` it finds when the client is made. Looking it up on each call
 * instead lets whatever wraps `fetch` later see these requests too: MSW in tests, Sentry's
 * request breadcrumbs once P3 adds it. */
export const authClient = createAuthClient({
	fetchOptions: {
		customFetchImpl: (input, init) => globalThis.fetch(input, init),
	},
});
