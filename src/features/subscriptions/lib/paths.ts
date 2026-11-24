import { firstDayOf, lastDayOf, type Month } from "@/lib/budgets/months";
import { MAX_LIMIT } from "@/lib/transactions/model";

/** The list and a create (F05 section 11). */
export const SUBSCRIPTIONS_PATH = "/api/subscriptions";

/** One Subscription's change and delete. */
export function subscriptionPath(id: string): string {
	return `${SUBSCRIPTIONS_PATH}/${encodeURIComponent(id)}`;
}

/** Skipping a due date (BR-F05-26). */
export function skipsPath(id: string): string {
	return `${subscriptionPath(id)}/skips`;
}

/** Bringing a skipped date back (BR-F05-27). */
export function skipPath(id: string, dueOn: string): string {
	return `${skipsPath(id)}/${encodeURIComponent(dueOn)}`;
}

/** Each month from `from` to `to`, charged and expected (BR-F05-36). */
export function monthsPath(from: Month, to: Month): string {
	return `${SUBSCRIPTIONS_PATH}/months?from=${from}&to=${to}`;
}

/** Rows per request when a whole set of charges is read (BR-F05-48). */
export const CHARGES_PAGE_SIZE = MAX_LIMIT;

/**
 * One page of F03's list for a set of charges (BR-F05-48): the filter in BR-F03-33's order,
 * then `group=none`, which drops the group totals the page never reads, the page size and the
 * cursor, which is base64url and so passes unchanged. The sort stays at its default, so a
 * cursor made for one page fits the next. No amount is filtered, so no currency is needed.
 */
function chargesPage(filter: string[], cursor: string | null): string {
	const pairs = [...filter, "group=none", `limit=${CHARGES_PAGE_SIZE}`];
	if (cursor !== null) pairs.push(`cursor=${encodeURIComponent(cursor)}`);
	return `/api/transactions?${pairs.join("&")}`;
}

/** The charges dated in `month`, deleted Subscriptions' included (BR-F05-38). */
export function monthChargesPath(month: Month, cursor: string | null): string {
	return chargesPage(
		[`from=${firstDayOf(month)}`, `to=${lastDayOf(month)}`, "src=subscription"],
		cursor,
	);
}

/** One Subscription's linked charges, for its timeline and the dialogs' previews. */
export function subscriptionChargesPath(id: string, cursor: string | null): string {
	return chargesPage([`sub=${encodeURIComponent(id)}`], cursor);
}

/** The expenses that may already hold a Subscription's past charges (BR-F05-04): `q` is the
 * name as F03 searches it. */
export function duplicatesPath(
	q: string,
	from: string,
	to: string,
	cursor: string | null,
): string {
	return chargesPage(
		[`from=${from}`, `to=${to}`, "type=expense", `q=${encodeURIComponent(q)}`],
		cursor,
	);
}
