import { authClient } from "@/lib/auth-client";
import {
	clearLogoutMarker,
	hasLogoutMarker,
	signOutCountsAsDone,
} from "@/lib/logout-marker";

/**
 * Before Log in or Create account (F01, BR-F01-15, D-384): if a logout never finished, sign the
 * old session out first, so the old marker can never revoke the new session. Answers whether
 * the form may go on. Without a marker it goes on at once.
 */
export async function finishOldLogout(): Promise<boolean> {
	if (!hasLogoutMarker()) return true;
	let status: number | null;
	try {
		const { error } = await authClient.signOut();
		status = error ? error.status : 200;
	} catch {
		status = null;
	}
	if (!signOutCountsAsDone(status)) return false;
	clearLogoutMarker();
	return true;
}
