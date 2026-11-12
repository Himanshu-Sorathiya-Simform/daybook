/** Where sign-up leaves the typed email for the login form (BR-F01-31, D-510). */
const KEY = "daybook.login-email";

/** Leaves `email` for the login form, as "Log in instead." opens it. Storage that is blocked or
 * full only means the login form starts empty. */
export function handOverEmail(email: string): void {
	try {
		sessionStorage.setItem(KEY, email.trim());
	} catch {
		// The form works the same without it.
	}
}

/** The email sign-up left, once: it is removed as it is read, so a later visit to login starts
 * empty. `null` when there is none. */
export function takeHandedEmail(): string | null {
	try {
		const email = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
		return email || null;
	} catch {
		return null;
	}
}
