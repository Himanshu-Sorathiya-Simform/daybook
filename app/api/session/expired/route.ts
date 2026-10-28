import { getAuth } from "@/server/auth/auth";
import { sessionExpired } from "@/server/auth/session-expired";
import { serverEnv } from "@/server/env";

// The one place session cookies are cleared (BR-P2-39).
export const GET = (request: Request) =>
	sessionExpired(request, {
		origin: serverEnv().APP_ORIGIN,
		revoke: (cookie) =>
			getAuth().api.signOut({ headers: new Headers({ cookie }) }),
	});
