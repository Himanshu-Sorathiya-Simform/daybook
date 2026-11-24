import { act, renderHook } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import type { EntryType } from "../../lib/entry";
import type { PayeeItem } from "../../lib/suggestions";
import { useEntryPayeeFill } from "../useEntryPayeeFill";

const SWIGGY: PayeeItem = {
	payee: "Swiggy",
	count: 3,
	lastUsedOn: "2026-10-05",
	lastType: "expense",
	lastCategory: "food",
	lastExpense: null,
} as unknown as PayeeItem;

function setup(type: EntryType = "expense") {
	let now = type;
	const handlers = {
		setType: vi.fn((next: EntryType) => {
			now = next;
		}),
		setPayee: vi.fn(),
		setCategory: vi.fn(),
		clear: vi.fn(),
	};
	const view = renderHook(() =>
		useEntryPayeeFill({ typeNow: () => now, ...handlers }),
	);
	return { ...view, ...handlers };
}

describe("useEntryPayeeFill (BR-F03-45, D-89, BR-F03-02)", () => {
	test("starts with no hint and the tiles collapsed", () => {
		const { result } = setup();
		expect(result.current.hint).toBeUndefined();
		expect(result.current.expanded).toBe(false);
	});

	test("choosing a payee fills it and its last category, with a hint", () => {
		const { result, setPayee, setCategory, clear } = setup();
		act(() => result.current.choosePayee(SWIGGY));
		expect(setPayee).toHaveBeenCalledWith("Swiggy");
		expect(setCategory).toHaveBeenCalledWith("food");
		expect(clear).toHaveBeenCalledWith("payee");
		expect(clear).toHaveBeenCalledWith("category");
		expect(result.current.hint).toBe("From your last Swiggy Transaction");
	});

	test("a last category that does not fit the type is left out", () => {
		const { result, setPayee, setCategory } = setup("income");
		act(() => result.current.choosePayee(SWIGGY));
		expect(setPayee).toHaveBeenCalledWith("Swiggy");
		expect(setCategory).not.toHaveBeenCalled();
		expect(result.current.hint).toBeUndefined();
	});

	test("choosing the category by hand takes the hint away", () => {
		const { result } = setup();
		act(() => result.current.choosePayee(SWIGGY));
		act(() => result.current.forget());
		expect(result.current.hint).toBeUndefined();
	});

	test("moving between expense and income clears the category and its hint", () => {
		const { result, setType, setCategory } = setup();
		act(() => result.current.choosePayee(SWIGGY));
		act(() => result.current.setExpanded(true));
		act(() => result.current.changeType("income"));
		expect(setType).toHaveBeenCalledWith("income");
		expect(setCategory).toHaveBeenLastCalledWith(null);
		expect(result.current.hint).toBeUndefined();
		expect(result.current.expanded).toBe(false);
	});

	test("expense and refund share their categories, so the choice stays", () => {
		const { result, setCategory } = setup();
		act(() => result.current.choosePayee(SWIGGY));
		setCategory.mockClear();
		act(() => result.current.changeType("refund"));
		expect(setCategory).not.toHaveBeenCalled();
		expect(result.current.hint).toBe("From your last Swiggy Transaction");
	});

	test("reset starts the next entry clean", () => {
		const { result } = setup();
		act(() => result.current.choosePayee(SWIGGY));
		act(() => result.current.setExpanded(true));
		act(() => result.current.reset());
		expect(result.current.hint).toBeUndefined();
		expect(result.current.expanded).toBe(false);
	});
});
