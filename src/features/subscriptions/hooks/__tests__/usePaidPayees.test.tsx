import { waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { PayeeItem, PayeesAnswer } from "@/lib/transactions/answers";
import { PAYEES_KEY } from "../../lib/payees";
import { usePaidPayees } from "../usePaidPayees";
import {
	ok,
	refuse,
	renderHookInApp,
	route,
	testClient,
	testNetwork,
} from "./helpers";

const network = testNetwork();

const payee = (name: string, over: Partial<PayeeItem> = {}): PayeeItem => ({
	payee: name,
	count: 3,
	lastUsedOn: "2026-10-05",
	lastType: "expense",
	lastCategory: "entertainment",
	lastExpense: { amountMinor: 64900, category: "entertainment" },
	...over,
});

const ANSWER: PayeesAnswer = {
	items: [payee("Netflix"), payee("Employer", { lastExpense: null })],
	currency: "INR",
};

describe("usePaidPayees (BR-F05-24, D-451)", () => {
	test("reads /api/payees and keeps the payees that have an expense", async () => {
		const reads = route(network, "get", "/api/payees", () => ok(ANSWER));
		const { result } = renderHookInApp(() => usePaidPayees());
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data?.map((item) => item.payee)).toEqual(["Netflix"]);
		expect(reads).toHaveLength(1);
	});

	test("shares the Transactions page's cache entry, so a list it holds is not asked for again", async () => {
		const reads = route(network, "get", "/api/payees", () => ok(ANSWER));
		const queryClient = testClient();
		queryClient.setQueryData(PAYEES_KEY, ANSWER);
		const { result } = renderHookInApp(() => usePaidPayees(), { queryClient });
		await waitFor(() =>
			expect(result.current.data?.map((item) => item.payee)).toEqual([
				"Netflix",
			]),
		);
		expect(reads).toHaveLength(0);
	});

	test("asks for nothing when it is not enabled, as an Edit's Name needs no payees", async () => {
		const reads = route(network, "get", "/api/payees", () => ok(ANSWER));
		const { result } = renderHookInApp(() => usePaidPayees({ enabled: false }));
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(result.current.fetchStatus).toBe("idle");
		expect(result.current.data).toBeUndefined();
		expect(reads).toHaveLength(0);
	});

	test("a failed read is an error, with no payees to list", async () => {
		route(network, "get", "/api/payees", () => refuse(500, "internal_error"));
		const { result } = renderHookInApp(() => usePaidPayees());
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});

	test("an account with no payee has an empty list", async () => {
		route(network, "get", "/api/payees", () =>
			ok({ items: [], currency: "INR" }),
		);
		const { result } = renderHookInApp(() => usePaidPayees());
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([]);
	});
});
