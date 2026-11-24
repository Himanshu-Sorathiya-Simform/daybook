import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { monthAnswer } from "../../lib/__tests__/fixtures";
import type { BudgetMonthAnswer } from "../../lib/types";
import { useBudgetSelection } from "../useBudgetSelection";

const OCTOBER = monthAnswer("2026-10");
const FOOD = OCTOBER.budgets[0]!.category;
const NOTHING: BudgetMonthAnswer = {
	...OCTOBER,
	budgets: [],
	unbudgeted: [],
	inactive: [],
};

const setup = (data: BudgetMonthAnswer | null = OCTOBER) =>
	renderHook(
		({ current }: { current: BudgetMonthAnswer | undefined }) =>
			useBudgetSelection(current),
		{ initialProps: { current: data ?? undefined } },
	);

describe("useBudgetSelection (BR-F04-17, D-249)", () => {
	test("starts with nothing selected", () => {
		expect(setup().result.current.selected).toBeNull();
	});

	test("choose selects a category and null clears it", () => {
		const { result } = setup();
		act(() => result.current.choose(FOOD));
		expect(result.current.selected).toBe(FOOD);
		act(() => result.current.choose(null));
		expect(result.current.selected).toBeNull();
	});

	test("the selection stays across a month that still shows the category", () => {
		const { result, rerender } = setup();
		act(() => result.current.choose(FOOD));
		rerender({ current: monthAnswer("2026-09") });
		expect(result.current.selected).toBe(FOOD);
	});

	test("it clears when the new month does not show the category", () => {
		const { result, rerender } = setup();
		act(() => result.current.choose(FOOD));
		rerender({ current: NOTHING });
		expect(result.current.selected).toBeNull();
	});

	test("while the month loads the selection waits", () => {
		const { result, rerender } = setup();
		act(() => result.current.choose(FOOD));
		rerender({ current: undefined });
		expect(result.current.selected).toBe(FOOD);
	});
});
