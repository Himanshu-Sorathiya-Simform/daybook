import { queryOptions } from "@tanstack/react-query";

import type { Me } from "@/server/dal/me";
import { apiFetch } from "./client";
import { isUnder, QUERY_ROOTS } from "./query-keys";

export type { Me } from "@/server/dal/me";

/** The `/api/me` query's key. */
export const ME_KEY = [QUERY_ROOTS.me] as const;

export const isMeKey = (key: readonly unknown[]): boolean =>
	isUnder(key, QUERY_ROOTS.me);

/** How long an `/api/me` answer stays fresh: focus refetches it only when older (BR-P4-12). */
export const ME_STALE_MS = 60_000;

/** `/api/me`'s read (STATE-5): an app-wide read, so its factory lives here and its hook in
 * `src/hooks/useMe`. */
export function meOptions() {
	return queryOptions({
		queryKey: ME_KEY,
		queryFn: ({ signal }) => apiFetch<Me>("/api/me", { signal }),
		staleTime: ME_STALE_MS,
		refetchOnWindowFocus: true,
	});
}
