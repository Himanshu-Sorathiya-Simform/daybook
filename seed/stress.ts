import type { CategoryKey } from "@/lib/categories";
import { monthsBefore, shiftDays } from "@/lib/time";

import type { GoldenTransaction } from "./golden";

// A fixed stress dataset for the end-to-end tests (AC-F03-22, AC-F03-25): 1,000 Transactions over
// the 13 months that end on a given day, from a seeded generator, so every run of one seed gives
// the same rows. Only the dates follow the day it is anchored to, since the server's clock can't
// be frozen (TST-6).

/** A stress Transaction: the golden shape without the golden row number. */
export type StressTransaction = Omit<GoldenTransaction, "golden">;

type Kind = "expense" | "income" | "refund";

/** A payee with its category, kind and amount range in paise, both ends included. */
type Payee = readonly [
	payee: string,
	category: CategoryKey,
	kind: Kind,
	minMinor: number,
	maxMinor: number,
];

/** About 40 payees, Indian rupees, so the payee list, groups and histogram look real. */
export const STRESS_PAYEES: readonly Payee[] = [
	["Swiggy", "food", "expense", 15000, 90000],
	["Zomato", "food", "expense", 20000, 120000],
	["BigBasket", "food", "expense", 80000, 450000],
	["Blinkit", "food", "expense", 10000, 60000],
	["Chai Point", "food", "expense", 5000, 30000],
	["Starbucks", "food", "expense", 25000, 90000],
	["DMart", "shopping", "expense", 50000, 600000],
	["Amazon", "shopping", "expense", 30000, 900000],
	["Flipkart", "shopping", "expense", 30000, 800000],
	["Myntra", "shopping", "expense", 80000, 500000],
	["Croma", "shopping", "expense", 150000, 2500000],
	["Decathlon", "shopping", "expense", 60000, 400000],
	["Uber", "transportation", "expense", 15000, 90000],
	["Ola", "transportation", "expense", 15000, 80000],
	["Rapido", "transportation", "expense", 5000, 30000],
	["Indian Oil", "transportation", "expense", 100000, 400000],
	["Tata Power", "utilities", "expense", 120000, 450000],
	["Airtel", "utilities", "expense", 49900, 149900],
	["Jio", "utilities", "expense", 29900, 99900],
	["Netflix", "entertainment", "expense", 64900, 64900],
	["BookMyShow", "entertainment", "expense", 30000, 150000],
	["Spotify", "entertainment", "expense", 11900, 11900],
	["Sunrise Apartments", "housing", "expense", 1800000, 1800000],
	["Urban Company", "housing", "expense", 50000, 300000],
	["Apollo Pharmacy", "health", "expense", 10000, 250000],
	["Cult Gym", "health", "expense", 150000, 150000],
	["Coursera", "education", "expense", 300000, 900000],
	["MakeMyTrip", "travel", "expense", 400000, 4000000],
	["IRCTC", "travel", "expense", 50000, 400000],
	["LIC", "insurance", "expense", 500000, 2500000],
	["Nykaa", "personal_care", "expense", 30000, 300000],
	["GiveIndia", "gifts_donations", "expense", 50000, 500000],
	["Income Tax", "fees_taxes", "expense", 1000000, 5000000],
	["HDFC Loan", "loans", "expense", 2500000, 2500000],
	["Kirana Store", "other", "expense", 5000, 80000],
	["Amazon", "shopping", "refund", 30000, 500000],
	["Croma", "shopping", "refund", 100000, 1500000],
	["Acme Corp", "salary", "income", 8500000, 8500000],
	["Studio Nine", "freelance", "income", 1000000, 6000000],
	["Zerodha", "investments", "income", 200000, 2000000],
];

/** Mulberry32: a small seeded generator, uniform in [0, 1). The same seed gives the same
 * sequence on every machine. */
function generator(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** UTC minutes from 00:00 to 18:29: the same calendar day in India (UTC+05:30), where the
 * stress profile lives, so `occurredOn` always fits `occurredAt`. */
const LAST_MINUTE = 18 * 60 + 29;

/** `n` as a 12-digit hex counter, the last group of a stress id. */
const counter = (n: number) => n.toString(16).padStart(12, "0");

export type StressOptions = {
	/** The last day, in the profile's zone (India): the newest row is on it. */
	today: string;
	seed?: number;
	count?: number;
};

/**
 * `count` Transactions (1,000 by default) from `seed`, over the 13 months ending on `today`,
 * newest first. Row 0 is always on `today` at 00:00 UTC (05:30 in India), so a test knows the
 * newest row: its payee is "Stress Newest". Each id ends in its row number, so the order is
 * fixed; a load gives the ids a prefix of its own (`reId`).
 *
 * Payees, categories and amounts come from `STRESS_PAYEES`, with expenses most common, then
 * refunds and income, as a real account has them. Every row passes the table's checks: an
 * income or expense category for its kind, whole minutes, an amount from 1, and 1 to 80
 * characters of payee.
 */
export function stressRows({
	today,
	seed = 1,
	count = 1000,
}: StressOptions): StressTransaction[] {
	const random = generator(seed);
	const pick = <T>(items: readonly T[]) =>
		items[Math.floor(random() * items.length)] as T;
	const first = monthsBefore(today, 13);
	const span =
		(Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`))
		/ 86_400_000;
	const expenses = STRESS_PAYEES.filter(([, , kind]) => kind === "expense");
	const refunds = STRESS_PAYEES.filter(([, , kind]) => kind === "refund");
	const incomes = STRESS_PAYEES.filter(([, , kind]) => kind === "income");

	const rows: StressTransaction[] = [];
	for (let n = 0; n < count; n++) {
		const roll = random();
		const [payee, category, type, minMinor, maxMinor] =
			n === 0 ? (["Stress Newest", "food", "expense", 42000, 42000] as const)
			: roll < 0.06 ? pick(incomes)
			: roll < 0.12 ? pick(refunds)
			: pick(expenses);
		// Row 0 on today; every other row on a random earlier day within the 13 months.
		const daysBack = n === 0 ? 0 : 1 + Math.floor(random() * span);
		const occurredOn = shiftDays(today, -daysBack);
		const minute = n === 0 ? 0 : Math.floor(random() * (LAST_MINUTE + 1));
		const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
		const occurredAt = `${occurredOn}T${time}:00.000Z`;
		const amountMinor =
			minMinor + Math.floor(random() * (maxMinor - minMinor + 1));
		rows.push({
			id: `0199b000-0000-7000-8004-${counter(n)}`,
			type,
			amountMinor,
			occurredAt,
			occurredOn,
			category,
			goalId: null,
			payee,
			description: null,
			note: null,
			source: "manual",
			demo: false,
			subscriptionId: null,
			dueOn: null,
			edited: false,
			version: 1,
			createdAt: occurredAt,
			updatedAt: occurredAt,
		});
	}
	return rows;
}
