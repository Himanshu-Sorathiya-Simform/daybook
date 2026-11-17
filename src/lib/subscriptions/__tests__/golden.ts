import {
	GOLDEN_ALL,
	GOLDEN_SKIPS,
	GOLDEN_SUBSCRIPTIONS,
	GOLDEN_TODAY,
} from "../../../../seed/golden";
import type { ExpenseCategory } from "../model";
import type { Cadence, Pause } from "../schedule";

export { GOLDEN_TODAY };

export type GoldenName = keyof typeof GOLDEN_SUBSCRIPTIONS;

/** A golden Subscription as the rules read it, with the due dates of its charges and its
 * tombstones as the database gives them on 2 November (docs/03-golden-dataset.md). Fresh
 * arrays and objects, so a test may change them. Expected figures stay written out in each
 * test, from the dataset. */
export type GoldenSubscription = {
	id: string;
	name: string;
	amountMinor: number;
	category: ExpenseCategory;
	startDate: string;
	cadence: Cadence;
	chargesFrom: string;
	endDate: string | null;
	pause: Pause | null;
	lastChangeOn: string;
	version: number;
	charged: string[];
	skipped: string[];
};

export function goldenSubscription(name: GoldenName): GoldenSubscription {
	const golden = GOLDEN_SUBSCRIPTIONS[name];
	return {
		id: golden.id,
		name: golden.name,
		amountMinor: golden.amountMinor,
		category: golden.category,
		startDate: golden.startDate,
		cadence: { ...golden.cadence },
		chargesFrom: golden.chargesFrom,
		endDate: null,
		pause: null,
		lastChangeOn: golden.lastChangeOn,
		version: golden.version,
		charged: GOLDEN_ALL.filter((row) => row.subscriptionId === golden.id).map(
			(row) => row.dueOn as string,
		),
		skipped: GOLDEN_SKIPS.filter(
			(skip) => GOLDEN_SUBSCRIPTIONS[skip.subscription].id === golden.id,
		).map((skip) => skip.dueOn),
	};
}

/** The four golden Subscriptions, in the dataset's order. */
export function goldenSubscriptions(): GoldenSubscription[] {
	return (Object.keys(GOLDEN_SUBSCRIPTIONS) as GoldenName[]).map(
		goldenSubscription,
	);
}
