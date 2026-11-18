import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { useOnce } from "../useOnce";

/** A write that settles when the test says so. */
function held<T>() {
	let settle: (outcome: { ok: true; value: T } | { ok: false }) => void = () => {};
	const promise = new Promise<T>((resolve, reject) => {
		settle = (outcome) =>
			outcome.ok ? resolve(outcome.value) : reject(new Error("refused"));
	});
	return { promise, settle };
}

describe("useOnce", () => {
	test("runs the write and answers its promise", async () => {
		const { result } = renderHook(() => useOnce());
		const answer = result.current.run(() => Promise.resolve(7));
		await expect(answer).resolves.toBe(7);
	});

	test("a second run in the same frame does not start, and answers null", async () => {
		const { result } = renderHook(() => useOnce());
		const starts: number[] = [];
		const write = () => {
			starts.push(1);
			return Promise.resolve("sent");
		};
		let first: Promise<string> | null = null;
		let second: Promise<string> | null = null;
		act(() => {
			first = result.current.run(write);
			second = result.current.run(write);
		});
		expect(second).toBeNull();
		await expect(first).resolves.toBe("sent");
		expect(starts).toHaveLength(1);
	});

	test("isRunning is true from the press to the answer", async () => {
		const { result } = renderHook(() => useOnce());
		const write = held<string>();
		expect(result.current.isRunning()).toBe(false);
		const answer = result.current.run(() => write.promise);
		expect(result.current.isRunning()).toBe(true);
		write.settle({ ok: true, value: "done" });
		await answer;
		expect(result.current.isRunning()).toBe(false);
	});

	test("it runs again once the write is answered", async () => {
		const { result } = renderHook(() => useOnce());
		await result.current.run(() => Promise.resolve(1));
		await expect(result.current.run(() => Promise.resolve(2))).resolves.toBe(2);
	});

	test("a refused write lowers the flag and still rejects for its caller", async () => {
		const { result } = renderHook(() => useOnce());
		const write = held<string>();
		const answer = result.current.run(() => write.promise);
		write.settle({ ok: false });
		await expect(answer).rejects.toThrow("refused");
		expect(result.current.isRunning()).toBe(false);
		await expect(
			result.current.run(() => Promise.resolve("again")),
		).resolves.toBe("again");
	});

	test("the flag is lowered before the caller's own handlers run", async () => {
		const { result } = renderHook(() => useOnce());
		let runningInHandler: boolean | null = null;
		await result.current
			.run(() => Promise.resolve(1))
			?.then(() => {
				runningInHandler = result.current.isRunning();
			});
		expect(runningInHandler).toBe(false);
	});

	test("two uses are independent of each other", () => {
		const { result } = renderHook(() => ({ a: useOnce(), b: useOnce() }));
		const write = held<string>();
		void result.current.a.run(() => write.promise);
		expect(result.current.a.isRunning()).toBe(true);
		expect(result.current.b.isRunning()).toBe(false);
		expect(result.current.b.run(() => Promise.resolve(1))).not.toBeNull();
	});

	test("it keeps the flag across renders", () => {
		const { result, rerender } = renderHook(() => useOnce());
		const write = held<string>();
		void result.current.run(() => write.promise);
		rerender();
		expect(result.current.isRunning()).toBe(true);
		expect(result.current.run(() => Promise.resolve(1))).toBeNull();
	});
});
