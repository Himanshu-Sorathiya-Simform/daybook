import { renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { PayeeItem } from "@/lib/transactions/answers";
import { IN_LOCALE } from "../../lib/__tests__/fixtures";
import { type PayeeFill, usePayeeFill } from "../usePayeeFill";

const NETFLIX: PayeeItem = {
	payee: "Netflix",
	count: 3,
	lastUsedOn: "2026-10-05",
	lastType: "expense",
	lastCategory: "entertainment",
	lastExpense: { amountMinor: 64900, category: "entertainment" },
};
const EMPLOYER: PayeeItem = {
	...NETFLIX,
	payee: "Employer",
	lastType: "income",
	lastExpense: null,
};

const FILLED: PayeeFill = {
	name: "Netflix",
	category: "entertainment",
	amount: "649.00",
};

function setup(
	values = { name: "Ne", category: null, amount: "" } as {
		name: string;
		category: PayeeFill["category"] | null;
		amount: string;
	},
) {
	const onFill = vi.fn();
	const view = renderHook(
		(current: typeof values) =>
			usePayeeFill({ values: current, locale: IN_LOCALE, onFill }),
		{ initialProps: values },
	);
	return { ...view, onFill };
}

describe("usePayeeFill (BR-F05-24, D-594)", () => {
	test("says nothing before a payee is chosen", () => {
		const { result } = setup();
		expect(result.current.hint).toBeUndefined();
	});

	test("choosing a payee fills its category and the amount of its last expense", () => {
		const { result, onFill } = setup();
		result.current.choose(NETFLIX);
		expect(onFill).toHaveBeenCalledExactlyOnceWith(FILLED);
	});

	test("the hint names the payee, its category and amount while the fields stand", () => {
		const { result, rerender } = setup();
		result.current.choose(NETFLIX);
		rerender(FILLED);
		expect(result.current.hint).toBe(
			"Filled from your last Netflix expense: Entertainment, ₹649.00.",
		);
	});

	test.each([
		["name", { ...FILLED, name: "Netflix India" }],
		["category", { ...FILLED, category: "health" as const }],
		["amount", { ...FILLED, amount: "799.00" }],
	])("the hint goes once the %s changes", (_field, changed) => {
		const { result, rerender } = setup();
		result.current.choose(NETFLIX);
		rerender(FILLED);
		rerender(changed);
		expect(result.current.hint).toBeUndefined();
	});

	test("a payee with no expense fills nothing and has no hint", () => {
		const { result, onFill, rerender } = setup();
		result.current.choose(EMPLOYER);
		rerender({ name: "Employer", category: null, amount: "" });
		expect(onFill).not.toHaveBeenCalled();
		expect(result.current.hint).toBeUndefined();
	});
});
