import type { ListRow } from "../../lib/groups";
import type { Formats } from "../../lib/labels";
import type { SubscriptionItem } from "../../lib/types";
import { subscriptionItem } from "../../lib/__tests__/fixtures";

/** The golden profile at the golden clock: 2 November 2026 in `en-IN`. */
export const FORMATS: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

let counter = 0;

/** A Subscription of its own: Netflix's figures under another id and name. */
export function made(
	name: string,
	changes: Partial<SubscriptionItem> = {},
): SubscriptionItem {
	counter += 1;
	return subscriptionItem("netflix", {
		id: `0192f0c4-7a1e-7c3b-9d2a-${String(counter).padStart(12, "0")}`,
		name,
		...changes,
	});
}

/** An ended Subscription that ended on `endDate`. */
export const endedOn = (name: string, endDate: string) =>
	made(name, { status: "ended", endDate, nextDueOn: null });

export const rowOf = (
	item: SubscriptionItem,
	upcomingCount = 0,
	upcomingMinor = 0,
): ListRow => ({ item, upcomingCount, upcomingMinor });
