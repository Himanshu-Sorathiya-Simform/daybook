import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import type { ListAnswer } from "@/lib/transactions/answers";
import type { Transaction } from "@/lib/transactions/model";
import type {
	SubscriptionAnswer,
	SubscriptionItem,
	SubscriptionList,
} from "../types";

export type GoldenName = keyof typeof GOLDEN_SUBSCRIPTIONS;

/** What the list derives for each golden Subscription at 2 November, from section 5 and the
 * dataset (docs/03-golden-dataset.md): next due, yearly and monthly cost (Amazon Prime's
 * 1,499.00 ÷ 12 = 124.92 rounded), its charges and what they paid, and its tombstones. */
const DERIVED = {
	sunrise: {
		nextDueOn: "2026-12-01",
		yearlyMinor: 21600000,
		monthlyMinor: 1800000,
		chargeCount: 3,
		paidMinor: 5400000,
		skips: [],
	},
	netflix: {
		nextDueOn: "2026-11-05",
		yearlyMinor: 778800,
		monthlyMinor: 64900,
		chargeCount: 2,
		paidMinor: 129800,
		skips: [],
	},
	cultGym: {
		nextDueOn: "2026-11-10",
		yearlyMinor: 1800000,
		monthlyMinor: 150000,
		chargeCount: 1,
		paidMinor: 150000,
		skips: ["2026-10-10"],
	},
	amazonPrime: {
		nextDueOn: "2027-10-12",
		yearlyMinor: 149900,
		monthlyMinor: 12492,
		chargeCount: 1,
		paidMinor: 149900,
		skips: [],
	},
} as const satisfies Record<GoldenName, Partial<SubscriptionItem>>;

/** A golden Subscription as `GET /api/subscriptions` lists it, with `changes` over it. */
export function subscriptionItem(
	name: GoldenName,
	changes: Partial<SubscriptionItem> = {},
): SubscriptionItem {
	const golden = GOLDEN_SUBSCRIPTIONS[name];
	const derived = DERIVED[name];
	return {
		id: golden.id,
		name: golden.name,
		amountMinor: golden.amountMinor,
		category: golden.category,
		note: golden.note,
		cadence: { ...golden.cadence },
		startDate: golden.startDate,
		chargesFrom: golden.chargesFrom,
		endDate: golden.endDate,
		pause: golden.pause,
		lastChangeOn: golden.lastChangeOn,
		demo: golden.demo,
		version: golden.version,
		createdAt: golden.createdAt,
		updatedAt: golden.createdAt,
		status: "active",
		...derived,
		skips: [...derived.skips],
		...changes,
	};
}

/** The same as a write answers it, with the currency the write locked (D-609). */
export function subscriptionAnswer(
	name: GoldenName,
	changes: Partial<SubscriptionAnswer> = {},
): SubscriptionAnswer {
	return { ...subscriptionItem(name), currency: "INR", ...changes };
}

let next = 1;

/** A Subscription's charge as F03's list answers it: Netflix's 649.00 expense unless
 * `changes` say otherwise. Each call has its own id. */
export function charge(changes: Partial<Transaction> = {}): Transaction {
	const id = `0192f0c4-7a1e-7c3b-9d2a-${String(next++).padStart(12, "0")}`;
	return {
		id,
		type: "expense",
		amountMinor: 64900,
		occurredAt: "2026-10-04T18:30:00.000Z",
		occurredOn: "2026-10-05",
		category: "entertainment",
		goalId: null,
		payee: "Netflix",
		description: null,
		note: null,
		source: "subscription",
		demo: false,
		subscriptionId: GOLDEN_SUBSCRIPTIONS.netflix.id,
		subscription: { id: GOLDEN_SUBSCRIPTIONS.netflix.id, name: "Netflix" },
		dueOn: "2026-10-05",
		edited: false,
		version: 1,
		createdAt: "2026-11-02T06:30:00.000Z",
		updatedAt: "2026-11-02T06:30:00.000Z",
		...changes,
	};
}

/** One page of F03's list, as the route answers it with `group=none`. */
export function listPage(
	items: Transaction[],
	nextCursor: string | null = null,
): ListAnswer {
	return {
		items,
		nextCursor,
		prevCursor: null,
		groups: [],
		order: null,
		currency: "INR",
	};
}

/** `GET /api/subscriptions` on golden at 2 November (section 5): four Subscriptions, 243,287.00
 * a year and 20,273.92 a month, three charges in the next 30 days worth 20,149.00, and
 * November's 18,000.00 charged with 2,149.00 still to come. */
export function subscriptionList(
	changes: Partial<SubscriptionList> = {},
): SubscriptionList {
	return {
		items: [
			subscriptionItem("netflix"),
			subscriptionItem("cultGym"),
			subscriptionItem("sunrise"),
			subscriptionItem("amazonPrime"),
		],
		totals: { monthlyMinor: 2027392, yearlyMinor: 24328700, count: 4 },
		upcoming: [
			{
				subscriptionId: GOLDEN_SUBSCRIPTIONS.netflix.id,
				dueOn: "2026-11-05",
				amountMinor: 64900,
			},
			{
				subscriptionId: GOLDEN_SUBSCRIPTIONS.cultGym.id,
				dueOn: "2026-11-10",
				amountMinor: 150000,
			},
			{
				subscriptionId: GOLDEN_SUBSCRIPTIONS.sunrise.id,
				dueOn: "2026-12-01",
				amountMinor: 1800000,
			},
		],
		upcomingTotalMinor: 2014900,
		thisMonth: { chargedMinor: 1800000, toComeMinor: 214900 },
		currency: "INR",
		...changes,
	};
}

/** A new user's list: nothing yet. */
export function emptyList(): SubscriptionList {
	return {
		items: [],
		totals: { monthlyMinor: 0, yearlyMinor: 0, count: 0 },
		upcoming: [],
		upcomingTotalMinor: 0,
		thisMonth: { chargedMinor: 0, toComeMinor: 0 },
		currency: "INR",
	};
}
