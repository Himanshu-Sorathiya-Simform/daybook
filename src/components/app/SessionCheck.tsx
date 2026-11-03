"use client";

import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";
import { useAppSession } from "@/hooks/useAppSession";

/**
 * The session check (BR-F01-12, D-508), for pages that need a session. Better Auth's session
 * store calls `get-session` on first render, on focus (at most once per 5 seconds), when the
 * connection returns and when another tab changes the session; that call also extends the
 * session. A check that finds no session shows the session-expired banner; one that fails
 * says nothing, since a failure is not an answer.
 */
export function SessionCheck() {
	const { data, isPending, error } = authClient.useSession();
	const { markExpired } = useAppSession();
	const signedOut = !isPending && !error && data === null;
	useEffect(() => {
		if (signedOut) markExpired();
	}, [signedOut, markExpired]);
	return null;
}
