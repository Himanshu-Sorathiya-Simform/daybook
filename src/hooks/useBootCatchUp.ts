import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { apiFetch } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { refreshAfterChargeChange } from "@/lib/api/refresh";
import type { CatchUpAnswer } from "@/lib/subscriptions/answers";
import { useOnline } from "./useOnline";

const CATCH_UP_PATH = "/api/sync/catch-up";

/**
 * The boot catch-up (root 5.2 steps 5 and 6, F05 flow 7.2, D-181): once the app has started
 * and each time it comes back online, `POST /api/sync/catch-up` creates the charges that are
 * due. When it created some, every read that holds them refreshes. Before M5 no queue waits, so
 * it is never skipped here. A failure says nothing: the lazy check has already made the
 * numbers right, and the next start tries again.
 * Use it where a session and a profile exist.
 */
export function useBootCatchUp() {
	const queryClient = useQueryClient();
	const online = useOnline();
	const { mutate } = useMutation({
		mutationKey: [QUERY_ROOTS.subscriptions, "catch-up"],
		networkMode: "always",
		mutationFn: () => apiFetch<CatchUpAnswer>(CATCH_UP_PATH, { method: "POST" }),
		onSuccess: (answer) =>
			answer.chargesCreated > 0 ?
				refreshAfterChargeChange(queryClient)
			:	undefined,
	});
	// What the last effect saw, so a repeated effect run (Strict Mode, a re-render) sends
	// nothing and only a change of connection does.
	const seen = useRef<boolean | null>(null);
	useEffect(() => {
		if (seen.current === online) return;
		seen.current = online;
		if (online) mutate();
	}, [online, mutate]);
}
