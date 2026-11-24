import type { SubscriptionItem } from "./types";

/** The query parameter that opens a Subscription: `/subscriptions?open=<id>` (BR-F05-21). */
export const OPEN_PARAM = "open";

/** What a deep link selects: the Subscription's id, and whether it is an ended one, whose
 * group the list then shows expanded with all its rows (BR-F05-21). */
export type OpenTarget = { id: string; ended: boolean };

/** The id in `?open=`, or `null` when there is none or it is empty. */
export function readOpenParam(params: URLSearchParams): string | null {
	const id = params.get(OPEN_PARAM);
	return id === null || id === "" ? null : id;
}

/** The Subscription a deep link names, or `null` for an unknown id, which selects nothing
 * (BR-F05-21). */
export function openTarget(
	items: readonly Pick<SubscriptionItem, "id" | "status">[],
	id: string,
): OpenTarget | null {
	const item = items.find((candidate) => candidate.id === id);
	return item ? { id: item.id, ended: item.status === "ended" } : null;
}

/** The page's own URL with `open` removed and every other parameter and the hash kept. */
export function withoutOpen(href: string, origin: string): string {
	const url = new URL(href, origin);
	url.searchParams.delete(OPEN_PARAM);
	return `${url.pathname}${url.search}${url.hash}`;
}

/** View charges (BR-F05-23): the Transactions page filtered to one Subscription's charges. */
export const chargesHref = (id: string): string =>
	`/transactions?sub=${encodeURIComponent(id)}`;
