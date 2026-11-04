import { afterEach, describe, expect, test, vi } from "vitest";

import { formatDayHeader, formatShortDate, formatTime } from "../date-format";

const IN = { dateLocale: "en-IN", today: "2026-11-02" };

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("formatShortDate (BR-F02-19)", () => {
	test("a date in the current year has no year", () => {
		expect(formatShortDate("2026-10-06", IN)).toBe("6 Oct");
	});

	test("a date in another year adds the year", () => {
		expect(formatShortDate("2025-10-06", IN)).toBe("6 Oct 2025");
		expect(formatShortDate("2027-01-15", IN)).toBe("15 Jan 2027");
	});

	test("the current year comes from the profile's today, not the device clock", () => {
		expect(formatShortDate("2027-01-01", { ...IN, today: "2027-01-01" })).toBe(
			"1 Jan",
		);
		expect(formatShortDate("2026-12-31", { ...IN, today: "2027-01-01" })).toBe(
			"31 Dec 2026",
		);
	});

	test("day order follows the date locale", () => {
		expect(
			formatShortDate("2026-10-06", {
				dateLocale: "en-US",
				today: "2026-11-02",
			}),
		).toBe("Oct 6");
	});

	test.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"])(
		"the date never moves in a device zone such as %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatShortDate("2026-03-08", IN)).toBe("8 Mar");
			expect(formatShortDate("2026-11-01", IN)).toBe("1 Nov");
		},
	);

	test("the first and last days of a year keep their day", () => {
		expect(formatShortDate("2026-01-01", IN)).toBe("1 Jan");
		expect(formatShortDate("2026-12-31", IN)).toBe("31 Dec");
	});

	test("a leap day formats", () => {
		expect(formatShortDate("2028-02-29", { ...IN, today: "2028-03-01" })).toBe(
			"29 Feb",
		);
	});
});

describe("formatDayHeader (BR-F02-19)", () => {
	test("a day in the current year reads weekday, day and month", () => {
		expect(formatDayHeader("2026-10-31", IN)).toBe("Sat, 31 Oct");
		expect(formatDayHeader("2026-11-01", IN)).toBe("Sun, 1 Nov");
		expect(formatDayHeader("2026-10-01", IN)).toBe("Thu, 1 Oct");
	});

	test("a day in another year adds the year", () => {
		expect(formatDayHeader("2025-10-31", IN)).toBe("Fri, 31 Oct, 2025");
		expect(formatDayHeader("2027-01-01", IN)).toBe("Fri, 1 Jan, 2027");
	});

	test("the current year comes from the profile's today", () => {
		expect(formatDayHeader("2026-12-31", { ...IN, today: "2027-01-01" })).toBe(
			"Thu, 31 Dec, 2026",
		);
		expect(formatDayHeader("2027-01-01", { ...IN, today: "2027-01-01" })).toBe(
			"Fri, 1 Jan",
		);
	});

	test("order and words follow the date locale", () => {
		const today = "2026-11-02";
		expect(formatDayHeader("2026-10-31", { dateLocale: "en-US", today })).toBe(
			"Sat, Oct 31",
		);
		expect(formatDayHeader("2026-10-31", { dateLocale: "de-DE", today })).toBe(
			"Sa., 31. Okt.",
		);
	});

	test.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"])(
		"the weekday and day never move in a device zone such as %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatDayHeader("2026-03-08", IN)).toBe("Sun, 8 Mar");
			expect(formatDayHeader("2026-11-01", IN)).toBe("Sun, 1 Nov");
		},
	);

	test("a leap day keeps its date", () => {
		expect(formatDayHeader("2028-02-29", { ...IN, today: "2028-03-01" })).toBe(
			"Tue, 29 Feb",
		);
	});
});

describe("formatTime (BR-F02-19)", () => {
	const KOLKATA = { dateLocale: "en-IN", timezone: "Asia/Kolkata" };

	test("reads the instant in the profile zone, in the locale's hour cycle", () => {
		// Golden #25: 2026-10-31 23:50 in Kolkata.
		expect(formatTime("2026-10-31T18:20:00.000Z", KOLKATA)).toBe("11:50 pm");
		// Golden #26: 2026-11-01 00:30 in Kolkata, the day before in UTC.
		expect(formatTime("2026-10-31T19:00:00.000Z", KOLKATA)).toBe("12:30 am");
	});

	test("takes a Date too", () => {
		expect(formatTime(new Date("2026-11-02T06:30:00.000Z"), KOLKATA)).toBe(
			"12:00 pm",
		);
	});

	test("another zone gives another time for the same instant", () => {
		expect(
			formatTime("2026-10-31T18:20:00.000Z", {
				dateLocale: "en-IN",
				timezone: "America/Los_Angeles",
			}),
		).toBe("11:20 am");
	});

	test.each([
		["en-US", "11:50 PM"],
		["en-GB", "23:50"],
		["de-DE", "23:50"],
	])("%s writes %s", (dateLocale, time) => {
		expect(
			formatTime("2026-10-31T18:20:00.000Z", {
				dateLocale,
				timezone: "Asia/Kolkata",
			}),
		).toBe(time);
	});

	test.each(["Pacific/Kiritimati", "America/New_York"])(
		"never reads the device zone, here %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatTime("2026-10-31T18:20:00.000Z", KOLKATA)).toBe("11:50 pm");
		},
	);
});
