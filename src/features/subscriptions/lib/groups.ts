import { compareCodeUnits } from "@/lib/compare";
import { compareByName, type UpcomingEntry } from "@/lib/subscriptions/model";
import { shiftDays } from "@/lib/time";
import { type Formats, money } from "./labels";
import type { SubscriptionItem } from "./types";

/** A row of the list: the Subscription with what it charges in the next 30 days, which its
 * caption and its group's figure read (BR-F05-22, BR-F05-37). */
export type ListRow = {
	item: SubscriptionItem;
	upcomingCount: number;
	upcomingMinor: number;
};

export type GroupKey = "within7" | "within30" | "later" | "none" | "ended";

/** One group of the list, in the order the page shows them (BR-F05-37). `totalMinor` is the sum
 * of its rows' charges in the next 30 days for the two time groups, and `null` for the rest. */
export type ListGroup = {
	key: GroupKey;
	rows: ListRow[];
	totalMinor: number | null;
};

/** Within 7 days runs through today + 7, Within 30 days through today + 30 (BR-F05-37). */
export const SOON_DAYS = 7;
export const UPCOMING_DAYS = 30;

/** The Ended group shows this many rows before "Show all" (BR-F05-37). */
export const ENDED_PREVIEW = 5;

/** With no Subscription that is not ended (BR-F05-37). */
export const NO_RUNNING =
	"No running Subscriptions. Resume one below, or add a new one.";

const LABELS: Record<GroupKey, string> = {
	within7: "Within 7 days",
	within30: "Within 30 days",
	later: "Later",
	none: "No more charges",
	ended: "Ended",
};

const byDueThenName = (a: ListRow, b: ListRow) =>
	// Every row of a dated group has a next due date.
	compareCodeUnits(a.item.nextDueOn as string, b.item.nextDueOn as string)
	|| compareByName(a.item, b.item);

const byEndedNewestFirst = (a: ListRow, b: ListRow) =>
	compareCodeUnits(b.item.endDate ?? "", a.item.endDate ?? "")
	|| compareByName(a.item, b.item);

const byName = (a: ListRow, b: ListRow) => compareByName(a.item, b.item);

const sum = (rows: readonly ListRow[]) =>
	rows.reduce((total, row) => total + row.upcomingMinor, 0);

/**
 * The list's groups (BR-F05-37) from the items and the 30-day upcoming list (F05 section 11):
 * Within 7 days and Within 30 days by next due date, then Later, then No more charges for a
 * Subscription that is not ended and has none, then Ended. A group with no row is left out.
 * Each row sorts by next due, then name (BR-F05-20's comparison), No more charges by name and
 * Ended by end date, newest first. A due date that has passed since the list was read sits in
 * Within 7 days (D-619). The two time groups' figures add up to the upcoming total, since a
 * Subscription with a charge in the next 30 days is due within them. `hasRunning` is false when
 * nothing but Ended Subscriptions remain.
 */
export function listGroups(
	items: readonly SubscriptionItem[],
	upcoming: readonly UpcomingEntry[],
	today: string,
): { groups: ListGroup[]; hasRunning: boolean } {
	const charges = new Map<string, { count: number; minor: number }>();
	for (const entry of upcoming) {
		const seen = charges.get(entry.subscriptionId) ?? { count: 0, minor: 0 };
		charges.set(entry.subscriptionId, {
			count: seen.count + 1,
			minor: seen.minor + entry.amountMinor,
		});
	}
	const soon = shiftDays(today, SOON_DAYS);
	const month = shiftDays(today, UPCOMING_DAYS);
	const buckets: Record<GroupKey, ListRow[]> = {
		within7: [],
		within30: [],
		later: [],
		none: [],
		ended: [],
	};
	for (const item of items) {
		const seen = item.status === "ended" ? undefined : charges.get(item.id);
		const row = {
			item,
			upcomingCount: seen?.count ?? 0,
			upcomingMinor: seen?.minor ?? 0,
		};
		const due = item.nextDueOn;
		let key: GroupKey;
		if (item.status === "ended") key = "ended";
		else if (due === null) key = "none";
		else if (due <= soon) key = "within7";
		else if (due <= month) key = "within30";
		else key = "later";
		buckets[key].push(row);
	}
	buckets.within7.sort(byDueThenName);
	buckets.within30.sort(byDueThenName);
	buckets.later.sort(byDueThenName);
	buckets.none.sort(byName);
	buckets.ended.sort(byEndedNewestFirst);
	const groups = (Object.keys(LABELS) as GroupKey[])
		.filter((key) => buckets[key].length > 0)
		.map((key) => ({
			key,
			rows: buckets[key],
			totalMinor:
				key === "within7" || key === "within30" ? sum(buckets[key]) : null,
		}));
	return {
		groups,
		hasRunning: items.some((item) => item.status !== "ended"),
	};
}

/** A group's header (BR-F05-37): "Within 7 days · 1" with the sum of its rows' charges in the
 * next 30 days, "₹649.00", for the two time groups, and no figure for the others. */
export function groupHeader(
	group: Pick<ListGroup, "key" | "rows" | "totalMinor">,
	f: Formats,
): { label: string; figure: string | null } {
	return {
		label: `${LABELS[group.key]} · ${group.rows.length}`,
		figure: group.totalMinor === null ? null : money(group.totalMinor, f),
	};
}

/** The rows a group shows: all of them, except an Ended group that is not showing all, which
 * shows its first 5 (BR-F05-37). */
export function shownRows(
	group: ListGroup,
	{ endedAll }: { endedAll: boolean },
): ListRow[] {
	return group.key === "ended" && !endedAll ?
			group.rows.slice(0, ENDED_PREVIEW)
		:	group.rows;
}

/** The Ended group's button under its rows: "Show all 8" or "Show fewer", and none when the
 * group has no more than 5 rows (BR-F05-37). */
export function endedToggle(count: number, endedAll: boolean): string | null {
	if (count <= ENDED_PREVIEW) return null;
	return endedAll ? "Show fewer" : `Show all ${count}`;
}

/**
 * The ids of the rows in the order shown, which Up and Down walk (BR-F05-45): every group in
 * order, with the Ended rows only while that group is expanded, and only its first 5 until it
 * shows all.
 */
export function flatOrder(
	groups: readonly ListGroup[],
	{ endedOpen, endedAll }: { endedOpen: boolean; endedAll: boolean },
): string[] {
	return groups.flatMap((group) =>
		group.key === "ended" && !endedOpen ?
			[]
		:	shownRows(group, { endedAll }).map((row) => row.item.id),
	);
}
