import type { CategoryKey } from "@/lib/categories";
import type { CurrencyCode } from "@/lib/currency";
import type { Source, TxnType } from "@/lib/transactions/model";

// The golden dataset (docs/03-golden-dataset.md) as typed data, row for row (F15, BR-F15-26).
// Amounts are minor units: 18,000.00 is 1800000. Never change a value here to make a test
// pass; the dataset is the source, and a change starts there.

/** The frozen clock (TST-3): 2026-11-02T12:00:00+05:30. */
export const GOLDEN_NOW = "2026-11-02T06:30:00.000Z";
export const GOLDEN_TODAY = "2026-11-02";

export const GOLDEN_PROFILE = {
	email: "golden@daybook.test",
	country: "IN",
	currency: "INR" satisfies CurrencyCode,
	numberLocale: "hi-IN-u-nu-latn",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
} as const;

/** Fixed UUIDv7 ids, so the fixture loads at most once per database (BR-F15-26). The fourth
 * group names the kind: 8000 Transactions, 8001 Goals, 8002 Subscriptions, 8003 pending. */
const id = (kind: string, n: number) =>
	`0199a000-0000-7000-${kind}-${String(n).padStart(12, "0")}`;

export const GOLDEN_GOALS = {
	emergencyFund: { id: id("8001", 1), name: "Emergency fund" },
	vacation: { id: id("8001", 2), name: "Vacation" },
} as const;

export const GOLDEN_SUBSCRIPTIONS = {
	sunrise: { id: id("8002", 1), name: "Sunrise Apartments" },
	netflix: { id: id("8002", 2), name: "Netflix" },
	cultGym: { id: id("8002", 3), name: "Cult Gym" },
	amazonPrime: { id: id("8002", 4), name: "Amazon Prime" },
} as const;

/** A golden Transaction in the API's shape (F03 section 3), plus its row number. */
export type GoldenTransaction = {
	/** The row's number in the dataset: 1 to 27. */
	golden: number;
	id: string;
	type: TxnType;
	amountMinor: number;
	occurredAt: string;
	occurredOn: string;
	category: CategoryKey | null;
	goalId: string | null;
	payee: string | null;
	description: string | null;
	note: string | null;
	source: Source;
	demo: false;
	subscriptionId: string | null;
	dueOn: string | null;
	edited: false;
	version: 1;
	createdAt: string;
	updatedAt: string;
};

type Goal = keyof typeof GOLDEN_GOALS;
type Subscription = keyof typeof GOLDEN_SUBSCRIPTIONS;

type Row = [
	golden: number,
	occurredOn: string,
	occurredAt: string,
	type: TxnType,
	categoryOrGoal: CategoryKey | Goal,
	payee: string | null,
	description: string | null,
	amountMinor: number,
	charge?: Subscription,
];

function transaction(
	[
		golden,
		occurredOn,
		occurredAt,
		type,
		categoryOrGoal,
		payee,
		description,
		amountMinor,
		charge,
	]: Row,
	createdAt = occurredAt,
): GoldenTransaction {
	const goal = type === "goal_contribution" || type === "goal_withdrawal";
	return {
		golden,
		id: id("8000", golden),
		type,
		amountMinor,
		occurredAt,
		occurredOn,
		category: goal ? null : (categoryOrGoal as CategoryKey),
		goalId: goal ? GOLDEN_GOALS[categoryOrGoal as Goal].id : null,
		payee,
		description,
		note: null,
		source: charge ? "subscription" : "manual",
		demo: false,
		subscriptionId: charge ? GOLDEN_SUBSCRIPTIONS[charge].id : null,
		dueOn: charge ? occurredOn : null,
		edited: false,
		version: 1,
		createdAt,
		updatedAt: createdAt,
	};
}

