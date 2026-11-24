import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useElementWidth } from "../useElementWidth";

type Callback = (entries: { contentRect: { width: number } }[]) => void;
let callback: Callback | null = null;
const disconnect = vi.fn();
const observe = vi.fn();

function stubObserver(width: number) {
	vi.stubGlobal(
		"ResizeObserver",
		class {
			constructor(next: Callback) {
				callback = next;
			}
			observe = observe;
			disconnect = disconnect;
		},
	);
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
		width,
	} as DOMRect);
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	callback = null;
	disconnect.mockClear();
	observe.mockClear();
});

function Probe() {
	const [ref, width] = useElementWidth<HTMLDivElement>();
	return (
		<div
			ref={ref}
			data-testid="box"
		>
			{String(width)}
		</div>
	);
}

describe("useElementWidth", () => {
	test("reads the width as the element mounts", () => {
		stubObserver(412);
		render(<Probe />);
		expect(screen.getByTestId("box")).toHaveTextContent("412");
	});

	test("watches the element", () => {
		stubObserver(412);
		render(<Probe />);
		expect(observe).toHaveBeenCalledExactlyOnceWith(screen.getByTestId("box"));
	});

	test("follows a change of width", () => {
		stubObserver(412);
		render(<Probe />);
		act(() => callback!([{ contentRect: { width: 640 } }]));
		expect(screen.getByTestId("box")).toHaveTextContent("640");
	});

	test("ignores a report with no entry", () => {
		stubObserver(412);
		render(<Probe />);
		act(() => callback!([]));
		expect(screen.getByTestId("box")).toHaveTextContent("412");
	});

	test("stops watching when the element goes", () => {
		stubObserver(412);
		const { unmount } = render(<Probe />);
		unmount();
		expect(disconnect).toHaveBeenCalledOnce();
	});

	test("is null where there is no ResizeObserver", () => {
		vi.stubGlobal("ResizeObserver", undefined);
		render(<Probe />);
		expect(screen.getByTestId("box")).toHaveTextContent("null");
	});
});
