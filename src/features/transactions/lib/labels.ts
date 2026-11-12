import type { TransactionRowProps } from "@/components/data/TransactionRow";
import { categoryLabel, type CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import { formatDayHeader, formatTime } from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import { shiftDays } from "@/lib/time";
import {
	type Group,
	isGoalType,
	type Transaction,
	type TxnType,
} from "@/lib/transactions/model";
import type { GroupTotal } from "@/server/dal/transactions/list";
import { FILTER_TEXT } from "./messages";

/** How the profile formats dates, times and money (BR-F02-18, BR-F02-19), and its today
 * (TIME-5), which "Today" and "Yesterday" and the current year follow. */
export type LabelLocale = {
	today: string;
	dateLocale: string;
	timezone: string;
	numberLocale: string;
	currency: CurrencyCode;
};

/** The types whose rows add to money free to spend, so they show a plus (D-231). */
const PLUS_TYPES: ReadonlySet<TxnType> = new Set([
	"income",
	"refund",
	"goal_withdrawal",
]);

/** A row's amount with D-231's sign: plus when money becomes free to spend. */
export function signedMinor({
	type,
	amountMinor,
}: Pick<Transaction, "type" | "amountMinor">): number {
	return PLUS_TYPES.has(type) ? amountMinor : -amountMinor;
}

/** A day group's header (BR-F03-31, D-522): "Today", "Yesterday · Sun, 1 Nov", or F02's day
 * format, with the year outside the current year. */
export function dayLabel(date: string, locale: LabelLocale): string {
	if (date === locale.today) return "Today";
	const day = formatDayHeader(date, locale);
	return date === shiftDays(locale.today, -1) ? `Yesterday · ${day}` : day;
}

/** A row's day outside day grouping (BR-F03-31): "Today", else F02's day format; yesterday
 * reads as its day, "Sun, 1 Nov". */
function rowDay(date: string, locale: LabelLocale): string {
	return date === locale.today ? "Today" : formatDayHeader(date, locale);
}

/**
 * The time part of a row's subtitle (BR-F03-31, BR-F03-32, TIME-6). Under day grouping, the
 * time, or "Auto" for a charge. Under any other grouping, the day before the time, "Sat, 31 Oct
 * · 11:50 pm", and a charge's day alone.
 */
export function rowWhen(
	row: Pick<Transaction, "occurredAt" | "occurredOn" | "source">,
	group: Group,
	locale: LabelLocale,
): string {
	const charge = row.source === "subscription";
	if (group === "day") return charge ? "Auto" : formatTime(row.occurredAt, locale);
	const day = rowDay(row.occurredOn, locale);
	return charge ? day : `${day} · ${formatTime(row.occurredAt, locale)}`;
}

/** Category and payee groups key Goal rows as `goal:<goalId>` (BR-F03-55). */
const GOAL_KEY = "goal:";

/**
 * A group's label (BR-F03-55, BR-F03-56, D-522): the day label; the category's label; the
 * payee's label from the page; or for a Goal group, the Goal's name with " (Goal)".
 */
export function groupLabel(
	group: Exclude<Group, "none">,
	total: Pick<GroupTotal, "key" | "label">,
	locale: LabelLocale,
): string {
	if (group === "day") return dayLabel(total.key, locale);
	if (total.key.startsWith(GOAL_KEY)) return `${total.label ?? ""} (Goal)`;
	if (group === "category") return categoryLabel(total.key as CategoryKey);
	return total.label ?? total.key;
}

/**
 * A group's figures (BR-F03-56, D-522): those that are not zero, joined by " · ": "In ₹85,000.00
 * · Out ₹18,000.00". To Goals reads "To Goals ₹2,000.00" when positive and "From Goals
 * +₹1,000.00" when negative; a negative Out keeps its minus (TXN-7). Category and payee groups
 * start with the count, "4 · Out ₹6,220.00".
 */
export function groupFigures(
	group: Exclude<Group, "none">,
	total: Pick<GroupTotal, "count" | "inMinor" | "outMinor" | "toGoalsMinor">,
	{ currency, numberLocale }: Pick<LabelLocale, "currency" | "numberLocale">,
): string {
	const money = (minor: number, sign: "negative" | "always" = "negative") =>
		formatMoney(minor, currency, numberLocale, { signDisplay: sign });
	const parts: string[] = [];
	if (group !== "day") parts.push(String(total.count));
	if (total.inMinor !== 0) parts.push(`In ${money(total.inMinor)}`);
	if (total.outMinor !== 0) parts.push(`Out ${money(total.outMinor)}`);
	if (total.toGoalsMinor > 0) parts.push(`To Goals ${money(total.toGoalsMinor)}`);
	if (total.toGoalsMinor < 0)
		parts.push(`From Goals ${money(-total.toGoalsMinor, "always")}`);
	return parts.join(" · ");
}

/** "1 Transaction", "50 Transactions" (F03 section 8's singular rule). */
export function transactionCount(count: number): string {
	return `${count} ${count === 1 ? "Transaction" : "Transactions"}`;
}

/** The filter sheet's apply button (BR-F03-39): "Show 12 Transactions", "No matches" for none,
 * and "Show Transactions" while the count is on its way. */
export function showLabel(count: number | undefined): string {
	if (count === undefined) return "Show Transactions";
	if (count === 0) return FILTER_TEXT.noMatches;
	return `Show ${transactionCount(count)}`;
}

/** The polite announcement after a page loads (BR-F03-30, D-530): "Loaded 50 more
 * Transactions", or the short last page's own count. */
export function loadedMessage(count: number): string {
	return `Loaded ${count} more ${count === 1 ? "Transaction" : "Transactions"}`;
}

/**
 * What a list row shows for a Transaction (BR-F03-32), for `TransactionRow`. A Goal row reads
 * "To <Goal>" or "From <Goal>"; until M2 brings Goal names to the list (D-241), "To Goal" and
 * "From Goal".
 */
export function rowDisplay(
	row: Transaction,
	group: Group,
	locale: LabelLocale,
): Omit<TransactionRowProps, "density" | "className"> {
	const goal = isGoalType(row.type);
	const direction = row.type === "goal_contribution" ? "To" : "From";
	const shown = {
		title: goal ? `${direction} Goal` : (row.payee ?? ""),
		goal,
		when: rowWhen(row, group, locale),
		amountMinor: signedMinor(row),
		currency: locale.currency,
		numberLocale: locale.numberLocale,
	};
	return {
		...shown,
		...(row.payee === null ? {} : { payee: row.payee }),
		...(row.category === null ? {} : { category: row.category }),
		...(row.description === null ? {} : { description: row.description }),
	};
}

/**
 * A list row's name for screen readers, which React Aria takes from the row's text value: what
 * the row shows, in order, "Swiggy, Food, 11:50 pm, −₹380.00", with a description read after
 * its category, "BigBasket, Food: Monthly groceries, …".
 */
export function rowName(
	shown: Pick<
		TransactionRowProps,
		| "title"
		| "category"
		| "goal"
		| "description"
		| "when"
		| "amountMinor"
		| "status"
	>,
	{ currency, numberLocale }: Pick<LabelLocale, "currency" | "numberLocale">,
): string {
	const parts = [shown.title];
	if (!shown.goal) {
		const label = categoryLabel(shown.category ?? "other");
		parts.push(shown.description ? `${label}: ${shown.description}` : label);
	}
	parts.push(shown.when);
	if (shown.status === "pending") parts.push("Pending sync");
	if (shown.status === "rejected") parts.push("Not saved");
	parts.push(
		formatMoney(shown.amountMinor, currency, numberLocale, {
			signDisplay: "always",
		}),
	);
	return parts.join(", ");
}
