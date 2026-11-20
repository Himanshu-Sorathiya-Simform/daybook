import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useInView } from "../useInView";

type Watched = {
	callback: IntersectionObserverCallback;
	targets: Element[];
	live: boolean;
	options: IntersectionObserverInit | undefined;
};
const observers: Watched[] = [];

class FakeObserver {
	private watched: Watched;
	constructor(
		callback: IntersectionObserverCallback,
		options?: IntersectionObserverInit,
	) {
		this.watched = { callback, targets: [], live: true, options };
		observers.push(this.watched);
	}
	observe(target: Element) {
		this.watched.targets.push(target);
	}
	unobserve() {}
	disconnect() {
		this.watched.live = false;
	}
	takeRecords() {
		return [];
	}
}

beforeEach(() => {
	observers.length = 0;
	vi.stubGlobal("IntersectionObserver", FakeObserver);
});
afterEach(() => {
	vi.unstubAllGlobals();
});

function Probe({
	active,
	onVisible,
	attach = true,
	resetKey,
	margin,
}: {
	active: boolean;
	onVisible: () => void;
	attach?: boolean;
	resetKey?: unknown;
	margin?: string;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useInView(ref, active, onVisible, resetKey, margin);
	return attach ? <div ref={ref}>Top</div> : null;
}

/** Tells every live observer that its targets are or are not in view. */
function report(isIntersecting: boolean) {
	act(() => {
		for (const watched of observers.filter((each) => each.live))
			watched.callback(
				watched.targets.map(
					(target) =>
						({ isIntersecting, target }) as IntersectionObserverEntry,
				),
				{} as IntersectionObserver,
			);
	});
}

describe("useInView (BR-F03-30)", () => {
	test("watches the element while active, and calls back when it comes into view", () => {
		const onVisible = vi.fn();
		render(
			<Probe
				active
				onVisible={onVisible}
			/>,
		);

		expect(observers).toHaveLength(1);
		expect(observers[0]?.targets[0]).toHaveTextContent("Top");
		report(true);
		expect(onVisible).toHaveBeenCalledOnce();
	});

	test("does not call back while the element is out of view", () => {
		const onVisible = vi.fn();
		render(
			<Probe
				active
				onVisible={onVisible}
			/>,
		);

		report(false);

		expect(onVisible).not.toHaveBeenCalled();
	});

	test("watches nothing while inactive", () => {
		render(
			<Probe
				active={false}
				onVisible={vi.fn()}
			/>,
		);

		expect(observers).toHaveLength(0);
	});

	test("watches nothing when there is no element yet", () => {
		render(
			<Probe
				active
				attach={false}
				onVisible={vi.fn()}
			/>,
		);

		expect(observers).toHaveLength(0);
	});

	test("stops watching when it becomes inactive, and when it unmounts", () => {
		const { rerender, unmount } = render(
			<Probe
				active
				onVisible={vi.fn()}
			/>,
		);
		rerender(
			<Probe
				active={false}
				onVisible={vi.fn()}
			/>,
		);
		expect(observers[0]?.live).toBe(false);

		rerender(
			<Probe
				active
				onVisible={vi.fn()}
			/>,
		);
		unmount();
		expect(observers.every((each) => !each.live)).toBe(true);
	});

	test("calls the latest callback without watching again", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = render(
			<Probe
				active
				onVisible={first}
			/>,
		);
		rerender(
			<Probe
				active
				onVisible={second}
			/>,
		);

		report(true);

		expect(observers).toHaveLength(1);
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledOnce();
	});

	// BR-F03-30: after a page loads, an end still on screen must load again; an observer only
	// calls back when its target's visibility changes, or when it starts watching.
	test("a new reset key watches afresh, and the same key keeps the watcher", () => {
		const onVisible = vi.fn();
		const { rerender } = render(
			<Probe
				active
				onVisible={onVisible}
				resetKey={1}
			/>,
		);
		expect(observers.filter((each) => each.live)).toHaveLength(1);

		rerender(
			<Probe
				active
				onVisible={onVisible}
				resetKey={1}
			/>,
		);
		expect(observers).toHaveLength(1);

		rerender(
			<Probe
				active
				onVisible={onVisible}
				resetKey={2}
			/>,
		);
		expect(observers).toHaveLength(2);
		expect(observers[0]!.live).toBe(false);
		expect(observers[1]!.live).toBe(true);
		report(true);
		expect(onVisible).toHaveBeenCalledOnce();
	});

	// D-620
	describe("the margin", () => {
		test("is none by default: the element is watched against the screen itself", () => {
			render(
				<Probe
					active
					onVisible={vi.fn()}
				/>,
			);
			expect(observers).toHaveLength(1);
			expect(observers[0]?.options).toEqual({ rootMargin: "0px" });
		});

		test("widens the screen as given, so the callback comes before the element is visible", () => {
			render(
				<Probe
					active
					onVisible={vi.fn()}
					margin="0px 0px 1000px 0px"
				/>,
			);
			expect(observers[0]?.options).toEqual({
				rootMargin: "0px 0px 1000px 0px",
			});
		});

		test("a new margin watches afresh with it, and drops the old observer", () => {
			const { rerender } = render(
				<Probe
					active
					onVisible={vi.fn()}
					margin="0px"
				/>,
			);
			rerender(
				<Probe
					active
					onVisible={vi.fn()}
					margin="0px 0px 400px 0px"
				/>,
			);
			expect(observers).toHaveLength(2);
			expect(observers[0]?.live).toBe(false);
			expect(observers[1]?.live).toBe(true);
			expect(observers[1]?.options).toEqual({
				rootMargin: "0px 0px 400px 0px",
			});
		});

		test("an inactive watcher makes no observer, whatever the margin", () => {
			render(
				<Probe
					active={false}
					onVisible={vi.fn()}
					margin="0px 0px 1000px 0px"
				/>,
			);
			expect(observers).toHaveLength(0);
		});

		test("still calls back when the element reports it is within the margin", () => {
			const onVisible = vi.fn();
			render(
				<Probe
					active
					onVisible={onVisible}
					margin="0px 0px 1000px 0px"
				/>,
			);
			report(true);
			expect(onVisible).toHaveBeenCalledTimes(1);
			report(false);
			expect(onVisible).toHaveBeenCalledTimes(1);
		});
	});
});
