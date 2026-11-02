import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { signOutCountsAsDone, writeLogoutMarker } from "@/lib/logout-marker";
import { signOutStatus } from "@/lib/sign-out";
import { useAppSession } from "./useAppSession";

/** Where an offline logout goes once the connection returns: the server revokes the session
 * and clears the cookies, then opens login (BR-P2-39). */
export const LOGOUT_REVOKE_PATH = "/api/session/expired?reason=logout";

/** `running` while sign-out is under way; `offline` once an offline logout has finished in
 * this tab and the login screen shows. */
export type LogoutState = "idle" | "running" | "offline";

/**
 * Log out before P1 (F01 section 2, D-502, D-515):
 * 1. sign-out, with no second one while it runs;
 * 2. a sign-out that did not count as done writes the marker's cookie (BR-F01-15);
 * 3. the in-memory query cache is cleared;
 * 4. online, `/login` loads; offline, the tab shows the login screen and loads
 *    `LOGOUT_REVOKE_PATH` when the connection returns.
 */
export function useLogout() {
	const queryClient = useQueryClient();
	const { navigate } = useAppSession();
	const [state, setState] = useState<LogoutState>("idle");
	const started = useRef(false);

	useEffect(() => {
		if (state !== "offline") return;
		const back = () => navigate(LOGOUT_REVOKE_PATH);
		window.addEventListener("online", back);
		return () => window.removeEventListener("online", back);
	}, [state, navigate]);

	async function logout(): Promise<void> {
		if (started.current) return;
		started.current = true;
		setState("running");
		if (!signOutCountsAsDone(await signOutStatus())) writeLogoutMarker();
		queryClient.clear();
		if (navigator.onLine) navigate("/login");
		else setState("offline");
	}

	return { state, logout };
}
