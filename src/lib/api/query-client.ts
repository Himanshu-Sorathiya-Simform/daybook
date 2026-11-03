import { QueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "./client";

/** A failed query is tried at most this many more times (STATE-4, D-507). */
export const MAX_QUERY_RETRIES = 2;

/** Whether a failed query runs again: only after no answer, no answer in time, 429 or a 5xx,
 * and at most twice. A 4xx would only repeat the same refusal, and an error that is not an
 * API error is a bug that retrying hides. `failureCount` counts the failures before this one. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
	if (failureCount >= MAX_QUERY_RETRIES) return false;
	if (!(error instanceof ApiRequestError)) return false;
	if (error.kind !== "http") return true;
	return error.status === 429 || (error.status !== null && error.status >= 500);
}

/** The app's query client. Mutations never retry by themselves (D-507): a retry is the user's
 * choice, sent again with the same `Idempotency-Key`. */
export function createQueryClient(): QueryClient {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: shouldRetryQuery },
			mutations: { retry: false },
		},
	});
}
