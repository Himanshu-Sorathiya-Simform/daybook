"use client";

import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { AppSessionContext } from "@/hooks/useAppSession";
import { isMeKey, ME_KEY, type Me } from "@/lib/api/me";
import { onApiEvent } from "@/lib/api/events";
import { createQueryClient } from "@/lib/api/query-client";

const loadPage = (path: string) => window.location.assign(path);

export type AppProvidersProps = {
	children: ReactNode;
	/** For tests; the app loads the page in full. */
	navigate?: (path: string) => void;
	/** For tests; the app makes its own. */
	queryClient?: QueryClient;
};

/**
 * The browser side of every page (STATE-4, D-507, D-508): one query client, and what API answers
 * mean for the whole app.
 * - A 401 shows the session-expired banner; the next `/api/me` answer hides it.
 * - A 403 `profile_required` opens `/onboarding`, unless the page is already there.
 * - A `premium_required` or `feature_off` refetches `/api/me` (BR-P4-12).
 * - An `/api/me` answer for another user than the last one drops every other cached query
 *   (root 5.2).
 */
export function AppProviders({
	children,
	navigate = loadPage,
	queryClient: given,
}: Readonly<AppProvidersProps>) {
	const [queryClient] = useState(() => given ?? createQueryClient());
	const [expired, setExpired] = useState(false);
	const owner = useRef<string | null>(null);

	useEffect(
		() =>
			onApiEvent((event) => {
				switch (event.type) {
					case "unauthenticated":
						setExpired(true);
						return;
					case "profile_required":
						if (window.location.pathname !== "/onboarding")
							navigate("/onboarding");
						return;
					case "capabilities_changed":
						void queryClient.invalidateQueries({ queryKey: ME_KEY });
						return;
				}
			}),
		[navigate, queryClient],
	);

	useEffect(
		() =>
			queryClient.getQueryCache().subscribe((event) => {
				if (event.type !== "updated" || event.action.type !== "success")
					return;
				if (!isMeKey(event.query.queryKey)) return;
				const userId = (event.query.state.data as Me).user.id;
				const previous = owner.current;
				owner.current = userId;
				if (previous !== null && previous !== userId) {
					queryClient.removeQueries({
						predicate: (query) => !isMeKey(query.queryKey),
					});
				}
				setExpired(false);
			}),
		[queryClient],
	);

	const session = useMemo(
		() => ({ expired, markExpired: () => setExpired(true), navigate }),
		[expired, navigate],
	);

	return (
		<QueryClientProvider client={queryClient}>
			<AppSessionContext value={session}>{children}</AppSessionContext>
		</QueryClientProvider>
	);
}
