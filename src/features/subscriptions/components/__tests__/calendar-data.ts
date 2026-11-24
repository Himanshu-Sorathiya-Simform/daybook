import { vi } from "vitest";

import type { MonthItem, MonthItemKind } from "@/lib/subscriptions/model";
import { calendarItems } from "../../lib/calendar";
import type { Formats } from "../../lib/labels";
import { charge, subscriptionItem } from "../../lib/__tests__/fixtures";
import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";

/** The golden profile at the golden clock with a Monday week start (AC-F05-38). */
export const CAL: Formats & { weekStart: "monday" } = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	weekStart: "monday",
};

/** Gives every element `px` as its width and a `ResizeObserver` that reports no change, the
 * room the calendar's month row measures (jsdom lays nothing out). Returns a function that
 * reports a new width to the observers made so far. */
export function rowWidth(px: number): (width: number) => void {
	const callbacks: ((entries: { contentRect: { width: number } }[]) => void)[] =
		[];
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(next: (typeof callbacks)[number]) {
				callbacks.push(next);
			}
			observe() {}
			disconnect() {}
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		width: px,
	} as DOMRect);
	return (width) => {
		for (const next of callbacks) next([{ contentRect: { width } }]);
	};
}

/** One calendar item. */
export const entry = (
	kind: MonthItemKind,
	date: string,
	name: string,
	amountMinor: number,
	changes: Partial<MonthItem> = {},
): MonthItem => ({
	date,
	kind,
	subscriptionId: `id-${name}`,
	name,
	category: "entertainment",
	amountMinor,
	chargeId: kind === "charged" ? `charge-${name}` : null,
	...changes,
});

/** Sunrise Apartments' 1 November charge, the one charge golden has in the month. */
export const NOVEMBER_CHARGE = charge({
	subscriptionId: GOLDEN_SUBSCRIPTIONS.sunrise.id,
	subscription: {
		id: GOLDEN_SUBSCRIPTIONS.sunrise.id,
		name: GOLDEN_SUBSCRIPTIONS.sunrise.name,
	},
	payee: GOLDEN_SUBSCRIPTIONS.sunrise.name,
	category: GOLDEN_SUBSCRIPTIONS.sunrise.category,
	occurredOn: "2026-11-01",
	dueOn: "2026-11-01",
	amountMinor: 1800000,
});

/** November on golden: Sunrise's 1 Nov charge, then Netflix's 5 Nov and Cult Gym's 10 Nov due. */
export const goldenNovember = (): MonthItem[] =>
	calendarItems(
		[
			subscriptionItem("netflix"),
			subscriptionItem("cultGym"),
			subscriptionItem("sunrise"),
			subscriptionItem("amazonPrime"),
		],
		[NOVEMBER_CHARGE],
		"2026-11",
		CAL.today,
	);

/** Three due items on 5 November, worth 20,149.00 together (AC-F05-38). */
export const BUSY_DAY: MonthItem[] = [
	entry("due", "2026-11-05", "Sunrise Apartments", 1800000, {
		category: "housing",
	}),
	entry("due", "2026-11-05", "Cult Gym", 150000, { category: "health" }),
	entry("due", "2026-11-05", "Netflix", 64900),
];
