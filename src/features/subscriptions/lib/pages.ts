import { apiFetch } from "@/lib/api/client";
import type { ListAnswer } from "@/lib/transactions/answers";
import type { Transaction } from "@/lib/transactions/model";

/** The most pages one read follows: 5,000 rows, far past the 520 charges of a weekly
 * Subscription's ten years. Reaching it means the cursors loop, which is a bug. */
export const MAX_PAGES = 50;

/**
 * Every row of an F03 list, by following `nextCursor` until it is null (BR-F05-48, D-617).
 * `pathFor` writes the request for a cursor, `null` for the first page. The walk fails as a
 * whole when any page fails, so a count is never taken from part of a set, and it stops as
 * soon as `signal` aborts. A cursor met twice, or more than `MAX_PAGES` pages, throws.
 */
export async function fetchEveryPage(
	pathFor: (cursor: string | null) => string,
	signal: AbortSignal,
): Promise<Transaction[]> {
	const rows: Transaction[] = [];
	const seen = new Set<string>();
	let cursor: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const answer: ListAnswer = await apiFetch<ListAnswer>(pathFor(cursor), {
			signal,
		});
		rows.push(...answer.items);
		if (answer.nextCursor === null) return rows;
		if (seen.has(answer.nextCursor)) {
			throw new RangeError("A list's cursors went in a circle.");
		}
		seen.add(answer.nextCursor);
		cursor = answer.nextCursor;
	}
	throw new RangeError(`A list ran past ${MAX_PAGES} pages.`);
}
