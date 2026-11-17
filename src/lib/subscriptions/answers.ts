import type { Month } from "@/lib/budgets/months";
import type { CurrencyCode } from "@/lib/currency";

import type {
	CostTotals,
	SubscriptionRecord,
	SubscriptionStatus,
	UpcomingEntry,
} from "./model";

/** A Subscription as the API answers it (F05 section 3). */
export type Subscription = SubscriptionRecord & {
	createdAt: string;
	updatedAt: string;
};

/** One item of `GET /api/subscriptions` (F05 section 11, BR-F05-35): the stored fields and what
 * is derived from them and from the Subscription's charges. */
export type SubscriptionItem = Subscription & {
	/** Every tombstoned date, past and future, oldest first (D-592). */
	skips: string[];
	status: SubscriptionStatus;
	nextDueOn: string | null;
	yearlyMinor: number;
	monthlyMinor: number;
	/** The number and sum of the Subscription's linked charges. */
	chargeCount: number;
	paidMinor: number;
};

/** `GET /api/subscriptions` (F05 section 11): the items, the page totals, the next 30 days and
 * this month. */
export type SubscriptionList = {
	items: SubscriptionItem[];
	totals: CostTotals;
	upcoming: UpcomingEntry[];
	upcomingTotalMinor: number;
	thisMonth: { chargedMinor: number; toComeMinor: number };
	currency: CurrencyCode;
};

/** One month of `GET /api/subscriptions/months` (BR-F05-36). */
export type SubscriptionMonthRow = {
	month: Month;
	chargedMinor: number;
	expectedMinor: number;
};

export type SubscriptionMonthsAnswer = {
	months: SubscriptionMonthRow[];
	currency: CurrencyCode;
};

/** What a create adds to the Subscription it answers with (201, or 200 for a repeated id). */
export type SubscriptionCreated = SubscriptionItem & { chargesCreated: number };

/** What a change adds to the Subscription it answers with (BR-F05-08): the change date, the
 * charges created, repriced and deleted, and every month whose charges changed. */
export type SubscriptionChanged = SubscriptionItem & {
	changeDate: string;
	chargesCreated: number;
	chargesUpdated: number;
	chargesDeleted: number;
	months: Month[];
};

/** `DELETE /api/subscriptions/[id]` (BR-F05-14, BR-F05-34): `chargesKept` counts the charges left
 * behind as ordinary expenses. */
export type SubscriptionDeleted = {
	changeDate: string;
	chargesCreated: number;
	chargesKept: number;
	chargesDeleted: number;
	months: Month[];
};

/** `POST /api/sync/catch-up` (BR-F05-06). */
export type CatchUpAnswer = {
	skipped: boolean;
	chargesCreated: number;
	pricesUpdated: boolean;
};
