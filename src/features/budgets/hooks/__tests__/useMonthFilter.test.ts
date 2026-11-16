import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { Month } from "@/lib/budgets/months";
import { useMonthFilter } from "../useMonthFilter";

const setup = (month: Month) =>
	renderHook(({ month: shown }) => useMonthFilter(shown), {
		initialProps: { month },
	});

describe("useMonthFilter (BR-F04-31)", () => {
	test("shows every state until one is chosen", () => {
		const { result } = setup("2026-10");
		expect(result.current[0]).toBeNull();
	});

	test("a chosen state holds while the month stays", () => {
		const { result, rerender } = setup("2026-10");
		act(() => result.current[1]("over"));
		expect(result.current[0]).toBe("over");
		rerender({ month: "2026-10" });
		expect(result.current[0]).toBe("over");
	});

	test("choosing another state replaces it", () => {
		const { result } = setup("2026-10");
		act(() => result.current[1]("over"));
		act(() => result.current[1]("warning"));
		expect(result.current[0]).toBe("warning");
	});

	test("choosing null shows every state again", () => {
		const { result } = setup("2026-10");
		act(() => result.current[1]("over"));
		act(() => result.current[1](null));
		expect(result.current[0]).toBeNull();
	});

	test("any change of month drops it for good, Back included", () => {
		const { result, rerender } = setup("2026-10");
		act(() => result.current[1]("over"));
		rerender({ month: "2026-09" });
		expect(result.current[0]).toBeNull();
		rerender({ month: "2026-10" });
		expect(result.current[0]).toBeNull();
	});

	test("a state chosen in the new month belongs to that month", () => {
		const { result, rerender } = setup("2026-10");
		act(() => result.current[1]("over"));
		rerender({ month: "2026-09" });
		act(() => result.current[1]("at"));
		expect(result.current[0]).toBe("at");
		rerender({ month: "2026-10" });
		expect(result.current[0]).toBeNull();
	});
});
