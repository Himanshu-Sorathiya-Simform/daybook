import type { CurrencyCode } from "@/lib/currency";
import { formatDateYear } from "@/lib/date-format";
import { chargesFromAfterEnd, resumeGapDates } from "@/lib/subscriptions/rules";
import { chargeableDates } from "@/lib/subscriptions/schedule";
import { shiftMonths } from "@/lib/time";
import type { Transaction } from "@/lib/transactions/model";
import { chargeCell, linkedCharges, type StripItem } from "./charges";
import { money, shortDate } from "./labels";
import type { SubscriptionItem, SubscriptionsLocale } from "./types";

/** Resume and Keep it going (BR-F05-13, BR-F05-32, BR-F05-42): the end date is cleared, and
 * for an ended Subscription the months while it was cancelled are either left out or added. */

export type ResumeChoice = "today" | "never";

/** The dialog's own words (BR-F05-42). */
export const RESUME_TEXT = {
	title: (name: string) => `Resume ${name}?`,
	how: "How to resume",
	today: "Restart from today",
	todayDetail:
		"Charges restart from today. Months while it was cancelled aren't added.",
	never: "It never actually stopped",
	restartLine: "Charges restart from today.",
	notNow: "Not now",
	resume: (name: string) => `Resume ${name}`,
	changePrice: "Change the price too",
	newAmount: "New amount",
	stripLabel: "Charges around today",
} as const;

export type ResumeView = {
	/** "Ended 30 Sept 2026, after the 5 Sept charge", or "Ends 31 Dec 2026". */
	opening: string;
	/** The missed dates "It never actually stopped" would add; none unless it is ended. */
	gap: string[];
	/** The two choices, only when there are missed dates. */
	choices: { never: { title: string; description: string } } | null;
	/** What the dialog says when it offers no choice. */
	plainLine: string | null;
	strip: StripItem[];
	/** "Was ₹649.00. Charges from today use it." */
	priceHint: string;
	/** The write, with the amount only when `newAmountMinor` is a change. */
	body: SubscriptionResumeBody;
};

export type SubscriptionResumeBody = {
	changedAt: string;
	endDate: null;
	backfillGap?: true;
	amountMinor?: number;
	currency?: CurrencyCode;
};

/** "Also adds the 2 missed charges: 5 Oct, 5 Nov, ₹1,298.00.": up to three dates, then "…",
 * then one total at the amount the resume saves (BR-F05-42). */
function neverDetail(
	gap: readonly string[],
	amountMinor: number,
	f: SubscriptionsLocale,
): string {
	const noun = gap.length === 1 ? "charge" : "charges";
	const named = gap
		.slice(0, 3)
		.map((date) => shortDate(date, f))
		.join(", ");
	const more = gap.length > 3 ? "…" : "";
	return `Also adds the ${gap.length} missed ${noun}: ${named}${more}, ${money(amountMinor * gap.length, f)}.`;
}

/**
 * Resume as it stands (BR-F05-42). `newAmountMinor` is the price typed under "Change the price
 * too", or `null` while it is closed or not an amount; `never` is whether "It never actually
 * stopped" is chosen. `charges` are the Subscription's linked charges, whole (BR-F05-48).
 */
export function resumeView({
	item,
	charges,
	never,
	newAmountMinor,
	locale,
	changedAt,
}: {
	item: SubscriptionItem;
	charges: readonly Transaction[];
	never: boolean;
	newAmountMinor: number | null;
	locale: SubscriptionsLocale;
	changedAt: string;
}): ResumeView {
	const ended = item.status === "ended";
	const linked = linkedCharges(charges);
	const stored = item.endDate;
	const latest = linked.at(-1) ?? null;
	// A Subscription that is ended or ending has an end date.
	const endText = formatDateYear(stored ?? locale.today, locale);
	const amountMinor = newAmountMinor ?? item.amountMinor;
	const gap =
		ended ?
			resumeGapDates(
				{
					...item,
					charged: linked.map((charge) => charge.dueOn),
					skipped: item.skips,
				},
				locale.today,
			)
		:	[];
	const choosing = gap.length > 0;
	const adding = choosing && never;

	// The Subscription as the resume leaves it: no end date, and `chargesFrom` as BR-F05-13 moves
	// it. Charging the missed months (BR-F05-32) only moves it earlier than today, which no date
	// from today on depends on, so the strip reads the same either way.
	const chargesFrom = chargesFromAfterEnd({
		chargesFrom: item.chargesFrom,
		startDate: item.startDate,
		storedEndDate: stored,
		newEndDate: null,
		changeDate: locale.today,
	});
	const charged = new Set(linked.map((charge) => charge.dueOn));
	const next = chargeableDates(
		{ ...item, endDate: null, chargesFrom },
		locale.today,
		shiftMonths(locale.today, 240),
	)
		.filter((date) => !charged.has(date) && !item.skips.includes(date))
		.slice(0, 2);

	const strip: StripItem[] = [];
	if (latest) strip.push(chargeCell(latest, "kept", locale));
	for (const date of gap.slice(0, 2)) {
		strip.push(
			adding ?
				{
					kind: "new",
					label: shortDate(date, locale),
					amount: money(amountMinor, locale),
					note: "added",
				}
			:	{ kind: "kept", label: shortDate(date, locale), note: "not added" },
		);
	}
	strip.push({ kind: "today", label: "Today" });
	next.forEach((date, at) => {
		strip.push({
			kind: "new",
			label: shortDate(date, locale),
			amount: money(amountMinor, locale),
			...(at === 0 ? { note: "next" } : {}),
		});
	});
	strip.push({ kind: "more", label: "" });

	const body: SubscriptionResumeBody = { changedAt, endDate: null };
	if (adding) body.backfillGap = true;
	if (newAmountMinor !== null && newAmountMinor !== item.amountMinor) {
		body.amountMinor = newAmountMinor;
		body.currency = locale.currency;
	}

	return {
		opening:
			ended ?
				`Ended ${endText}${latest ? `, after the ${shortDate(latest.dueOn, locale)} charge` : ""}`
			:	`Ends ${endText}`,
		gap,
		choices:
			choosing ?
				{
					never: {
						title: RESUME_TEXT.never,
						description: neverDetail(gap, amountMinor, locale),
					},
				}
			:	null,
		plainLine:
			choosing ? null
			: ended ? RESUME_TEXT.restartLine
			: `The end date is cleared. Charges carry on after ${endText}.`,
		strip,
		priceHint: `Was ${money(item.amountMinor, locale)}. ${ended ? "Charges from today use it." : "Charges after today use it."}`,
		body,
	};
}
