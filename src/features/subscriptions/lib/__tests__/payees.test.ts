import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { PayeeItem, PayeesAnswer } from "@/lib/transactions/answers";
import {
	MAX_CHOICES,
	paidPayees,
	PAYEES_KEY,
	PAYEES_PATH,
	payeeChoices,
	payeesOptions,
	RECENT_COUNT,
} from "../payees";

const payee = (name: string, over: Partial<PayeeItem> = {}): PayeeItem => ({
	payee: name,
	count: 3,
	lastUsedOn: "2026-10-05",
	lastType: "expense",
	lastCategory: "entertainment",
	lastExpense: { amountMinor: 64900, category: "entertainment" },
	...over,
});

const NAMES = [
	"Netflix",
	"Netflix Premium",
	"Net Banking Fee",
	"Spotify",
	"Cult Gym",
	"Sunrise Apartments",
	"Amazon Prime",
	"Airtel",
	"Jio Fiber",
	"Hotstar",
];
const LIST = NAMES.map((name) => payee(name));

describe("the query (BR-F05-24, D-451)", () => {
	test("shares the Transactions page's payee list key and path", () => {
		expect(PAYEES_KEY).toEqual([QUERY_ROOTS.payees, "list"]);
		expect(PAYEES_KEY).toEqual(["payees", "list"]);
		expect(PAYEES_PATH).toBe("/api/payees");
		expect(payeesOptions().queryKey).toEqual(["payees", "list"]);
	});

	test("goes stale after 5 minutes, as the other side's does", () => {
		expect(payeesOptions().staleTime).toBe(5 * 60_000);
	});

	test("reads only the payees that have an expense", async () => {
		const client = new QueryClient();
		const answer: PayeesAnswer = {
			items: [payee("Netflix"), payee("Salary", { lastExpense: null })],
			currency: "INR",
		};
		client.setQueryData(PAYEES_KEY, answer);
		const options = payeesOptions();
		expect(options.select?.(answer)).toEqual([payee("Netflix")]);
	});
});

describe("the payees that have an expense (D-451)", () => {
	test("leaves out a payee with only income or transfers", () => {
		const answer: PayeesAnswer = {
			items: [
				payee("Netflix"),
				payee("Employer", { lastType: "income", lastExpense: null }),
			],
			currency: "INR",
		};
		expect(paidPayees(answer).map((item) => item.payee)).toEqual(["Netflix"]);
	});

	test("keeps a payee whose newest row is income but who has an expense", () => {
		const answer: PayeesAnswer = {
			items: [payee("Friend", { lastType: "income" })],
			currency: "INR",
		};
		expect(paidPayees(answer)).toHaveLength(1);
	});

	test("keeps the list's order", () => {
		const answer: PayeesAnswer = { items: LIST, currency: "INR" };
		expect(paidPayees(answer).map((item) => item.payee)).toEqual(NAMES);
	});
});

describe("what the Name box lists (BR-F05-24, BR-F03-45)", () => {
	const names = (text: string, items = LIST) =>
		payeeChoices(items, text).map((item) => item.payee);

	test("while empty, the first 5", () => {
		expect(names("")).toEqual(NAMES.slice(0, RECENT_COUNT));
		expect(RECENT_COUNT).toBe(5);
	});

	test("spaces alone count as empty", () => {
		expect(names("   ")).toEqual(NAMES.slice(0, 5));
	});

	test("typing, the payees that match, in the list's order", () => {
		expect(names("net")).toEqual([
			"Netflix",
			"Netflix Premium",
			"Net Banking Fee",
		]);
	});

	test("matching ignores case", () => {
		expect(names("NETFLIX")).toEqual(["Netflix", "Netflix Premium"]);
	});

	test("text that matches no payee lists none", () => {
		expect(names("zzz")).toEqual([]);
	});

	test("at most 8 while typing", () => {
		const many = Array.from({ length: 12 }, (_, at) => payee(`Shop ${at}`));
		expect(payeeChoices(many, "shop")).toHaveLength(MAX_CHOICES);
		expect(MAX_CHOICES).toBe(8);
	});

	test("an empty list lists none, empty or typing", () => {
		expect(payeeChoices([], "")).toEqual([]);
		expect(payeeChoices([], "net")).toEqual([]);
	});

	test("text with a control character matches nothing", () => {
		expect(names("net\u0007")).toEqual([]);
	});

	test("text over 80 code points matches nothing", () => {
		expect(names("n".repeat(81))).toEqual([]);
	});

	test("text of exactly 80 code points is still a search", () => {
		const long = payee("n".repeat(80));
		expect(payeeChoices([long], "n".repeat(80))).toEqual([long]);
	});

	test("typing never adds a Use … as a new payee entry", () => {
		expect(payeeChoices(LIST, "Brand new")).toEqual([]);
	});
});
