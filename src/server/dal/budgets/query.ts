import "server-only";
import type { ExpenseCategory } from "@/lib/budgets/model";
import { inRange, isMonth, type Month, monthRange } from "@/lib/budgets/months";
import { EXPENSE_CATEGORIES } from "@/lib/categories";
import { badParams, single } from "../transactions/query";

/** History's month count: 1 to 49, enough for any preview (BR-F04-35), 6 by default. */
export const HISTORY_MONTHS = { min: 1, max: 49, default: 6 } as const;

const DIGITS = /^\d+$/;
const YEAR = /^\d{4}$/;

/** A month parameter: present once, `YYYY-MM`, inside the range of `current` (BR-F04-07,
 * D-566). `undefined` when absent; `null` when refused. */
function readMonth(
	query: URLSearchParams,
	name: string,
	current: Month,
): Month | undefined | null {
	const raw = single(query, name);
	if (raw === undefined) return undefined;
	if (raw === null || !isMonth(raw) || !inRange(raw, monthRange(current)))
		return null;
	return raw;
}

/** `GET /api/budgets`'s query (F04 section 11): `month`, the current month by default. A month
 * that is invalid, repeated or outside the range is 400 `bad_request` naming it (D-478).
 * Unknown names are ignored (D-458). */
export function readMonthQuery(query: URLSearchParams, current: Month): Month {
	const month = readMonth(query, "month", current);
	if (month === null) throw badParams(["month"]);
	return month ?? current;
}

export type HistoryQuery = { category: ExpenseCategory; to: Month; count: number };

/** `GET /api/budgets/history`'s query (BR-F04-35): `category`, an expense category; `to`, a
 * month in the range; `months`, 1 to 49, 6 by default. Every invalid or missing parameter is
 * named in one 400, in this order. */
export function readHistoryQuery(
	query: URLSearchParams,
	current: Month,
): HistoryQuery {
	const refused: string[] = [];
	const category = single(query, "category");
	const known = (EXPENSE_CATEGORIES as readonly string[]).includes(category ?? "");
	if (!known) refused.push("category");
	const to = readMonth(query, "to", current);
	if (to == null) refused.push("to");
	const rawCount = single(query, "months");
	let count: number = HISTORY_MONTHS.default;
	if (rawCount === null) refused.push("months");
	else if (rawCount !== undefined) {
		count = DIGITS.test(rawCount) ? Number.parseInt(rawCount, 10) : Number.NaN;
		if (!(count >= HISTORY_MONTHS.min && count <= HISTORY_MONTHS.max)) {
			refused.push("months");
		}
	}
	if (refused.length > 0) throw badParams(refused);
	return { category: category as ExpenseCategory, to: to as Month, count };
}

/** `GET /api/budgets/summary`'s query (BR-F04-35): `year`, four digits, holding at least one
 * month of the range (on golden, 2023 to 2027). Missing, repeated or outside: 400. */
export function readSummaryQuery(query: URLSearchParams, current: Month): number {
	const raw = single(query, "year");
	const range = monthRange(current);
	if (
		typeof raw !== "string"
		|| !YEAR.test(raw)
		|| raw < range.first.slice(0, 4)
		|| raw > range.last.slice(0, 4)
	) {
		throw badParams(["year"]);
	}
	return Number.parseInt(raw, 10);
}
