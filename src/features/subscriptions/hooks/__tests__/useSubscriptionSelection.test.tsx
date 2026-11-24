import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { subscriptionList } from "../../lib/__tests__/fixtures";
import type { SubscriptionList } from "../../lib/types";
import { useSubscriptionSelection } from "../useSubscriptionSelection";

const GOLDEN = subscriptionList();
const [NETFLIX, CULT, SUNRISE] = GOLDEN.items;

const without = (...names: string[]): SubscriptionList => ({
	...GOLDEN,
	items: GOLDEN.items.filter((item) => !names.includes(item.name)),
});

/** The hook on `list`, GOLDEN's by default, or on no list at all for `null`. */
const setup = (list: SubscriptionList | null = GOLDEN) =>
	renderHook(
		({ current }: { current: SubscriptionList | undefined }) =>
			useSubscriptionSelection(current),
		{ initialProps: { current: list ?? undefined } },
	);

describe("useSubscriptionSelection (BR-F05-21, BR-F05-38, BR-F05-50)", () => {
	test("starts with nothing selected, marked or filtered", () => {
		const { result } = setup();
		expect(result.current.selected).toBeNull();
		expect(result.current.markedDue).toBeNull();
		expect(result.current.category).toBeNull();
		expect(result.current.shown).toBe(GOLDEN);
	});

	test("before the list has loaded there is nothing to show", () => {
		const { result } = setup(null);
		expect(result.current.shown).toBeUndefined();
		expect(result.current.selected).toBeNull();
	});

	describe("the selection", () => {
		test("choose selects a Subscription and none clears it", () => {
			const { result } = setup();
			act(() => result.current.choose(NETFLIX!.id));
			expect(result.current.selected).toBe(NETFLIX!.id);
			act(() => result.current.choose(null));
			expect(result.current.selected).toBeNull();
		});

		test("markCharge selects a Subscription and marks the date it came from", () => {
			const { result } = setup();
			act(() => result.current.markCharge(NETFLIX!.id, "2026-11-05"));
			expect(result.current.selected).toBe(NETFLIX!.id);
			expect(result.current.markedDue).toBe("2026-11-05");
		});

		test("choosing again, from the list or the keyboard, takes the mark away", () => {
			const { result } = setup();
			act(() => result.current.markCharge(NETFLIX!.id, "2026-11-05"));
			act(() => result.current.choose(CULT!.id));
			expect(result.current.selected).toBe(CULT!.id);
			expect(result.current.markedDue).toBeNull();
		});

		test("a Subscription that leaves the list is unselected, and stays so if it returns", () => {
			const { result, rerender } = setup();
			act(() => result.current.markCharge(NETFLIX!.id, "2026-11-05"));
			rerender({ current: without("Netflix") });
			expect(result.current.selected).toBeNull();
			expect(result.current.markedDue).toBeNull();
			rerender({ current: GOLDEN });
			expect(result.current.selected).toBeNull();
		});

		test("a Subscription that stays in the list stays selected", () => {
			const { result, rerender } = setup();
			act(() => result.current.choose(NETFLIX!.id));
			rerender({ current: without("Cult Gym") });
			expect(result.current.selected).toBe(NETFLIX!.id);
		});
	});

	describe("the category filter", () => {
		test("filterTo narrows the list to the category", () => {
			const { result } = setup();
			act(() => result.current.filterTo("entertainment"));
			expect(result.current.category).toBe("entertainment");
			expect(result.current.shown?.items.map((item) => item.name)).toEqual([
				"Netflix",
				"Amazon Prime",
			]);
		});

		test("the same category again clears it", () => {
			const { result } = setup();
			act(() => result.current.filterTo("entertainment"));
			act(() => result.current.filterTo("entertainment"));
			expect(result.current.category).toBeNull();
			expect(result.current.shown).toBe(GOLDEN);
		});

		test("another category replaces it", () => {
			const { result } = setup();
			act(() => result.current.filterTo("entertainment"));
			act(() => result.current.filterTo("health"));
			expect(result.current.category).toBe("health");
		});

		test("clearFilter shows every Subscription again", () => {
			const { result } = setup();
			act(() => result.current.filterTo("health"));
			act(() => result.current.clearFilter());
			expect(result.current.category).toBeNull();
		});

		test("a selection the filter would hide clears with it", () => {
			const { result } = setup();
			act(() => result.current.choose(CULT!.id));
			act(() => result.current.filterTo("entertainment"));
			expect(result.current.selected).toBeNull();
		});

		test("a selection the filter keeps stays", () => {
			const { result } = setup();
			act(() => result.current.choose(NETFLIX!.id));
			act(() => result.current.filterTo("entertainment"));
			expect(result.current.selected).toBe(NETFLIX!.id);
		});

		test("a category that has lost its last Subscription clears", () => {
			const { result, rerender } = setup();
			act(() => result.current.filterTo("health"));
			rerender({ current: without("Cult Gym") });
			expect(result.current.category).toBeNull();
			expect(result.current.shown?.items).toHaveLength(3);
		});
	});

	describe("reveal", () => {
		test("drops a filter that would hide the Subscription", () => {
			const { result } = setup();
			act(() => result.current.filterTo("entertainment"));
			act(() => result.current.reveal(SUNRISE));
			expect(result.current.category).toBeNull();
		});

		test("keeps a filter the Subscription is within", () => {
			const { result } = setup();
			act(() => result.current.filterTo("entertainment"));
			act(() => result.current.reveal(NETFLIX));
			expect(result.current.category).toBe("entertainment");
		});

		test("does nothing with no filter or no Subscription", () => {
			const { result } = setup();
			act(() => result.current.reveal(SUNRISE));
			expect(result.current.category).toBeNull();
			act(() => result.current.filterTo("health"));
			act(() => result.current.reveal(undefined));
			expect(result.current.category).toBe("health");
		});
	});
});
