// @vitest-environment node
import { expect, test } from "vitest";
import { AUTH_PATHS } from "../allow-list";

// BR-P2-40: exactly these ten, and nothing else. The integration suite checks the hook
// against every endpoint the installed Better Auth has (AC-P2-19).
test("allows exactly P2's ten Better Auth paths", () => {
	expect([...AUTH_PATHS].sort()).toEqual(
		[
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
		].sort(),
	);
});

test.each([
	"/change-email",
	"/request-password-reset",
	"/reset-password",
	"/ok",
	"/sign-up",
])("does not allow %s", (path) => {
	expect(AUTH_PATHS.has(path)).toBe(false);
});
