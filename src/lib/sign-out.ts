import { API_TIMEOUT_MS } from "@/lib/api/client";
import { authClient } from "@/lib/auth-client";

/**
 * Calls Better Auth's sign-out and answers its status: 200 for success, the error's status for
 * a refusal, and `null` with no answer at all: offline, a network error, or no answer within
 * the API helper's 20 seconds (D-507, D-515). `signOutCountsAsDone` reads the result.
 */
export async function signOutStatus(): Promise<number | null> {
	if (!navigator.onLine) return null;
	const timer = new AbortController();
	const timeout = setTimeout(() => timer.abort(), API_TIMEOUT_MS);
	try {
		const { error } = await authClient.signOut({
			fetchOptions: { signal: timer.signal },
		});
		return error ? error.status : 200;
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}
