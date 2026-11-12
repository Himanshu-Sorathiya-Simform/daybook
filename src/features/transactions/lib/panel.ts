import { categoryLabel, type CategoryKey } from "@/lib/categories";
import { formatFullDay, formatShortDate, formatTime } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import { isGoalType, type Transaction } from "@/lib/transactions/model";
import { type LabelLocale, transactionCount } from "./labels";
import { TYPE_LABELS } from "./filter-labels";
import type {
	BreakdownGroup,
	PayeeHistoryAnswer,
	SummaryAnswer,
	TransactionAnswer,
	TransactionPageAnswer,
} from "./types";

/** F03 section 8's panel words. */
export const PANEL_TEXT = {
	label: "Transaction details",
	list: "This list",
	byCategory: "Out by category",
	topPayees: "Top payees by Out",
	summaryHint:
		"Select a Transaction to see it here. Up and down arrows move, Enter opens.",
	heading: "Transaction",
	close: "Close details",
	none: "None",
	chargeDeleted: "From a deleted Subscription",
	demo: "Demo data",
	failed: "This Transaction could not be loaded.",
} as const;

/** The panel's hint under a selected row's actions (BR-F03-72). */
export const DETAIL_HINT =
	"E to edit · D to duplicate · Delete to delete · Esc to close";

/** The selected row as the page knows it: from the loaded pages at once, or on its way from
 * `GET /api/transactions/[id]` (BR-F03-53). */
export type PanelSelection =
	| { state: "shown"; row: TransactionAnswer }
	| { state: "loading" }
	| { state: "failed"; onRetry: () => void };

/** The row `id` from the loaded pages, with its page's currency, or undefined when no loaded
 * page holds it (BR-F03-53). */
export function rowInPages(
	pages: readonly TransactionPageAnswer[],
	id: string,
): TransactionAnswer | undefined {
	for (const page of pages) {
		const found = page.items.find((item) => item.id === id);
		if (found) return { ...found, currency: page.currency };
	}
	return undefined;
}

/** Of the row from the pages and the row asked for alone, the one with the higher version, so
 * an edit shows before the list has refetched (BR-F03-73); the one there is when only one is. */
export function newerRow(
	inPages: TransactionAnswer | undefined,
	alone: TransactionAnswer | undefined,
): TransactionAnswer | undefined {
	if (inPages && alone) return alone.version > inPages.version ? alone : inPages;
	return inPages ?? alone;
}

/** How many payees the summary lists of the 6 the summary answers (BR-F03-71, D-520). */
const TOP_PAYEES = 4;

/** The summary's heading (BR-F03-71): "14 Transactions", then "1 Oct to 31 Oct", the one date
 * when the first and last are the same, or nothing with no rows, which have no dates. */
export function summaryHeading(
	{ count, firstOn, lastOn }: Pick<SummaryAnswer, "count" | "firstOn" | "lastOn">,
	locale: Pick<LabelLocale, "today" | "dateLocale">,
): { count: string; span: string | null } {
	const short = (date: string) => formatShortDate(date, locale);
	let span: string | null = null;
	if (firstOn !== null && lastOn !== null) {
		span =
			firstOn === lastOn ?
				short(firstOn)
			:	`${short(firstOn)} to ${short(lastOn)}`;
	}
	return { count: transactionCount(count), span };
}

export type CategoryBar = {
	key: CategoryKey;
	outMinor: number;
	/** The bar's length, from 0 to 1: its Out against the largest. A negative Out, where
	 * refunds outweigh spending, draws no bar. */
	share: number;
};

/** "Out by category" (BR-F03-71): each breakdown entry with its bar against the largest Out. */
export function categoryBars(
	groups: readonly BreakdownGroup[] | undefined,
): CategoryBar[] {
	const entries = groups ?? [];
	const largest = Math.max(0, ...entries.map((each) => each.outMinor));
	return entries.map((each) => ({
		key: each.key as CategoryKey,
		outMinor: each.outMinor,
		share: largest > 0 ? Math.max(0, each.outMinor) / largest : 0,
	}));
}

