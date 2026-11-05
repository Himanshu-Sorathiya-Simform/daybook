import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useMediaQuery } from "../useMediaQuery";

const DOCKED = "(min-width: 1180px)";

/** A window whose width can change: `matchMedia` answers from it and tells each list's
 * listeners when the answer flips. jsdom has no `matchMedia`. */
function fakeWindow(width: number) {
	const lists: { query: string; listeners: Set<() => void>; matches: boolean }[] =
		[];
	const min = (query: string) =>
		Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
	window.matchMedia = vi.fn((query: string) => {
		const list = {
			query,
			listeners: new Set<() => void>(),
			matches: width >= min(query),
		};
		lists.push(list);
		return {
			get matches() {
				return width >= min(query);
			},
			media: query,
			addEventListener: (_: string, listener: () => void) =>
				list.listeners.add(listener),
			removeEventListener: (_: string, listener: () => void) =>
				list.listeners.delete(listener),
		};
	}) as unknown as typeof window.matchMedia;
	return {
		resize(next: number) {
			act(() => {
				const before = lists.map((list) => width >= min(list.query));
				width = next;
				lists.forEach((list, index) => {
					if (before[index] !== width >= min(list.query))
						list.listeners.forEach((listener) => listener());
				});
			});
		},
		listenerCount: () =>
			lists.reduce((sum, list) => sum + list.listeners.size, 0),
	};
}

afterEach(() => {
	// @ts-expect-error jsdom has none; each test sets its own.
	delete window.matchMedia;
});

describe("useMediaQuery", () => {
	test("matches at the edge and above it", () => {
		fakeWindow(1180);
		expect(renderHook(() => useMediaQuery(DOCKED, false)).result.current).toBe(
			true,
		);
	});

	test("does not match one pixel below", () => {
		fakeWindow(1179);
		expect(renderHook(() => useMediaQuery(DOCKED, true)).result.current).toBe(
			false,
		);
	});

	test("follows the window as it crosses the edge, both ways", () => {
		const screen = fakeWindow(1400);
		const { result } = renderHook(() => useMediaQuery(DOCKED, false));

		screen.resize(900);
		expect(result.current).toBe(false);

		screen.resize(1180);
		expect(result.current).toBe(true);
	});

	test("stops listening once unmounted", () => {
		const screen = fakeWindow(1400);
		const { unmount } = renderHook(() => useMediaQuery(DOCKED, false));
		expect(screen.listenerCount()).toBeGreaterThan(0);

		unmount();

		expect(screen.listenerCount()).toBe(0);
	});

	test("a browser without matchMedia matches nothing", () => {
		expect(renderHook(() => useMediaQuery(DOCKED, true)).result.current).toBe(
			false,
		);
	});

	test("on the server it answers what the caller gives", () => {
		function Probe({ onServer }: { onServer: boolean }) {
			return <span>{String(useMediaQuery(DOCKED, onServer))}</span>;
		}
		expect(renderToString(<Probe onServer />)).toContain("true");
		expect(renderToString(<Probe onServer={false} />)).toContain("false");
	});
});
