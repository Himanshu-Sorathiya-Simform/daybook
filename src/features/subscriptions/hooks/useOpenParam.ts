import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import {
	type OpenTarget,
	openTarget,
	readOpenParam,
	withoutOpen,
} from "../lib/deep-link";
import type { SubscriptionItem } from "../lib/types";

/**
 * The deep link `/subscriptions?open=<id>` (BR-F05-21, D-593): once the list is known, it tells
 * `onOpen` which Subscription to select, or `null` for an id that is not in the list, and
 * removes the parameter either way, keeping the rest of the URL. It is read once per id, so a
 * refetch that changes the items does not select it again; a later link starts it afresh.
 */
export function useOpenParam(
	items: readonly Pick<SubscriptionItem, "id" | "status">[] | undefined,
	onOpen: (target: OpenTarget | null) => void,
) {
	const searchParams = useSearchParams();
	const id = readOpenParam(new URLSearchParams(searchParams.toString()));
	const handled = useRef<string | null>(null);

	useEffect(() => {
		if (id === null) {
			handled.current = null;
			return;
		}
		if (items === undefined || handled.current === id) return;
		handled.current = id;
		onOpen(openTarget(items, id));
		// Next's router starts following the history API in an effect of its own component,
		// which runs after this one on the first render; a microtask later it is listening.
		queueMicrotask(() => {
			window.history.replaceState(
				null,
				"",
				withoutOpen(window.location.href, window.location.origin),
			);
		});
	}, [id, items, onOpen]);
}
