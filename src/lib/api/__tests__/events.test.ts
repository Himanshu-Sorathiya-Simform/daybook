import { describe, expect, test, vi } from "vitest";

import { emitApiEvent, onApiEvent } from "../events";

describe("API events", () => {
	test("a listener hears every event until it stops", () => {
		const heard = vi.fn();
		const stop = onApiEvent(heard);
		emitApiEvent({ type: "unauthenticated" });
		emitApiEvent({ type: "profile_required" });
		stop();
		emitApiEvent({ type: "capabilities_changed" });
		expect(heard.mock.calls).toEqual([
			[{ type: "unauthenticated" }],
			[{ type: "profile_required" }],
		]);
	});

	test("every listener hears each event, in the order they started", () => {
		const order: string[] = [];
		const stops = [
			onApiEvent(() => order.push("first")),
			onApiEvent(() => order.push("second")),
		];
		emitApiEvent({ type: "unauthenticated" });
		for (const stop of stops) stop();
		expect(order).toEqual(["first", "second"]);
	});

	test("a listener that stops while hearing an event does not make another miss it", () => {
		const second = vi.fn();
		const stopFirst = onApiEvent(() => stopFirst());
		const stopSecond = onApiEvent(second);
		emitApiEvent({ type: "unauthenticated" });
		stopSecond();
		expect(second).toHaveBeenCalledTimes(1);
	});

	test("stopping twice is harmless", () => {
		const stop = onApiEvent(() => undefined);
		stop();
		expect(() => stop()).not.toThrow();
	});

	test("an event with no listener goes nowhere", () => {
		expect(() => emitApiEvent({ type: "unauthenticated" })).not.toThrow();
	});
});
