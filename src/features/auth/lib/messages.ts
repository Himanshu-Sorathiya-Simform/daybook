/** F01 section 8's messages for the sign-up and login screens. */
export const AUTH_MESSAGES = {
	emailRequired: "Enter your email.",
	emailInvalid: "Enter a valid email address, like name@example.com.",
	emailTooLong: "Use an email address of up to 254 characters.",
	emailTaken: "An account with this email already exists.",
	passwordRequired: "Enter a password.",
	passwordTooShort: "Use at least 12 characters.",
	passwordTooLong: "Use 128 characters or fewer.",
	passwordBreached:
		"This password has appeared in a data breach. Choose a different one.",
	name: "Enter a name of up to 50 characters.",
	wrongCredentials: "Email or password is incorrect.",
	rateLimited: "Too many attempts. Wait a few seconds and try again.",
	offline: "You are offline. Connect to log in.",
	oldSession:
		"We couldn't finish logging out the last session. Try again in a moment.",
	failed: "Something went wrong. Try again.",
	expired: "Your session has expired. Log in to continue.",
	forgotPassword:
		"Password reset by email is not available in this demo. Ask the developer to reset it.",
} as const;

export type AuthField = "email" | "password" | "name";

/** Where a refusal shows: under one field, or above the form. */
export type AuthFailure = { field: AuthField; message: string } | { form: string };

/** The part of a Better Auth client error the forms read. */
export type AuthError = { code?: string | undefined; status: number };

/** The message for a failed sign-up or login, from Better Auth's code, or F01's hook codes,
 * then the status (F01 section 8, D-510). A wrong email and a wrong password read the same
 * (BR-F01-07). A taken email reads `emailTaken`; the form adds "Log in instead." as a link. */
export function authFailure(error: AuthError): AuthFailure {
	switch (error.code) {
		case "USER_ALREADY_EXISTS":
		case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
			return { field: "email", message: AUTH_MESSAGES.emailTaken };
		case "INVALID_EMAIL":
			return { field: "email", message: AUTH_MESSAGES.emailInvalid };
		case "PASSWORD_TOO_SHORT":
			return { field: "password", message: AUTH_MESSAGES.passwordTooShort };
		case "PASSWORD_TOO_LONG":
			return { field: "password", message: AUTH_MESSAGES.passwordTooLong };
		case "PASSWORD_BREACHED":
			return { field: "password", message: AUTH_MESSAGES.passwordBreached };
		case "INVALID_NAME":
			return { field: "name", message: AUTH_MESSAGES.name };
		case "INVALID_EMAIL_OR_PASSWORD":
			return { form: AUTH_MESSAGES.wrongCredentials };
	}
	if (error.status === 429) return { form: AUTH_MESSAGES.rateLimited };
	return { form: AUTH_MESSAGES.failed };
}
