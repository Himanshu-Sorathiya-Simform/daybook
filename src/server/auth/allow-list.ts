import "server-only";

/** The only Better Auth endpoints Daybook uses (BR-P2-40, D-202). F01 owns their behavior;
 * `beforeHook` in `hooks.ts` answers 404 for every other one. */
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