/** "Top payees by Out" (BR-F03-71): the first 4 of the summary's payees. */
export function topPayees(
	groups: readonly BreakdownGroup[] | undefined,
): BreakdownGroup[] {
	return (groups ?? []).slice(0, TOP_PAYEES);
}

/** A selected row's title (BR-F03-72): the payee, or the Goal row's "To Goal" and "From Goal"
 * until M2 brings Goal names (D-241), as the list words it. */
export function detailTitle(row: Pick<Transaction, "type" | "payee">): string {
	if (!isGoalType(row.type)) return row.payee ?? "";
	return `${row.type === "goal_contribution" ? "To" : "From"} Goal`;
}

/** The Date row (BR-F03-72): "Mon, 19 Oct, 2026 · 10:15 pm", or "· Auto" for a charge. */
export function detailDate(
	row: Pick<Transaction, "occurredAt" | "occurredOn" | "source">,
	locale: Pick<LabelLocale, "dateLocale" | "timezone">,
): string {
	const when =
		row.source === "subscription" ? "Auto" : formatTime(row.occurredAt, locale);
	return `${formatFullDay(row.occurredOn, locale)} · ${when}`;
}

/** The Source row (BR-F03-72): "Demo data" for a demo row; "Added by you"; or for a charge,
 * "Auto from Netflix" while linked and "From a deleted Subscription" once not. */
export function detailSource(
	row: Pick<Transaction, "source" | "demo" | "subscriptionId" | "payee">,
): string {
	if (row.demo) return PANEL_TEXT.demo;
	if (row.source === "manual") return "Added by you";
	return row.subscriptionId === null ?
			PANEL_TEXT.chargeDeleted
		:	`Auto from ${row.payee ?? ""}`;
}

export type DetailRow = { term: string; value: string };

/** The selected row's details (BR-F03-72): Type; Category, or the Goal on a Goal row; Date;
 * Source; and Note, or "None". */
export function detailRows(row: Transaction, locale: LabelLocale): DetailRow[] {
	const goal = isGoalType(row.type);
	return [
		{ term: "Type", value: TYPE_LABELS[row.type] },
		goal ?
			{ term: "Goal", value: "Goal" }
		:	{ term: "Category", value: categoryLabel(row.category ?? "other") },
		{ term: "Date", value: detailDate(row, locale) },
		{ term: "Source", value: detailSource(row) },
		{ term: "Note", value: row.note ?? PANEL_TEXT.none },
	];
}

const ORDINAL_SUFFIX: Record<Intl.LDMLPluralRule, string> = {
	one: "st",
	two: "nd",
	few: "rd",
	other: "th",
	zero: "th",
	many: "th",
};
const ordinals = new Intl.PluralRules("en", { type: "ordinal" });

/** An English ordinal day, "1st", "3rd", "11th", "22nd" (BR-F03-72). */
export function ordinal(day: number): string {
	return `${day}${ORDINAL_SUFFIX[ordinals.select(day)]}`;
}

/** "Swiggy in the last 3 months" (BR-F03-72). */
export function historyTitle(payee: string, months: number): string {
	return `${payee} in the last ${months} months`;
}

/**
 * The payee history line (BR-F03-72): "4 Transactions · ₹3,290.00 · usually around the 3rd".
 * The amount is Out on an expense or refund row and In on an income row; the usual day shows
 * only when the server gives one. `null` with no rows, when the box is left out.
 */
export function historyLine(
	history: Pick<PayeeHistoryAnswer, "count" | "inMinor" | "outMinor" | "usualDay">,
	type: Transaction["type"],
	{ currency, numberLocale }: Pick<LabelLocale, "currency" | "numberLocale">,
): string | null {
	if (history.count === 0) return null;
	const minor = type === "income" ? history.inMinor : history.outMinor;
	const parts = [
		transactionCount(history.count),
		formatMoney(minor, currency, numberLocale),
	];
	if (history.usualDay !== null)
		parts.push(`usually around the ${ordinal(history.usualDay)}`);
	return parts.join(" · ");
}
