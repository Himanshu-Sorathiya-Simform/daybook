import type { CurrencyCode } from "@/lib/currency";
import {
	formatDateYear,
	formatDayHeader,
	formatDayMonth,
	formatShortDate,
	formatWeekday,
} from "@/lib/date-format";
import { formatMoney } from "@/lib/money";
import { type Cadence, presetOf } from "@/lib/subscriptions/schedule";
import { daysInRange } from "@/lib/time";
import type { SubscriptionItem } from "./types";

/** What the page writes dates and figures with: the profile's formats (MON-4, BR-F02-19,
 * D-618), and its today (TIME-5), which decides the current year and every relative line. */
export type Formats = {
	currency: CurrencyCode;
	numberLocale: string;
	dateLocale: string;
	today: string;
};

/** An amount in the user's format with the currency's symbol: "₹649.00" (BR-F05-49). */
export const money = (minor: number, f: Formats): string =>
	formatMoney(minor, f.currency, f.numberLocale);

/** The short date, with the year only outside the current year: "5 Nov", "12 Oct 2027". */
export const shortDate = (date: string, f: Formats): string =>
	formatShortDate(date, f);

/** How many days from `from` to `to`: 3 for 2 to 5 November, negative when `to` is earlier. */
function daysBetween(from: string, to: string): number {
	return daysInRange(from, to) - 1;
}

/**
 * A date as the row's date column and the phone's line write it (BR-F05-22): with its weekday
 * in the current year, "Thu, 5 Nov" in `en-IN`, and without one in another year, "12 Oct 2027"
 * (D-618).
 */
export function dayWithWeekday(date: string, f: Formats): string {
	return date.slice(0, 4) === f.today.slice(0, 4) ?
			formatDayHeader(date, f)
		:	formatShortDate(date, f);
}

/**
 * How far off a date is, in words (BR-F05-22): "today", "tomorrow", "in 3 days" up to 45 days,
 * then "in 2 months" (days ÷ 30.44, rounded) and "in a year" from 12 months. A date that has
 * passed since the list was read, with the page left open past midnight, reads "yesterday" or
 * "3 days ago" until the list reloads (D-619).
 */
export function relativeDay(date: string, today: string): string {
	const days = daysBetween(today, date);
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days === -1) return "yesterday";
	if (days < 0) return `${-days} days ago`;
	if (days <= 45) return `in ${days} days`;
	const months = Math.round(days / 30.44);
	return months >= 12 ? "in a year" : `in ${months} months`;
}

/** A cadence in the words that follow an amount (BR-F05-22): "a month", "a week", "a year",
 * "every 2 weeks", "every 3 months". */
export function cadenceWords(cadence: Cadence): string {
	const { unit, every } = cadence;
	if (unit === "week") return every === 1 ? "a week" : `every ${every} weeks`;
	if (every === 1) return "a month";
	return every === 12 ? "a year" : `every ${every} months`;
}

const PRESET_LABELS = {
	weekly: "Weekly",
	monthly: "Monthly",
	quarterly: "Every 3 months",
	yearly: "Yearly",
} as const;

/** A cadence as the Subscription dialog names it (BR-F05-24): "Weekly", "Monthly",
 * "Every 3 months", "Yearly", or for a custom one "Every 2 weeks", "Every 7 months". */
export function cadenceLabel(cadence: Cadence): string {
	const preset = presetOf(cadence);
	if (preset !== "custom") return PRESET_LABELS[preset];
	return `Every ${cadence.every} ${cadence.unit}s`;
}

/** The amount with its cadence (BR-F05-22): "₹649.00 a month", "₹240.00 every 2 weeks". */
export function amountWithCadence(
	item: Pick<SubscriptionItem, "amountMinor" | "cadence">,
	f: Formats,
): string {
	return `${money(item.amountMinor, f)} ${cadenceWords(item.cadence)}`;
}

/** "≈ ₹124.92 a month" for every cadence other than monthly; `null` for a monthly one, whose
 * amount already is the month's (BR-F05-22). */
export function monthlyHint(
	item: Pick<SubscriptionItem, "monthlyMinor" | "cadence">,
	f: Formats,
): string | null {
	return presetOf(item.cadence) === "monthly" ? null : (
			`≈ ${money(item.monthlyMinor, f)} a month`
		);
}

/** The row's date column, over and under (BR-F05-22): the next due date over how far off it
 * is ("resumes" for a paused one); "Ended" over its end date; "No more charges" over when it
 * ends, or nothing. */
