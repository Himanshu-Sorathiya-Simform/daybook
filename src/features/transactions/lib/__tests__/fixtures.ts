import type { PayeeItem } from "../suggestions";
import type {
	PayeesAnswer,
	TransactionAnswer,
	TransactionPageAnswer,
} from "../types";

/** A Transaction as the API answers it: golden row #24, Swiggy 640.00 on 19 Oct, by default. */
export function row(overrides: Partial<TransactionAnswer> = {}): TransactionAnswer {
	return {
		id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c24",
		type: "expense",
		amountMinor: 64000,
		occurredAt: "2026-10-19T16:45:00.000Z",
		occurredOn: "2026-10-19",
		category: "food",
		goalId: null,
		payee: "Swiggy",
		description: null,
		note: null,
		source: "manual",
		demo: false,
		subscriptionId: null,
		dueOn: null,
		edited: false,
		version: 1,
		createdAt: "2026-10-19T16:46:12.000Z",
		updatedAt: "2026-10-19T16:46:12.000Z",
		currency: "INR",
		...overrides,
	};
}

/** A UUIDv7-shaped id ending in `n`, so tests can tell rows apart. */
export const idOf = (n: number) =>
	`0192f0c4-7a1e-7c3b-9d2a-${n.toString(16).padStart(12, "0")}`;

/** A list page: no groups or order (day grouping's), no cursors, unless given. */
export function page(
	overrides: Partial<TransactionPageAnswer> = {},
): TransactionPageAnswer {
	return {
		items: [],
		nextCursor: null,
		prevCursor: null,
		groups: [],
		order: null,
		currency: "INR",
		...overrides,
	};
}

const item = (
	payee: string,
	count: number,
	lastUsedOn: string,
	lastType: PayeeItem["lastType"],
	lastCategory: PayeeItem["lastCategory"],
): PayeeItem => ({ payee, count, lastUsedOn, lastType, lastCategory });

/** `/api/payees` on golden's M1 rows at 2026-11-02, in BR-F03-44's order: count, then last
 * use, then key (docs/03-golden-dataset.md). */
export const GOLDEN_PAYEES: PayeeItem[] = [
	item("Swiggy", 4, "2026-11-01", "expense", "food"),
	item("Sunrise Apartments", 3, "2026-11-01", "expense", "housing"),
	item("BigBasket", 2, "2026-10-14", "expense", "food"),
	item("Croma", 2, "2026-10-09", "refund", "shopping"),
	item("Netflix", 2, "2026-10-05", "expense", "entertainment"),
	item("Acme Corp", 2, "2026-10-01", "income", "salary"),
	item("Amazon Prime", 1, "2026-10-12", "expense", "entertainment"),
	item("Indian Oil", 1, "2026-10-11", "expense", "transportation"),
	item("Zomato", 1, "2026-10-04", "expense", "food"),
	item("Studio Nine", 1, "2026-09-25", "income", "freelance"),
	item("Uber", 1, "2026-09-20", "expense", "transportation"),
	item("Cult Gym", 1, "2026-09-10", "expense", "health"),
	item("Myntra", 1, "2026-09-08", "expense", "shopping"),
];

/** The golden category counts (F03 section 5). */
export const GOLDEN_CATEGORIES: NonNullable<PayeesAnswer["categories"]> = [
	{ key: "food", count: 7 },
	{ key: "entertainment", count: 3 },
	{ key: "housing", count: 3 },
	{ key: "shopping", count: 3 },
	{ key: "salary", count: 2 },
	{ key: "transportation", count: 2 },
	{ key: "freelance", count: 1 },
	{ key: "health", count: 1 },
];

/** A payee suggestion with made-up figures, for lists that only test matching. */
export const named = (payee: string): PayeeItem =>
	item(payee, 1, "2026-10-01", "expense", "food");
