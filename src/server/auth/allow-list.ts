import "server-only";
import { APIError, createAuthMiddleware } from "better-auth/api";

/** The only Better Auth endpoints Daybook uses (BR-P2-40, D-202). F01 owns their behavior. */
export const AUTH_PATHS: ReadonlySet<string> = new Set([
	"/sign-up/email",
	"/sign-in/email",
	"/sign-out",
	"/get-session",
	"/list-sessions",
	"/revoke-session",
	"/revoke-other-sessions",
	"/change-password",
	"/update-user",
	"/delete-user",
]);

/** Better Auth's `before` hook. Every other endpoint answers 404, as if it did not exist, so
 * an unused one (change email, reset by email) can never be reached, over HTTP or through
 * `auth.api`. `ctx.path` is the endpoint's declared path, never the raw URL, so a trailing
 * slash or an encoded character cannot slip past it. F01 adds its checks to this hook. */
export const beforeHook = createAuthMiddleware(async (ctx) => {
	if (!AUTH_PATHS.has(ctx.path)) throw new APIError("NOT_FOUND");
});
