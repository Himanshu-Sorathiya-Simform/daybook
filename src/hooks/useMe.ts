import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";
import type { Me } from "@/server/dal/me";

export type { Me } from "@/server/dal/me";

/** The `/api/me` query's key. */
export const ME_KEY = ["me"] as const;

export const isMeKey = (key: readonly unknown[]): boolean => key[0] === ME_KEY[0];

/** How long an `/api/me` answer stays fresh: focus refetches it only when older (BR-P4-12). */
export const ME_STALE_MS = 60_000;

/** `/api/me`: fetched on first use, and on window focus once 60 seconds old (BR-P4-12). Use
 * it only where a session exists: a 401 here means the session expired (STATE-4). */
export function useMe() {
	return useQuery({
		queryKey: ME_KEY,
		queryFn: ({ signal }) => apiFetch<Me>("/api/me", { signal }),
		staleTime: ME_STALE_MS,
		refetchOnWindowFocus: true,
	});
}
