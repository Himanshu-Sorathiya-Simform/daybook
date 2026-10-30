import { tz } from "@date-fns/tz";
import {
	endOfMonth,
	format,
	parse,
	startOfMonth,
	startOfYear,
	subMonths,
} from "date-fns";

import { RANGE_PRESETS, type DatePreset, type RangePreset } from "./model";

// Dates are calendar dates without a zone. Reading and writing them in UTC keeps the machine's
// own zone out (TIME-10); `today` already comes from the profile zone (TIME-5).
const UTC = tz("UTC");

const read = (date: string) => parse(date, "yyyy-MM-dd", new Date(0), { in: UTC });
const write = (date: Date) => format(date, "yyyy-MM-dd", { in: UTC });

/** The first and last day of the month `back` months before the month of `date`. */
function monthOf(date: Date, back: number) {
	const month = subMonths(date, back, { in: UTC });
	return {
		first: write(startOfMonth(month, { in: UTC })),
		last: write(endOfMonth(month, { in: UTC })),
	};
}

/** A preset's explicit dates for `today` (F03 section 3, D-227). Presets cover whole calendar
 * months, except year to date, which ends today. */
export function presetRange(
	preset: RangePreset,
	today: string,
): { from: string; to: string } {
	const date = read(today);
	switch (preset) {
		case "this_month": {
			const { first, last } = monthOf(date, 0);
			return { from: first, to: last };
		}
		case "last_month": {
			const { first, last } = monthOf(date, 1);
			return { from: first, to: last };
		}
		case "last_3_months":
			return { from: monthOf(date, 2).first, to: monthOf(date, 0).last };
		case "year_to_date":
			return { from: write(startOfYear(date, { in: UTC })), to: today };
		case "last_12_months":
			return { from: monthOf(date, 11).first, to: monthOf(date, 0).last };
	}
}

/** The preset whose dates for `today` are exactly `from` and `to`: `all` with no dates,
 * `custom` with none matching. When two presets share dates, as year to date and the last 12
 * months do on 31 December, the earlier one in section 3's order wins. */
export function presetOf(
	from: string | undefined,
	to: string | undefined,
	today: string,
): DatePreset {
	if (from === undefined && to === undefined) return "all";
	const match = RANGE_PRESETS.find((preset) => {
		const range = presetRange(preset, today);
		return range.from === from && range.to === to;
	});
	return match ?? "custom";
}
