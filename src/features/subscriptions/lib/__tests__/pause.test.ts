import { describe, expect, test } from "vitest";

import {
	PAUSE_TEXT,
	pauseCase,
	pauseDates,
	pauseOptions,
	pauseRange,
	pauseStart,
	pauseView,
} from "../pause";
import type { SubscriptionsLocale } from "../types";
import { subscriptionItem } from "./fixtures";

/** The golden profile at the golden clock: 2 November 2026 in `en-IN`. */
const IN: SubscriptionsLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
};
const TODAY = IN.today;
const NOW = "2026-11-02T06:30:00.000Z";
const NETFLIX = subscriptionItem("netflix");
/** Paused from its next charge until January: not yet started. */
const FUTURE = subscriptionItem("netflix", {
	status: "paused",
	pause: { from: "2026-11-05", until: "2027-01-05" },
});
/** Paused since October until January: in force. */
const INFORCE = subscriptionItem("netflix", {
	status: "paused",
	pause: { from: "2026-10-05", until: "2027-01-05" },
	nextDueOn: "2027-01-05",
});

describe("which pause this is (BR-F05-43)", () => {
	test("none stored is a new pause", () => {
		expect(pauseCase(NETFLIX, TODAY)).toBe("new");
	});
	test("one that starts after today has not started", () => {
		expect(pauseCase(FUTURE, TODAY)).toBe("future");
	});
	test("one that starts today is already in force", () => {
		expect(
			pauseCase({ pause: { from: "2026-11-02", until: "2027-01-05" } }, TODAY),
		).toBe("inForce");
	});
	test("one that started and has not ended is in force", () => {
		expect(pauseCase(INFORCE, TODAY)).toBe("inForce");
	});
	test("one that ended today is still in force", () => {
		expect(
			pauseCase({ pause: { from: "2026-10-05", until: "2026-11-02" } }, TODAY),
		).toBe("inForce");
	});
	test("one that ended before today counts as new", () => {
		expect(
			pauseCase({ pause: { from: "2026-09-05", until: "2026-10-05" } }, TODAY),
		).toBe("new");
	});
});

describe("the dates a pause could cover (BR-F05-43)", () => {
	test("start with the next charge and run to the 24-month limit", () => {
		const dates = pauseDates(NETFLIX, TODAY);
		expect(dates.slice(0, 3)).toEqual([
			"2026-11-05",
			"2026-12-05",
			"2027-01-05",
		]);
		expect(dates.at(-1)).toBe("2028-10-05");
	});

	test("leave out a skipped date", () => {
		const skipped = subscriptionItem("netflix", { skips: ["2026-11-05"] });
		expect(pauseDates(skipped, TODAY)[0]).toBe("2026-12-05");
	});

	test("leave the stored pause out of the question", () => {
		expect(pauseDates(FUTURE, TODAY)[0]).toBe("2026-11-05");
	});

	test("stop at the end date", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		expect(pauseDates(ending, TODAY)).toEqual(["2026-11-05", "2026-12-05"]);
	});
});

describe("the choices (BR-F05-43)", () => {
	const flags = (item = NETFLIX) =>
		pauseOptions(item, TODAY).map((option) => [option.value, option.isDisabled]);

	test("The next charge, 2 charges, 3 charges and Until a date, all open", () => {
		expect(pauseOptions(NETFLIX, TODAY).map((option) => option.label)).toEqual([
			"The next charge",
			"2 charges",
			"3 charges",
			"Until a date",
		]);
		expect(flags()).toEqual([
			["n1", false],
			["n2", false],
			["n3", false],
			["date", false],
		]);
	});

	test("a count is disabled when no date follows on or before the end date", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		expect(flags(ending)).toEqual([
			["n1", false],
			["n2", true],
			["n3", true],
			["date", false],
		]);
	});

	test("a count is disabled when its date falls past the limit", () => {
		const yearly = subscriptionItem("netflix", {
			cadence: { unit: "month", every: 12 },
			startDate: "2026-11-05",
			chargesFrom: "2026-11-05",
		});
		expect(flags(yearly)).toEqual([
			["n1", false],
			["n2", true],
			["n3", true],
			["date", false],
		]);
	});

	test("a pause in force offers only the date", () => {
		expect(flags(INFORCE)).toEqual([["date", false]]);
	});

	test("a pause not yet started offers all of them", () => {
		expect(pauseOptions(FUTURE, TODAY)).toHaveLength(4);
	});
});

describe("what it opens with (BR-F05-43)", () => {
	test("2 charges", () => {
		expect(pauseStart(NETFLIX, TODAY).choice).toBe("n2");
	});

	test("2 charges when 2 can be had and 3 cannot", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2027-01-31",
		});
		expect(pauseStart(ending, TODAY).choice).toBe("n2");
	});

	test("the next charge when 2 cannot be had", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		expect(pauseStart(ending, TODAY).choice).toBe("n1");
	});

	test("a date when no count can be had", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-11-30",
		});
		expect(pauseStart(ending, TODAY).choice).toBe("date");
	});

	test("the date starts 2 months after the first pausable date", () => {
		expect(pauseStart(NETFLIX, TODAY).until).toBe("2027-01-05");
	});

	test("Change pause opens on the date, at the stored until", () => {
		expect(pauseStart(FUTURE, TODAY)).toEqual({
			choice: "date",
			until: "2027-01-05",
		});
		expect(pauseStart(INFORCE, TODAY)).toEqual({
			choice: "date",
			until: "2027-01-05",
		});
	});

	test("the date is at most the limit", () => {
		const late = subscriptionItem("netflix", {
			cadence: { unit: "month", every: 12 },
			startDate: "2028-10-30",
			chargesFrom: "2028-10-30",
			nextDueOn: "2028-10-30",
		});
		expect(pauseStart(late, TODAY).until <= "2028-11-02").toBe(true);
	});
});

