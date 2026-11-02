import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import { url } from "@/components/app/__tests__/helpers";

/** The auth tests' network: Better Auth's routes, faked. Its browser client asks for the
 * session after a sign-in, sign-up or sign-out, which answers "none" unless a test says. */
export const authNetwork = setupServer(
	http.get(url("/api/auth/get-session"), () => HttpResponse.json(null)),
);

export const SIGN_UP = url("/api/auth/sign-up/email");
export const SIGN_IN = url("/api/auth/sign-in/email");
export const SIGN_OUT = url("/api/auth/sign-out");

/** Better Auth's error answer. */
export const refusal = (code: string, status: number) =>
	HttpResponse.json({ code, message: `Better Auth says ${code}` }, { status });

export const USER = {
	id: "u1",
	email: "asha@example.com",
	name: "Asha",
	emailVerified: false,
	createdAt: "2026-11-02T06:30:00.000Z",
	updatedAt: "2026-11-02T06:30:00.000Z",
};

/** Answers `path` with `respond`, keeping each request's JSON body. */
export function route(
	method: "post",
	path: string,
	respond: () => Response | Promise<Response>,
) {
	const bodies: unknown[] = [];
	authNetwork.use(
		http[method](path, async ({ request }) => {
			bodies.push(
				await request
					.clone()
					.json()
					.catch(() => null),
			);
			return respond();
		}),
	);
	return bodies;
}
