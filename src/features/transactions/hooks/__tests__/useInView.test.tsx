import { act, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useInView } from "../useInView";

type Watched = {
	callback: IntersectionObserverCallback;
	targets: Element[];
	live: boolean;
};
const observers: Watched[] = [];

class FakeObserver {
	private watched: Watched;
	constructor(callback: IntersectionObserverCallback) {
		this.watched = { callback, targets: [], live: true };
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
}: {
	active: boolean;
	onVisible: () => void;
	attach?: boolean;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useInView(ref, active, onVisible);
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
});
