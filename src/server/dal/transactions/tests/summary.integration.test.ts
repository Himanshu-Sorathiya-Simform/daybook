import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../../seed/load-golden";
import type { TransactionFilter } from "@/lib/transactions/url";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import type { Breakdown } from "../query";
import { listTransactions } from "../list";
import { transactionSummary } from "../summary";
import type { Tx } from "../../with-user";
import { addExpense, asUser, goldenContext } from "./helpers";

/** `transactionSummary` (BR-F03-41, BR-F03-58, D-480) on golden's M1 rows, through the
 * runtime role and RLS. Its endpoint's own test covers HTTP. */

let owner: Client;
let golden: LoadedGolden;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	golden = await loadGolden(owner, await createUser(owner, "summary"));
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [golden?.userId]);
	await owner?.end();
	await runtimePool().end();
});

const OCTOBER: TransactionFilter = { from: "2026-10-01", to: "2026-10-31" };

const summarize = (filter: TransactionFilter, by: Breakdown[] = []) =>
	asUser(golden.userId, (tx) =>
		transactionSummary(tx, goldenContext(golden.userId), filter, by),
	);

// AC-F03-39; golden: section 5's summary breakdowns for check A. At M1 To Goals is 0, since the
// Goal rows are not loaded (D-465).
test("check A by category and payee matches section 5, in one statement", async () => {
	const { result, statements } = await summarize(OCTOBER, ["category", "payee"]);
	expect(statements).toBe(1);
	expect(result).toEqual({
		count: 11,
		incomeMinor: 8500000,
		spendingMinor: 3116800,
		toGoalsMinor: 0,
		firstOn: "2026-10-01",
		lastOn: "2026-10-31",
		byCategory: [
			{ key: "housing", label: null, count: 1, outMinor: 1800000 },
			{ key: "food", label: null, count: 4, outMinor: 622000 },
			{ key: "shopping", label: null, count: 2, outMinor: 300000 },
			{ key: "entertainment", label: null, count: 2, outMinor: 214800 },
			{ key: "transportation", label: null, count: 1, outMinor: 180000 },
		],
		// Swiggy (1,020.00) and Netflix (649.00) fall below the top 6.
		byPayee: [
			{
				key: "sunrise apartments",
				label: "Sunrise Apartments",
				count: 1,
				outMinor: 1800000,
			},
			{ key: "croma", label: "Croma", count: 2, outMinor: 300000 },
			{ key: "bigbasket", label: "BigBasket", count: 1, outMinor: 290000 },
			{ key: "zomato", label: "Zomato", count: 1, outMinor: 230000 },
			{ key: "indian oil", label: "Indian Oil", count: 1, outMinor: 180000 },
			{
				key: "amazon prime",
				label: "Amazon Prime",
				count: 1,
				outMinor: 149900,
			},
		],
	});
});

test("without by, the answer has neither breakdown", async () => {
	const { result } = await summarize(OCTOBER);
	expect(result).not.toHaveProperty("byCategory");
	expect(result).not.toHaveProperty("byPayee");
	expect(result.count).toBe(11);
});

test("one breakdown alone, in the order asked", async () => {
	const { result } = await summarize(OCTOBER, ["payee"]);
	expect(result).not.toHaveProperty("byCategory");
	expect(result.byPayee).toHaveLength(6);
});

