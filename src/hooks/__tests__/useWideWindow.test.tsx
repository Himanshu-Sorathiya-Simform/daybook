import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { WIDE_COOKIE } from "@/lib/device-cookies";
import { useWideWindow, WIDE_QUERY } from "../useWideWindow";

const cookie = () =>
	document.cookie
		.split("; ")
		.find((entry) => entry.startsWith(`${WIDE_COOKIE}=`))
		?.split("=")[1];

/** A window whose width can change, as `matchMedia` reports it. */
function fakeWindow(width: number) {
	const listeners = new Set<() => void>();
	window.matchMedia = vi.fn((query: string) => ({
		get matches() {
			return query === WIDE_QUERY && width >= 768;
		},
		media: query,
		addEventListener: (_: string, listener: () => void) =>
			listeners.add(listener),
		removeEventListener: (_: string, listener: () => void) =>
			listeners.delete(listener),
	})) as unknown as typeof window.matchMedia;
	return {
		resize(next: number) {
			act(() => {
				width = next;
				for (const listener of listeners) listener();
			});
		},
	};
}

afterEach(() => {
	// @ts-expect-error jsdom has none; some tests set one.
	delete window.matchMedia;
	document.cookie = `${WIDE_COOKIE}=; Max-Age=0; Path=/`;
});

describe("useWideWindow (D-629)", () => {
	test("asks for 768 px, 48rem", () => {
		expect(WIDE_QUERY).toBe("(min-width: 48rem)");
	});

	test("is true from 768 px and false below", () => {
		fakeWindow(768);
		expect(renderHook(() => useWideWindow(false)).result.current).toBe(true);
		fakeWindow(767);
		expect(renderHook(() => useWideWindow(true)).result.current).toBe(false);
	});

	test("follows the window as it changes", () => {
		const win = fakeWindow(1000);
		const { result } = renderHook(() => useWideWindow(false));
		expect(result.current).toBe(true);
		win.resize(500);
		expect(result.current).toBe(false);
		win.resize(900);
		expect(result.current).toBe(true);
	});

	test("keeps the class in the daybook_wide cookie", () => {
		fakeWindow(1000);
		renderHook(() => useWideWindow(false));
		expect(cookie()).toBe("wide");
	});

	test("rewrites the cookie when the class changes", () => {
		const win = fakeWindow(1000);
		renderHook(() => useWideWindow(false));
		win.resize(400);
		expect(cookie()).toBe("narrow");
		win.resize(1000);
		expect(cookie()).toBe("wide");
	});

	test("the server draws what the cookie said, wide or narrow", () => {
		function Probe({ onServer }: { onServer: boolean }) {
			return <p>{useWideWindow(onServer) ? "wide" : "narrow"}</p>;
		}
		expect(renderToString(<Probe onServer />)).toContain("wide");
		expect(renderToString(<Probe onServer={false} />)).toContain("narrow");
	});

	test("in a browser without matchMedia it is false, whatever the cookie said", () => {
		const { result } = renderHook(() => useWideWindow(true));
		expect(result.current).toBe(false);
	});
});
