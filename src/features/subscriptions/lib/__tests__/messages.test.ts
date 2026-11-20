import { describe, expect, test } from "vitest";

import { asOfText, PAGE_TEXT } from "../messages";

const F = { dateLocale: "en-IN", timezone: "Asia/Kolkata" };
// 2026-11-02T08:35:00Z is 14:05 in Kolkata.
const AT = Date.UTC(2026, 10, 2, 8, 35);

describe("asOfText (section 10)", () => {
	test("is nothing online", () => {
		expect(asOfText(true, AT, F)).toBeNull();
	});

	test("is nothing while nothing has loaded", () => {
		expect(asOfText(false, 0, F)).toBeNull();
	});

	test("offline gives the load's time in the profile's zone and hour cycle", () => {
		expect(asOfText(false, AT, F)).toBe("as of 2:05 pm");
	});

	test("another zone moves the time", () => {
		expect(asOfText(false, AT, { ...F, timezone: "America/Los_Angeles" })).toBe(
			"as of 12:35 am",
		);
	});

	test("a 24-hour locale writes 14:05", () => {
		expect(
			asOfText(false, AT, { dateLocale: "de-DE", timezone: "Asia/Kolkata" }),
		).toBe("as of 14:05");
	});
});

describe("the page's words (section 6)", () => {
	test("hold the states' texts", () => {
		expect(PAGE_TEXT.title).toBe("Subscriptions");
		expect(PAGE_TEXT.viewLabel).toBe("Show Subscriptions as");
		expect(PAGE_TEXT.loadFailed).toBe("Subscriptions could not be loaded.");
		expect(PAGE_TEXT.loadFailedBody).toBe(
			"Check your connection, then try again. Your Subscriptions are safe.",
		);
		expect(PAGE_TEXT.emptyTitle).toBe("No Subscriptions yet.");
		expect(PAGE_TEXT.emptyBody).toBe(
			"Add rent, streaming, insurance or any bill that repeats.",
		);
		expect(PAGE_TEXT.retry).toBe("Retry");
		expect(PAGE_TEXT.add).toBe("Add a Subscription");
	});
});