describe("which rows a breakdown counts", () => {
	test("an income-only filter gives empty breakdowns: income never enters one", async () => {
		const { result } = await summarize({ type: ["income"] }, [
			"category",
			"payee",
		]);
		expect(result).toMatchObject({ count: 3, byCategory: [], byPayee: [] });
	});

	// golden #18: Croma's refund alone has Out of −1,500.00, which is not above zero.
	test("a refund-only filter gives empty breakdowns", async () => {
		const { result } = await summarize({ type: ["refund"] }, ["category"]);
		expect(result).toMatchObject({
			count: 1,
			spendingMinor: -150000,
			byCategory: [],
		});
	});

	// Without the refund, October shopping is Croma's 4,500.00 expense alone.
	test("a type filter narrows the breakdown to its expense and refund types", async () => {
		const { result } = await summarize(
			{ ...OCTOBER, type: ["income", "expense"] },
			["category"],
		);
		expect(result.byCategory).toEqual([
			{ key: "housing", label: null, count: 1, outMinor: 1800000 },
			{ key: "food", label: null, count: 4, outMinor: 622000 },
			{ key: "shopping", label: null, count: 1, outMinor: 450000 },
			{ key: "entertainment", label: null, count: 2, outMinor: 214800 },
			{ key: "transportation", label: null, count: 1, outMinor: 180000 },
		]);
		// The totals keep the filter's own types: the salary still counts.
		expect(result.incomeMinor).toBe(8500000);
	});

	test("an income row never joins its payee's breakdown group, whatever the type filter", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			// golden #17 and #18 are Croma's October expense and refund; this is income from Croma.
			await addExpense(tx, golden.userId, {
				payee: "Croma",
				type: "income",
				category: "other_income",
				amountMinor: 1000000,
				occurredOn: "2026-10-20",
			});
			return transactionSummary(
				tx,
				goldenContext(golden.userId),
				{ ...OCTOBER, type: ["income", "expense", "refund"] },
				["payee"],
			);
		});
		expect(result.byPayee?.find(({ key }) => key === "croma")).toEqual({
			key: "croma",
			label: "Croma",
			count: 2,
			outMinor: 300000,
		});
	});

	test("leaves out a group whose refunds exactly cancel its spending", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Evenco",
				amountMinor: 50000,
				occurredOn: "2030-01-01",
			});
			await addExpense(tx, golden.userId, {
				payee: "Evenco",
				type: "refund",
				amountMinor: 50000,
				occurredOn: "2030-01-02",
			});
			return transactionSummary(
				tx,
				goldenContext(golden.userId),
				{ from: "2030-01-01" },
				["payee", "category"],
			);
		});
		expect(result).toMatchObject({
			count: 2,
			spendingMinor: 0,
			byPayee: [],
			byCategory: [],
		});
	});

	// golden: Spending by category, September, has six categories with Out.
	test("cuts at six groups", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await addExpense(tx, golden.userId, {
				payee: "Seventh",
				category: "travel",
				amountMinor: 100,
				occurredOn: "2026-09-30",
			});
			return transactionSummary(
				tx,
				goldenContext(golden.userId),
				{ from: "2026-09-01", to: "2026-09-30" },
				["category"],
			);
		});
		expect(result.byCategory?.map(({ key }) => key)).toEqual([
			"housing",
			"food",
			"shopping",
			"health",
			"entertainment",
			"transportation",
		]);
	});

	test("breaks a tie in Out by key, in code point order", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			for (const payee of ["Zeta", "Alpha", "Ümit"]) {
				await addExpense(tx, golden.userId, {
					payee,
					amountMinor: 50000,
					occurredOn: "2030-01-01",
				});
			}
			return transactionSummary(
				tx,
				goldenContext(golden.userId),
				{ from: "2030-01-01" },
				["payee"],
			);
		});
		expect(result.byPayee?.map(({ key }) => key)).toEqual([
			"alpha",
			"zeta",
			"ümit",
		]);
	});
});

test("a filter with no rows answers zeros and a null span", async () => {
	const { result } = await summarize({ q: "zzz" }, ["category", "payee"]);
	expect(result).toEqual({
		count: 0,
		incomeMinor: 0,
		spendingMinor: 0,
		toGoalsMinor: 0,
		firstOn: null,
		lastOn: null,
		byCategory: [],
		byPayee: [],
	});
});

