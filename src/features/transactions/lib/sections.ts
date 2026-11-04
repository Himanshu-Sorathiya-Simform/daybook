import { lowercase } from "@/lib/text";
import type { Group, Transaction } from "@/lib/transactions/model";
import type { GroupTotal } from "@/server/dal/transactions/list";
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

/**
 * The loaded pages as sections in display order (BR-F03-56). Rows already arrive grouped, so a
 * new section starts wherever the key changes. A group's totals come from the last loaded page
 * that carries it, so a header never depends on how many of its rows are loaded. Under no
 * grouping, one section holds every row.
 */
export function sectionsOf(
	pages: readonly TransactionPageAnswer[],
	group: Group,
): ListSection[] {
	const totals = new Map<string, GroupTotal>();
	for (const page of pages)
		for (const total of page.groups) totals.set(total.key, total);

	const sections: ListSection[] = [];
	for (const page of pages) {
		for (const row of page.items) {
			const key = groupKeyOf(row, group);
			const last = sections.at(-1);
			if (last && last.key === key) last.rows.push(row);
			else sections.push({ key, total: totals.get(key) ?? null, rows: [row] });
		}
	}
	return sections;
}
