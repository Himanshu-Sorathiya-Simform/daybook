import "server-only";
import type { Breakdown, BreakdownGroup, Summary } from "@/lib/transactions/answers";
import type { TxnType } from "@/lib/transactions/model";
import type { TransactionFilter } from "@/lib/transactions/url";
import type { ProfiledContext } from "../context";
import type { Tx } from "../with-user";
import { type Bounds, rollup, type RollupGroup, type RollupRequest } from "./rollup";
import type { Totals } from "./totals";

/** At most this many groups in a breakdown. */
const BREAKDOWN_SIZE = 6;

/** The types a breakdown counts: Out moves only with them (TXN-5). */
const OUT_TYPES: readonly TxnType[] = ["expense", "refund"];

/** The filter narrowed to expense and refund rows, within any `type` filter it has. */
function outRows(filter: TransactionFilter): TransactionFilter {
	const type = filter.type ?? OUT_TYPES;
	return { ...filter, type: type.filter((each) => OUT_TYPES.includes(each)) };
}

/** A breakdown from its rollup groups, which run by weight: for expense and refund rows that
 * is Out, so the first six above zero are the largest (D-480). */
function breakdown(groups: RollupGroup[]): BreakdownGroup[] {
	return groups
		.filter(({ spendingMinor }) => spendingMinor > 0)
		.slice(0, BREAKDOWN_SIZE)
		.map(({ key, label, count, spendingMinor }) => ({
			key,
			label,
			count,
			outMinor: spendingMinor,
		}));
}

/**
 * The summary of the filter's confirmed rows (BR-F03-41, BR-F03-58) in one statement (D-293):
 * count, In, Out and To Goals; the first and last `occurredOn`; and, for each `by` asked, the
 * six largest groups by Out, over the filter's expense and refund rows (D-480). Income and
 * Goal rows never enter a breakdown.
 */
export async function transactionSummary(
	tx: Tx,
	ctx: ProfiledContext,
	filter: TransactionFilter,
	by: readonly Breakdown[],
): Promise<Summary> {
	const requests: RollupRequest[] = [
		{ filter, by: "total" },
		{ filter, by: "bounds" },
		...by.map((each) => ({ filter: outRows(filter), by: each })),
	];
	const [total, bounds, ...groups] = (await rollup(tx, ctx, requests)) as [
		Totals,
		Bounds,
		...RollupGroup[][],
	];
	const summary: Summary = {
		count: total.count,
		incomeMinor: total.incomeMinor,
		spendingMinor: total.spendingMinor,
		toGoalsMinor: total.toGoalsMinor,
		firstOn: bounds?.firstOn ?? null,
		lastOn: bounds?.lastOn ?? null,
	};
	by.forEach((each, index) => {
		const field = each === "category" ? "byCategory" : "byPayee";
		summary[field] = breakdown(groups[index] as RollupGroup[]);
	});
	return summary;
}