// prettier-ignore
const ROWS: Row[] = [
	// #   occurred_on   occurred_at (UTC)        type                 category or Goal    payee                 description          amount      charge
	[1,  "2026-09-01", "2026-08-31T18:30:00Z", "expense",           "housing",          "Sunrise Apartments", null,                1800000,  "sunrise"],
	[2,  "2026-09-01", "2026-09-01T04:45:00Z", "income",            "salary",           "Acme Corp",          null,                8500000],
	[3,  "2026-09-02", "2026-09-02T02:30:00Z", "goal_contribution", "emergencyFund",    null,                 null,                500000],
	[4,  "2026-09-03", "2026-09-03T07:50:00Z", "expense",           "food",             "Swiggy",             null,                185000],
	[5,  "2026-09-05", "2026-09-04T18:30:00Z", "expense",           "entertainment",    "Netflix",            null,                64900,    "netflix"],
	[6,  "2026-09-08", "2026-09-08T14:10:00Z", "expense",           "shopping",         "Myntra",             null,                240000],
	[7,  "2026-09-10", "2026-09-09T18:30:00Z", "expense",           "health",           "Cult Gym",           null,                150000,   "cultGym"],
	[8,  "2026-09-12", "2026-09-12T12:35:00Z", "expense",           "food",             "BigBasket",          "Monthly groceries", 320000],
	[9,  "2026-09-15", "2026-09-15T04:00:00Z", "goal_contribution", "vacation",         null,                 null,                300000],
	[10, "2026-09-20", "2026-09-20T15:40:00Z", "expense",           "transportation",   "Uber",               null,                45000],
	[11, "2026-09-25", "2026-09-25T06:30:00Z", "income",            "freelance",        "Studio Nine",        null,                1200000],
	[12, "2026-10-01", "2026-09-30T18:30:00Z", "expense",           "housing",          "Sunrise Apartments", null,                1800000,  "sunrise"],
	[13, "2026-10-01", "2026-10-01T04:35:00Z", "income",            "salary",           "Acme Corp",          null,                8500000],
	[14, "2026-10-02", "2026-10-02T02:30:00Z", "goal_contribution", "emergencyFund",    null,                 null,                500000],
	[15, "2026-10-04", "2026-10-04T15:00:00Z", "expense",           "food",             "Zomato",             null,                230000],
	[16, "2026-10-05", "2026-10-04T18:30:00Z", "expense",           "entertainment",    "Netflix",            null,                64900,    "netflix"],
	[17, "2026-10-07", "2026-10-07T06:15:00Z", "expense",           "shopping",         "Croma",              null,                450000],
	[18, "2026-10-09", "2026-10-09T10:50:00Z", "refund",            "shopping",         "Croma",              null,                150000],
	[19, "2026-10-11", "2026-10-11T03:40:00Z", "expense",           "transportation",   "Indian Oil",         null,                180000],
	[20, "2026-10-12", "2026-10-11T18:30:00Z", "expense",           "entertainment",    "Amazon Prime",       null,                149900,   "amazonPrime"],
	[21, "2026-10-14", "2026-10-14T13:30:00Z", "expense",           "food",             "BigBasket",          "Monthly groceries", 290000],
	[22, "2026-10-15", "2026-10-15T04:00:00Z", "goal_contribution", "vacation",         null,                 null,                300000],
	[23, "2026-10-18", "2026-10-18T12:15:00Z", "goal_withdrawal",   "vacation",         null,                 null,                100000],
	[24, "2026-10-19", "2026-10-19T16:45:00Z", "expense",           "food",             "Swiggy",             null,                64000],
	[25, "2026-10-31", "2026-10-31T18:20:00Z", "expense",           "food",             "Swiggy",             null,                38000],
	[26, "2026-11-01", "2026-10-31T19:00:00Z", "expense",           "food",             "Swiggy",             null,                42000],
];

/** Rows #1 to #26: what the fixture loads (BR-F15-26). */
export const GOLDEN_TRANSACTIONS: readonly GoldenTransaction[] = ROWS.map((row) =>
	transaction(row),
);

/** Row #27, the Sunrise Apartments charge for 1 November. The fixture leaves it out: catch-up
 * creates it on the first request of 2 November, as the dataset says. */
export const GOLDEN_ROW_27: GoldenTransaction = transaction(
	[
		27,
		"2026-11-01",
		"2026-10-31T18:30:00Z",
		"expense",
		"housing",
		"Sunrise Apartments",
		null,
		1800000,
		"sunrise",
	],
	GOLDEN_NOW,
);

/** Every confirmed golden Transaction, #1 to #27, as the dataset shows them on 2 November. */
export const GOLDEN_ALL: readonly GoldenTransaction[] = [
	...GOLDEN_TRANSACTIONS,
	GOLDEN_ROW_27,
];

/** Pending P1, in the write queue and never confirmed. */
export const GOLDEN_PENDING_P1 = {
	id: id("8003", 1),
	type: "expense",
	amountMinor: 30000,
	occurredAt: "2026-11-02T06:10:00Z",
	occurredOn: "2026-11-02",
	category: "food",
	goalId: null,
	payee: "Chai Point",
	description: null,
	note: null,
	source: "manual",
	subscriptionId: null,
} as const satisfies Partial<GoldenTransaction>;

/** Golden row `n`, from #1 to #27. */
export function goldenRow(n: number): GoldenTransaction {
	const row = GOLDEN_ALL.find((transaction) => transaction.golden === n);
	if (!row)
		throw new RangeError(`The golden dataset has rows #1 to #27, not #${n}.`);
	return row;
}
