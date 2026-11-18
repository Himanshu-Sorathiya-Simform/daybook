import type { UseQueryResult } from "@tanstack/react-query";

import { useOnline } from "@/hooks/useOnline";

/**
 * A read that is not kept offline (F04 section 10, D-574): the history and the year summary.
 * While the browser is offline, even a result read earlier in the session reads as a read that
 * never ran: no data, no error, paused. Every figure drawn from it is then missing, as it is
 * when the dialog or the page opens offline. Online again, the cached result is back at once.
 */
export function useNotKeptOffline<TData, TError>(
	query: UseQueryResult<TData, TError>,
): UseQueryResult<TData, TError> {
	const online = useOnline();
	if (online) return query;
	return {
		...query,
		data: undefined,
		error: null,
		status: "pending",
		fetchStatus: "paused",
		isPending: true,
		isLoading: false,
		isSuccess: false,
		isError: false,
		isFetching: false,
		isPaused: true,
	} as UseQueryResult<TData, TError>;
}
