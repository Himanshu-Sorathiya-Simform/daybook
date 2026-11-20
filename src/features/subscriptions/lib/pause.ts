import { formatDateYear, formatDayHeader } from "@/lib/date-format";
import {
	pausableDates,
	pauseForCount,
	pauseLimit,
	pausePreview,
} from "@/lib/subscriptions/rules";
import { type Pause } from "@/lib/subscriptions/schedule";
import { shiftDays, shiftMonths } from "@/lib/time";
import type { StripItem } from "./charges";
import { money, shortDate } from "./labels";
import type { SubscriptionItem, SubscriptionsLocale } from "./types";

/** Pause and Change pause (BR-F05-28, BR-F05-29, BR-F05-43). */

export type PauseChoice = "n1" | "n2" | "n3" | "date";

/** The dialog's own words (BR-F05-43). */
export const PAUSE_TEXT = {
	title: (name: string) => `Pause ${name}`,
	skip: "Skip",
	until: "Until a date",
	dateLabel: "Until",
	notNow: "Not now",
	pause: "Pause",
	pauseUntil: (date: string) => `Pause until ${date}`,
	stripLabel: "Charges around today",
	counts: {
		n1: "The next charge",
		n2: "2 charges",
		n3: "3 charges",
		date: "Until a date",
	},
	still: (name: string) =>
		`${name} still counts in your monthly cost while it's paused. Paused charges are left out of the next 30 days.`,
} as const;

const COUNTS = { n1: 1, n2: 2, n3: 3 } as const;

/** What kind of pause this is: a new one, one that has not started, or one in force
 * (BR-F05-43). A pause in force keeps its `from`. */
export type PauseCase = "new" | "future" | "inForce";

export function pauseCase(
	item: Pick<SubscriptionItem, "pause">,
	today: string,
): PauseCase {
	const { pause } = item;
	if (pause === null) return "new";
	if (pause.from > today) return "future";
	return pause.until >= today ? "inForce" : "new";
}

/** The dates a pause could cover or end on: chargeable due dates after today with no tombstone,
 * the stored pause left out of the question, up to the limit (BR-F05-43). */
export function pauseDates(item: SubscriptionItem, today: string): string[] {
	return pausableDates(item, {
		changeDate: today,
		skipped: item.skips,
		to: pauseLimit(today),
	});
}

export type PauseValues = { choice: PauseChoice; until: string };

export type PauseOption = {
	value: PauseChoice;
	label: string;
	isDisabled: boolean;
};

/** The choices (BR-F05-43): the counts, each disabled when no date follows on or before the end
 * date or that date falls past the limit; and "Until a date". A pause in force offers only the
 * date. */
export function pauseOptions(item: SubscriptionItem, today: string): PauseOption[] {
	if (pauseCase(item, today) === "inForce") {
		return [{ value: "date", label: PAUSE_TEXT.counts.date, isDisabled: false }];
	}
	const dates = pauseDates(item, today);
	const limit = pauseLimit(today);
	return [
		...(["n1", "n2", "n3"] as const).map((value) => ({
			value,
			label: PAUSE_TEXT.counts[value],
			isDisabled: pauseForCount(dates, COUNTS[value], limit) === null,
		})),
		{ value: "date", label: PAUSE_TEXT.counts.date, isDisabled: false },
	];
}

/** What the dialog opens with (BR-F05-43): "2 charges", else "The next charge", else "Until a
 * date"; Change pause opens on the date, at the stored `until`. A new pause's date starts 2
 * months after the first pausable date, at most the limit. */
export function pauseStart(item: SubscriptionItem, today: string): PauseValues {
	const kind = pauseCase(item, today);
	const dates = pauseDates(item, today);
	const limit = pauseLimit(today);
	const first = dates[0] ?? today;
	const twoMonths = shiftMonths(first, 2);
	const until =
		kind !== "new" && item.pause !== null ? item.pause.until
		: twoMonths < limit ? twoMonths
		: limit;
	if (kind !== "new") return { choice: "date", until };
	const options = pauseOptions(item, today);
	const free = (value: PauseChoice) =>
		options.some((option) => option.value === value && !option.isDisabled);
	const choice: PauseChoice =
		free("n2") ? "n2"
		: free("n1") ? "n1"
		: "date";
	return { choice, until };
}

/** The dates "Until a date" may take: from the day after the first pausable date, or for a
 * pause in force from today, to the limit (BR-F05-43). */
export function pauseRange(
	item: SubscriptionItem,
	today: string,
): { min: string; max: string } {
	const max = pauseLimit(today);
	if (pauseCase(item, today) === "inForce") return { min: today, max };
	const first = pauseDates(item, today)[0];
	return { min: shiftDays(first ?? today, 1), max };
}

export type PauseView = {
	/** The pause the choice makes, or `null` for a count that cannot be had. */
	pause: Pause | null;
	/** The first date after the pause, or `null` when none follows. */
	resumeOn: string | null;
	strip: StripItem[];
	/** "Nothing is added while it's paused. Charges resume on …". */
	sentence: string;
	/** "Pause until 5 Jan 2027", or "Pause" when no charge follows. */
	buttonLabel: string;
	/** The write, or `null` while there is no pause to make or it is the stored one. */
	body: { changedAt: string; pause: Pause } | null;
};

/** Pause as it stands (BR-F05-43). */
export function pauseView({
	item,
	values,
	locale,
	changedAt,
}: {
	item: SubscriptionItem;
	values: PauseValues;
	locale: SubscriptionsLocale;
	changedAt: string;
}): PauseView {
	const kind = pauseCase(item, locale.today);
	const dates = pauseDates(item, locale.today);
	const limit = pauseLimit(locale.today);
	let pause: Pause | null = null;
	if (values.choice === "date") {
		const from =
			kind === "inForce" && item.pause !== null ? item.pause.from : dates[0];
		pause = from === undefined ? null : { from, until: values.until };
	} else {
		pause = pauseForCount(dates, COUNTS[values.choice], limit);
	}
	const preview =
		pause === null ?
			{ paused: [] as string[], resumeOn: null }
		:	pausePreview(dates, pause);

	const strip: StripItem[] = preview.paused.slice(0, 3).map((date) => ({
		kind: "off" as const,
		label: shortDate(date, locale),
		amount: money(item.amountMinor, locale),
		note: "paused",
	}));
	if (preview.resumeOn !== null) {
		strip.push({
			kind: "new",
			label: shortDate(preview.resumeOn, locale),
			amount: money(item.amountMinor, locale),
			note: "resumes",
		});
	}
	strip.push({ kind: "more", label: "" });

	const same =
		pause !== null
		&& item.pause !== null
		&& pause.from === item.pause.from
		&& pause.until === item.pause.until;
	return {
		pause,
		resumeOn: preview.resumeOn,
		strip,
		sentence: `Nothing is added while it's paused.${
			preview.resumeOn === null ?
				""
			:	` Charges resume on ${formatDayHeader(preview.resumeOn, locale)} at ${money(item.amountMinor, locale)}, without you doing anything.`
		}`,
		buttonLabel:
			preview.resumeOn === null ?
				PAUSE_TEXT.pause
			:	PAUSE_TEXT.pauseUntil(formatDateYear(preview.resumeOn, locale)),
		body: pause === null || same ? null : { changedAt, pause },
	};
}
