import { CATEGORY_LABELS } from "@/lib/categories";
import { compareCodeUnits } from "@/lib/compare";
import { formatPercent, percentTenths } from "@/lib/money";
import { lowercase } from "@/lib/text";
import { compareByName } from "@/lib/subscriptions/model";
import type { SubscriptionStatus } from "@/lib/subscriptions/model";
import { amountWithCadence, type Formats, money, shortDate } from "./labels";
import type { SubscriptionItem, SubscriptionList } from "./types";

export type TableColumn =
	| "name"
	| "category"
	| "price"
	| "perMonth"
	| "share"
	| "perYear"
	| "nextDue"
	| "status";

export type SortDirection = "asc" | "desc";

/** The columns in order (BR-F05-39). `firstDirection` is the direction a first press sorts in:
 * text columns and Next due ascending, figures descending. */
export const TABLE_COLUMNS: readonly {
	id: TableColumn;
	label: string;
	numeric: boolean;
	firstDirection: SortDirection;
}[] = [
	{ id: "name", label: "Name", numeric: false, firstDirection: "asc" },
	{ id: "category", label: "Category", numeric: false, firstDirection: "asc" },
	{ id: "price", label: "Price", numeric: true, firstDirection: "desc" },
	{ id: "perMonth", label: "Per month", numeric: true, firstDirection: "desc" },
	{ id: "share", label: "Share", numeric: false, firstDirection: "desc" },
	{ id: "perYear", label: "Per year", numeric: true, firstDirection: "desc" },
	{ id: "nextDue", label: "Next due", numeric: false, firstDirection: "asc" },
	{ id: "status", label: "Status", numeric: false, firstDirection: "asc" },
];

/** What the table is sorted by until a heading is pressed: Per month, largest first
 * (BR-F05-39). */
export const DEFAULT_SORT = {
	column: "perMonth",
	direction: "desc",
} as const satisfies { column: TableColumn; direction: SortDirection };

/** "Ended Subscriptions aren't in the table or the totals. Select a column heading to sort." */
export const TABLE_CAPTION =
	"Ended Subscriptions aren't in the table or the totals. Select a column heading to sort.";

/** The Status column's words (BR-F05-39). Ended Subscriptions are not in the table. */
export const STATUS_LABELS: Record<Exclude<SubscriptionStatus, "ended">, string> = {
	active: "Active",
	ending: "Ending",
	upcoming: "Starts soon",
	paused: "Paused",
};

/** One row of the table, with what its cells write and what its columns sort by. */
export type TableRow = {
	id: string;
	item: SubscriptionItem;
	name: string;
	categoryLabel: string;
	/** "₹649.00 a month". */
	price: string;
	/** The amount, which Price sorts by. */
	amountMinor: number;
	perMonth: string;
	monthlyMinor: number;
	perYear: string;
	yearlyMinor: number;
	/** The share of the yearly total in tenths of a percent, or `null` for a Subscription with
	 * no next due date, which is not counted. */
	shareTenths: number | null;
	/** "3.2%", or "—". */
	share: string;
	/** "5 Nov", "12 Oct 2027" or "—". */
	nextDue: string;
	nextDueOn: string | null;
	status: string;
};

const NONE = "—";

/**
 * The table's rows (BR-F05-39): every Subscription that is not ended, with its price, its
 * monthly and yearly cost, its share of the yearly total, its next due date and its status
 * in words. One with no next due date shows its costs but no share and no next due date, since
 * the totals leave it out (BR-F05-17). The share is the item's yearly cost of the list's yearly
 * total, written with one decimal (MON-8).
 */
export function tableRows(
	list: Pick<SubscriptionList, "items" | "totals">,
	f: Formats,
): TableRow[] {
	return list.items
		.filter((item) => item.status !== "ended")
		.map((item) => {
			const counted = item.nextDueOn !== null;
			const total = list.totals.yearlyMinor;
			return {
				id: item.id,
				item,
				name: item.name,
				categoryLabel: CATEGORY_LABELS[item.category],
				price: amountWithCadence(item, f),
				amountMinor: item.amountMinor,
				perMonth: money(item.monthlyMinor, f),
				monthlyMinor: item.monthlyMinor,
				perYear: money(item.yearlyMinor, f),
				yearlyMinor: item.yearlyMinor,
				shareTenths:
					counted && total !== 0 ?
						percentTenths(item.yearlyMinor, total)
					:	null,
				share:
					counted ?
						// A zero total reads "—" (MON-8).
						formatPercent(item.yearlyMinor, total, f.numberLocale)
					:	NONE,
				nextDue:
					item.nextDueOn === null ? NONE : shortDate(item.nextDueOn, f),
				nextDueOn: item.nextDueOn,
				status: STATUS_LABELS[item.status as keyof typeof STATUS_LABELS],
			};
		});
}

/** The key a column sorts a row by. Share sorts as Per month (BR-F05-39); text compares by code
 * unit after lower-casing, as BR-F05-20's names do. */
function key(row: TableRow, column: TableColumn): string | number | null {
	switch (column) {
		case "name":
			return row.name;
		case "category":
			return row.categoryLabel;
		case "price":
			return row.amountMinor;
		case "perMonth":
		case "share":
			return row.monthlyMinor;
		case "perYear":
			return row.yearlyMinor;
		case "nextDue":
			return row.nextDueOn;
		case "status":
			return row.status;
	}
}

/**
 * The rows sorted by a column in a direction (BR-F05-39). Text sorts by code unit, figures
 * numerically, Next due by its date; a row with no next due date sorts last in either
 * direction. Rows that tie keep name order, then id, whichever the direction, so a sort never
 * reshuffles them between renders.
 */
export function sortTableRows(
	rows: readonly TableRow[],
	{ column, direction }: { column: TableColumn; direction: SortDirection },
): TableRow[] {
	const sign = direction === "asc" ? 1 : -1;
	return [...rows].sort((a, b) => {
		const x = key(a, column);
		const y = key(b, column);
		if (column === "nextDue" && (x === null || y === null)) {
			if (x === y) return compareByName(a, b);
			return x === null ? 1 : -1;
		}
		let order = 0;
		if (typeof x === "number" && typeof y === "number") {
			order =
				x === y ? 0
				: x < y ? -1
				: 1;
		} else {
			order = compareCodeUnits(lowercase(String(x)), lowercase(String(y)));
		}
		return order * sign || compareByName(a, b);
	});
}

/** The Total row: "Total · 4" with the monthly and yearly totals, which the list gives and which
 * cover only the Subscriptions with a next due date (BR-F05-17, BR-F05-39). */
export function tableTotal(
	totals: SubscriptionList["totals"],
	f: Formats,
): { label: string; perMonth: string; perYear: string } {
	return {
		label: `Total · ${totals.count}`,
		perMonth: money(totals.monthlyMinor, f),
		perYear: money(totals.yearlyMinor, f),
	};
}
