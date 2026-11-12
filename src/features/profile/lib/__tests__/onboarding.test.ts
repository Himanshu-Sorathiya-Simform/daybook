import { describe, expect, test } from "vitest";

import {
	chooseCountry,
	type OnboardingState,
	type Picked,
	startState,
} from "../onboarding";

const KOLKATA = { zone: "Asia/Kolkata", language: "en-US" };

/** A state with `field` set to `value` and marked as picked by hand, as the form leaves it. */
function pick<F extends keyof Picked>(
	state: OnboardingState,
	field: F,
	value: OnboardingState["values"][F],
): OnboardingState {
	return {
		values: { ...state.values, [field]: value },
		picked: { ...state.picked, [field]: true },
	};
}

describe("startState (BR-F02-03 to BR-F02-06)", () => {
	// D-511: before the browser is known, nothing is guessed and nothing is picked.
	test("with no device yet, the country is empty and nothing counts as picked", () => {
		const state = startState(null);
		expect(state.values.country).toBeNull();
		expect(state.picked).toEqual({
			currency: false,
			timezone: false,
			weekStart: false,
		});
	});

	// AC-F02-01
	test("Asia/Calcutta with en-US pre-fills IN, INR, Asia/Kolkata, Sunday", () => {
		expect(
			startState({ zone: "Asia/Calcutta", language: "en-US" }).values,
		).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "sunday",
		});
	});

	// AC-F02-02
	test.each([
		[
			{ zone: "Europe/Berlin", language: "en-GB" },
			"DE",
			"EUR",
			"Europe/Berlin",
			"monday",
		],
		[{ zone: "UTC", language: "en-GB" }, "GB", "GBP", "Europe/London", "monday"],
		[
			{ zone: "Asia/Kuwait", language: "en-US" },
			"KW",
			"KWD",
			"Asia/Kuwait",
			"saturday",
		],
		[
			{ zone: "Europe/Oslo", language: "en-US" },
			"NO",
			"USD",
			"Europe/Oslo",
			"monday",
		],
		[
			{ zone: "UTC", language: "en-AU" },
			"AU",
			"USD",
			"Australia/Sydney",
			"monday",
		],
	])(
		"%o pre-fills %s, %s, %s, %s",
		(device, country, currency, timezone, weekStart) => {
			expect(startState(device).values).toEqual({
				country,
				currency,
				timezone,
				weekStart,
			});
		},
	);

	// AC-F02-02
	test("UTC and a language Intl cannot read leave the country empty", () => {
		expect(
			startState({ zone: "UTC", language: "!!" }).values.country,
		).toBeNull();
	});

	test("with no country, the other fields hold placeholders until one is chosen", () => {
		expect(startState({ zone: undefined, language: undefined }).values).toEqual({
			country: null,
			currency: "USD",
			timezone: "UTC",
			weekStart: "monday",
		});
	});

	test("nothing starts as picked by hand", () => {
		expect(startState(KOLKATA).picked).toEqual({
			currency: false,
			timezone: false,
			weekStart: false,
		});
	});
});

describe("chooseCountry (BR-F02-07, D-511)", () => {
	test("re-derives every field nobody picked", () => {
		const state = chooseCountry(startState(KOLKATA), "DE", KOLKATA.zone);
		expect(state.values).toEqual({
			country: "DE",
			currency: "EUR",
			timezone: "Europe/Berlin",
			weekStart: "monday",
		});
	});

	test("from an empty country too", () => {
		const empty = startState({ zone: "UTC", language: "!!" });
		expect(chooseCountry(empty, "IN", "UTC").values).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "sunday",
		});
	});

	test("keeps a hand-picked currency", () => {
		const picked = pick(startState(KOLKATA), "currency", "USD");
		const state = chooseCountry(picked, "DE", KOLKATA.zone);
		expect(state.values.currency).toBe("USD");
		expect(state.values.weekStart).toBe("monday");
	});

	test("keeps a hand-picked week start", () => {
		const picked = pick(startState(KOLKATA), "weekStart", "saturday");
		expect(chooseCountry(picked, "DE", KOLKATA.zone).values.weekStart).toBe(
			"saturday",
		);
	});

	test("replaces a hand-picked zone outside the new country, and it counts as unpicked again", () => {
		const us = chooseCountry(startState(KOLKATA), "US", KOLKATA.zone);
		const picked = pick(us, "timezone", "America/Chicago");
		const state = chooseCountry(picked, "DE", KOLKATA.zone);
		expect(state.values.timezone).toBe("Europe/Berlin");
		expect(state.picked.timezone).toBe(false);
	});

	test("keeps a hand-picked zone that belongs to the new country", () => {
		const us = chooseCountry(startState(KOLKATA), "US", KOLKATA.zone);
		const picked = pick(us, "timezone", "America/Chicago");
		const state = chooseCountry(picked, "US", KOLKATA.zone);
		expect(state.values.timezone).toBe("America/Chicago");
		expect(state.picked.timezone).toBe(true);
	});

	test("the device's zone wins when it is in the new country (BR-F02-05)", () => {
		const state = chooseCountry(startState(KOLKATA), "US", "America/Denver");
		expect(state.values.timezone).toBe("America/Denver");
	});

	test("the device's legacy zone name is read through the aliases", () => {
		const state = chooseCountry(startState(KOLKATA), "US", "US/Pacific");
		expect(state.values.timezone).toBe("America/Los_Angeles");
	});

	test("a device zone outside the country gives the country's default", () => {
		expect(
			chooseCountry(startState(KOLKATA), "US", "Asia/Kolkata").values.timezone,
		).toBe("America/New_York");
	});

	test("without a device zone, the country's default", () => {
		expect(
			chooseCountry(startState(KOLKATA), "CA", undefined).values.timezone,
		).toBe("America/Toronto");
	});

	test("keeps which fields were picked", () => {
		const picked = pick(
			pick(startState(KOLKATA), "currency", "USD"),
			"weekStart",
			"monday",
		);
		expect(chooseCountry(picked, "DE", KOLKATA.zone).picked).toEqual({
			currency: true,
			timezone: false,
			weekStart: true,
		});
	});
});

describe("chooseCountry purity", () => {
	test("never changes the state it was given", () => {
		const start = startState(KOLKATA);
		const copy = structuredClone(start);
		chooseCountry(start, "DE", KOLKATA.zone);
		expect(start).toEqual(copy);
	});
});
