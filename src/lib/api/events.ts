/** What `apiFetch` tells the app about an answer, whichever page asked (STATE-4, D-507). */
export type ApiEvent =
	/** A 401 from a Daybook route: the session has expired (BR-F01-13). */
	| { type: "unauthenticated" }
	/** A 403 `profile_required`: onboarding is not done (BR-F02-01). */
	| { type: "profile_required" }
	/** A `premium_required` or `feature_off`: `/api/me` is out of date (BR-P4-12). */
	| { type: "capabilities_changed" };

type Listener = (event: ApiEvent) => void;

const listeners = new Set<Listener>();

/** Calls `listener` with every event until the returned function is called. */
export function onApiEvent(listener: Listener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function emitApiEvent(event: ApiEvent): void {
	// A copy, so a listener that unsubscribes while being called does not skip another.
	for (const listener of [...listeners]) listener(event);
}