describe("the dates Until a date may take (BR-F05-43)", () => {
	test("from the day after the first pausable date to the limit", () => {
		expect(pauseRange(NETFLIX, TODAY)).toEqual({
			min: "2026-11-06",
			max: "2028-11-02",
		});
	});

	test("for a pause in force from today", () => {
		expect(pauseRange(INFORCE, TODAY)).toEqual({
			min: "2026-11-02",
			max: "2028-11-02",
		});
	});
});

describe("Pause as it stands (BR-F05-29, BR-F05-43)", () => {
	const view = (
		values: Parameters<typeof pauseView>[0]["values"],
		item = NETFLIX,
	) => pauseView({ item, values, locale: IN, changedAt: NOW });

	// AC-F05-49
	test("2 charges pauses from the next charge to the third and resumes there", () => {
		const found = view({ choice: "n2", until: "2027-01-05" });
		expect(found.pause).toEqual({ from: "2026-11-05", until: "2027-01-05" });
		expect(found.resumeOn).toBe("2027-01-05");
		expect(found.strip).toEqual([
			{ kind: "off", label: "5 Nov", amount: "₹649.00", note: "paused" },
			{ kind: "off", label: "5 Dec", amount: "₹649.00", note: "paused" },
			{ kind: "new", label: "5 Jan 2027", amount: "₹649.00", note: "resumes" },
			{ kind: "more", label: "" },
		]);
		expect(found.sentence).toBe(
			"Nothing is added while it's paused. Charges resume on Tue, 5 Jan, 2027 at ₹649.00, without you doing anything.",
		);
		expect(found.buttonLabel).toBe("Pause until 5 Jan 2027");
		expect(found.body).toEqual({
			changedAt: NOW,
			pause: { from: "2026-11-05", until: "2027-01-05" },
		});
	});

	test("the next charge pauses one date", () => {
		const found = view({ choice: "n1", until: "2027-01-05" });
		expect(found.pause).toEqual({ from: "2026-11-05", until: "2026-12-05" });
		expect(found.strip.filter((cell) => cell.note === "paused")).toHaveLength(1);
	});

	test("shows at most three paused charges", () => {
		const found = view({ choice: "date", until: "2027-06-05" });
		expect(found.strip.filter((cell) => cell.note === "paused")).toHaveLength(3);
		expect(found.pause).toEqual({ from: "2026-11-05", until: "2027-06-05" });
	});

	test("a date pauses from the first pausable date up to it", () => {
		const found = view({ choice: "date", until: "2026-12-20" });
		expect(found.pause).toEqual({ from: "2026-11-05", until: "2026-12-20" });
		expect(found.resumeOn).toBe("2027-01-05");
	});

	test("with no charge after the pause it leaves out the second sentence and the date", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		const found = view({ choice: "date", until: "2027-03-01" }, ending);
		expect(found.resumeOn).toBeNull();
		expect(found.sentence).toBe("Nothing is added while it's paused.");
		expect(found.buttonLabel).toBe("Pause");
		expect(found.strip.some((cell) => cell.note === "resumes")).toBe(false);
	});

	test("a count that cannot be had makes no pause and no write", () => {
		const ending = subscriptionItem("netflix", {
			status: "ending",
			endDate: "2026-12-31",
		});
		const found = view({ choice: "n3", until: "2027-01-05" }, ending);
		expect(found.pause).toBeNull();
		expect(found.body).toBeNull();
	});

	test("Change pause on one that has not started replaces it from its own start", () => {
		const found = view({ choice: "date", until: "2027-03-05" }, FUTURE);
		expect(found.pause).toEqual({ from: "2026-11-05", until: "2027-03-05" });
		expect(found.body).not.toBeNull();
	});

	test("Change pause on one in force keeps its from", () => {
		const found = view({ choice: "date", until: "2027-03-05" }, INFORCE);
		expect(found.pause).toEqual({ from: "2026-10-05", until: "2027-03-05" });
	});

	test("the stored pause as it is, is no write", () => {
		expect(
			view({ choice: "date", until: "2027-01-05" }, FUTURE).body,
		).toBeNull();
		expect(
			view({ choice: "date", until: "2027-01-05" }, INFORCE).body,
		).toBeNull();
	});
});

test("the dialog's words (BR-F05-43)", () => {
	expect(PAUSE_TEXT.title("Netflix")).toBe("Pause Netflix");
	expect(PAUSE_TEXT.notNow).toBe("Not now");
	expect(PAUSE_TEXT.still("Netflix")).toBe(
		"Netflix still counts in your monthly cost while it's paused. Paused charges are left out of the next 30 days.",
	);
});