// T2: the breakdowns at their edges (BR-F03-58, D-480). Rows are dated 2030, clear of golden's.
describe("a payee with refunds only", () => {
	const FROM_2030: TransactionFilter = { from: "2030-01-01" };

	async function seed(tx: Tx) {
		await addExpense(tx, golden.userId, {
			payee: "Shopco",
			amountMinor: 50000,
			occurredOn: "2030-01-01",
		});
		await addExpense(tx, golden.userId, {
			payee: "Refundco",
			type: "refund",
			amountMinor: 30000,
			occurredOn: "2030-01-02",
		});
	}

	test("is left out of byPayee, while its refund still nets its category", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			return transactionSummary(tx, goldenContext(golden.userId), FROM_2030, [
				"payee",
				"category",
			]);
		});
		// Out is 500.00 of spending less 300.00 refunded.
		expect(result).toMatchObject({ count: 2, spendingMinor: 20000 });
		expect(result.byPayee).toEqual([
			{ key: "shopco", label: "Shopco", count: 1, outMinor: 50000 },
		]);
		expect(result.byCategory).toEqual([
			{ key: "food", label: null, count: 2, outMinor: 20000 },
		]);
	});

	test("never reaches the cut of six, however many refund-only payees there are", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			for (let n = 1; n <= 8; n++) {
				await addExpense(tx, golden.userId, {
					payee: `Refund ${n}`,
					type: "refund",
					amountMinor: 1000 * n,
					occurredOn: "2030-01-03",
				});
			}
			return transactionSummary(tx, goldenContext(golden.userId), FROM_2030, [
				"payee",
			]);
		});
		expect(result.byPayee).toEqual([
			{ key: "shopco", label: "Shopco", count: 1, outMinor: 50000 },
		]);
	});
});

describe("by, in either order", () => {
	test.each([[["payee", "category"]], [["category", "payee"]]] as [Breakdown[]][])(
		"%j gives both breakdowns, as fields of one answer",
		async (by) => {
			const { result } = await summarize(OCTOBER, by);
			expect(Object.keys(result).sort()).toEqual([
				"byCategory",
				"byPayee",
				"count",
				"firstOn",
				"incomeMinor",
				"lastOn",
				"spendingMinor",
				"toGoalsMinor",
			]);
			expect(result.byCategory?.[0]).toMatchObject({
				key: "housing",
				outMinor: 1800000,
			});
			expect(result.byPayee?.[0]).toMatchObject({ key: "sunrise apartments" });
		},
	);
});

describe("a payee group's label (BR-F03-58)", () => {
	// Newest spelling among the rows a breakdown reads, which leave out income.
	async function seed(tx: Tx) {
		await addExpense(tx, golden.userId, {
			payee: "Label Probe",
			amountMinor: 1000,
			occurredOn: "2030-02-01",
		});
		await addExpense(tx, golden.userId, {
			payee: "LABEL PROBE",
			type: "refund",
			amountMinor: 200,
			occurredOn: "2030-02-02",
		});
		await addExpense(tx, golden.userId, {
			payee: "label probe",
			type: "income",
			category: "salary",
			amountMinor: 5000,
			occurredOn: "2030-02-03",
		});
	}
	const FEBRUARY: TransactionFilter = { from: "2030-02-01", to: "2030-02-28" };

	test("comes from the newest expense or refund row, though an income row is newer", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			return transactionSummary(tx, goldenContext(golden.userId), FEBRUARY, [
				"payee",
			]);
		});
		expect(result.byPayee).toEqual([
			{ key: "label probe", label: "LABEL PROBE", count: 2, outMinor: 800 },
		]);
	});

	test("so it can differ from the label the list gives the same group, which reads income too", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			const ctx = goldenContext(golden.userId);
			return listTransactions(tx, ctx, FEBRUARY, {
				sort: "date",
				dir: "desc",
				group: "payee",
				limit: 50,
			});
		});
		expect(result.groups).toHaveLength(1);
		expect(result.groups[0]).toMatchObject({
			key: "label probe",
			label: "label probe",
			count: 3,
		});
	});

	test("goes to the newer spelling when a still newer row is added", async () => {
		const { result } = await asUser(golden.userId, async (tx) => {
			await seed(tx);
			await addExpense(tx, golden.userId, {
				payee: "Label probe",
				amountMinor: 100,
				occurredOn: "2030-02-04",
			});
			return transactionSummary(tx, goldenContext(golden.userId), FEBRUARY, [
				"payee",
			]);
		});
		expect(result.byPayee?.[0]).toMatchObject({
			label: "Label probe",
			count: 3,
			outMinor: 900,
		});
	});
});
