import { lowercase } from "@/lib/text";
import type { Group, Transaction } from "@/lib/transactions/model";
import type { GroupTotal } from "@/lib/transactions/answers";
import type { TransactionPageAnswer } from "./types";

/** A run of rows under one group header; `total` is null under no grouping. */
export type ListSection = {
	key: string;
	total: GroupTotal | null;
	rows: Transaction[];
};

/**
 * A row's group key as the server makes it (BR-F03-55): the day; the category; the payee
 * lowercased as Postgres lowers it (D-497); a Goal row's `goal:<goalId>` under category or
 * payee grouping.
 */
export function groupKeyOf(row: Transaction, group: Group): string {
	if (group === "day") return row.occurredOn;
	if (group === "none") return "";
	const own = group === "category" ? row.category : row.payee;
	if (own === null) return `goal:${row.goalId ?? ""}`;
	return group === "category" ? own : lowercase(own);
}

/** Each group's total from the page fetched last that carries it. Pages arrive in display
 * order and the last one is the one fetched last, except after Load earlier, which fetches
 * the first: `newest` then has the last say (BR-F03-56). */
function latestTotals(
	pages: readonly TransactionPageAnswer[],
	newest: TransactionPageAnswer | undefined,
): Map<string, GroupTotal> {
	const fetchedLast = newest && pages.includes(newest) ? newest : null;
	const ordered =
		fetchedLast ?
			[...pages.filter((page) => page !== fetchedLast), fetchedLast]
		:	pages;
	const totals = new Map<string, GroupTotal>();
	for (const page of ordered)
		for (const total of page.groups) totals.set(total.key, total);
	return totals;
}

/**
 * The loaded pages as sections in display order (BR-F03-56). Rows already arrive grouped, so a
 * new section starts wherever the key changes. A group's totals come from the page fetched
 * last that carries it: the last loaded page, or the one `newest` names, so a header never
 * depends on how many of its rows are loaded. Under no grouping, one section holds every row. Rows in `hidden`, deleted in this tab, are left out,
 * and a group left with none goes too; the figures change once the server's answer does
 * (BR-F03-26).
 */
export function sectionsOf(
	pages: readonly TransactionPageAnswer[],
	group: Group,
	hidden: ReadonlySet<string> = new Set(),
	newest?: TransactionPageAnswer,
): ListSection[] {
	const totals = latestTotals(pages, newest);
	const sections: ListSection[] = [];
	for (const page of pages) {
		for (const row of page.items) {
			if (hidden.has(row.id)) continue;
			const key = groupKeyOf(row, group);
			const last = sections.at(-1);
			if (last?.key === key) last.rows.push(row);
			else sections.push({ key, total: totals.get(key) ?? null, rows: [row] });
		}
	}
	return sections;
}