export function rowDate(
	item: Pick<SubscriptionItem, "status" | "nextDueOn" | "endDate">,
	f: Formats,
): { top: string; sub: string } {
	if (item.status === "ended") {
		return {
			top: "Ended",
			sub: item.endDate === null ? "" : formatDateYear(item.endDate, f),
		};
	}
	if (item.nextDueOn !== null) {
		return {
			top: dayWithWeekday(item.nextDueOn, f),
			sub:
				item.status === "paused" ?
					"resumes"
				:	relativeDay(item.nextDueOn, f.today),
		};
	}
	return {
		top: "No more charges",
		sub: item.endDate === null ? "" : `Ends ${shortDate(item.endDate, f)}`,
	};
}

/** Below 768 px the date sits under the amount instead of in a column (BR-F05-22): the next
 * due date, "Ended 30 Sept" for an ended row, or nothing. */
export function phoneDateLine(
	item: Pick<SubscriptionItem, "status" | "nextDueOn" | "endDate">,
	f: Formats,
): string {
	if (item.status === "ended") {
		return item.endDate === null ? "" : `Ended ${shortDate(item.endDate, f)}`;
	}
	return item.nextDueOn === null ? "" : dayWithWeekday(item.nextDueOn, f);
}

/** A badge beside a row's name (BR-F05-22). */
export type RowBadge = { kind: "starts" | "ends" | "paused"; text: string };

/** The badges of a status: "Starts 5 Dec" when upcoming, "Ends 31 Dec 2026" when ending,
 * "Paused until 5 Jan" when paused (the next due date), or "Paused" when it has none, as when
 * its end date falls inside the pause. */
export function rowBadges(
	item: Pick<SubscriptionItem, "status" | "startDate" | "endDate" | "nextDueOn">,
	f: Formats,
): RowBadge[] {
	switch (item.status) {
		case "upcoming":
			return [
				{ kind: "starts", text: `Starts ${shortDate(item.startDate, f)}` },
			];
		case "ending":
			return item.endDate === null ?
					[]
				:	[{ kind: "ends", text: `Ends ${formatDateYear(item.endDate, f)}` }];
		case "paused":
			return [
				{
					kind: "paused",
					text:
						item.nextDueOn === null ?
							"Paused"
						:	`Paused until ${shortDate(item.nextDueOn, f)}`,
				},
			];
		default:
			return [];
	}
}

/** "2 charges in the next 30 days, ₹240.00" when a row has more than one in that window
 * (BR-F05-22); `null` otherwise. */
export function chargesCaption(
	count: number,
	totalMinor: number,
	f: Formats,
): string | null {
	return count > 1 ?
			`${count} charges in the next 30 days, ${money(totalMinor, f)}`
		:	null;
}

/** 1 as "1st", 22 as "22nd", 11 as "11th": English ordinals, as the sentences around them are. */
export function ordinal(day: number): string {
	const rest = day % 100;
	if (rest >= 11 && rest <= 13) return `${day}th`;
	const suffix = { 1: "st", 2: "nd", 3: "rd" }[day % 10] ?? "th";
	return `${day}${suffix}`;
}

/**
 * When a Subscription repeats, in words (BR-F05-24): "Every Thursday", "Every 2 weeks on
 * Thursday", "Every year on 12 Oct", "Every month on the 5th", "Every 3 months on the 30th, or
 * the last day in shorter months". A start on the 29th to the 31st with a month unit whose
 * months are not a multiple of 12 adds the clamp words; a 29 February start whose months are a
 * multiple of 12 adds ", or 28 Feb in other years" instead. Weekday and date words follow the
 * locale (D-618).
 */
export function scheduleText(
	schedule: { startDate: string; cadence: Cadence },
	f: Formats,
): string {
	const { startDate, cadence } = schedule;
	const { unit, every } = cadence;
	if (unit === "week") {
		const weekday = formatWeekday(startDate, f);
		return every === 1 ?
				`Every ${weekday}`
			:	`Every ${every} weeks on ${weekday}`;
	}
	const day = Number(startDate.slice(8));
	const leapDay = startDate.slice(5) === "02-29" && every % 12 === 0;
	const leapWords = `, or ${formatDayMonth("2027-02-28", f)} in other years`;
	if (every === 12) {
		return `Every year on ${formatDayMonth(startDate, f)}${leapDay ? leapWords : ""}`;
	}
	const head = every === 1 ? "Every month" : `Every ${every} months`;
	let clamp = "";
	if (leapDay) clamp = leapWords;
	else if (day >= 29 && every % 12 !== 0)
		clamp = ", or the last day in shorter months";
	return `${head} on the ${ordinal(day)}${clamp}`;
}
