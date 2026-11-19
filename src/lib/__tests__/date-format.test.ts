import { afterEach, describe, expect, test, vi } from "vitest";

import {
	formatDateYear,
	formatDayHeader,
	formatDayMonth,
	formatFullDay,
	formatMonth,
	formatShortDate,
	formatTime,
	formatWeekday,
	formatYear,
} from "../date-format";

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

describe("formatFullDay (BR-F03-72)", () => {
	test("always adds the year, also in the current one, in the locale's own pattern", () => {
		expect(formatFullDay("2026-10-19", IN)).toBe("Mon, 19 Oct, 2026");
		expect(formatFullDay("2025-10-31", IN)).toBe("Fri, 31 Oct, 2025");
	});

	test("order and words follow the date locale", () => {
		expect(formatFullDay("2026-10-19", { dateLocale: "en-US" })).toBe(
			"Mon, Oct 19, 2026",
		);
		expect(formatFullDay("2026-10-19", { dateLocale: "de-DE" })).toBe(
			"Mo., 19. Okt. 2026",
		);
	});

	test("no time zone moves the day", () => {
		expect(formatFullDay("2026-11-01", { dateLocale: "en-IN" })).toBe(
			"Sun, 1 Nov, 2026",
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

describe("formatMonth (BR-F02-19)", () => {
	const IN_LOCALE = { dateLocale: "en-IN" };

	test("each style for October 2026 in en-IN", () => {
		expect(formatMonth("2026-10", IN_LOCALE)).toBe("October 2026");
		expect(formatMonth("2026-10", IN_LOCALE, "long")).toBe("October 2026");
		expect(formatMonth("2026-10", IN_LOCALE, "short")).toBe("Oct 2026");
		expect(formatMonth("2026-10", IN_LOCALE, "name")).toBe("October");
		expect(formatMonth("2026-10", IN_LOCALE, "shortName")).toBe("Oct");
	});

	test("the locale's own words: en-IN shortens September to Sept, en-US to Sep", () => {
		expect(formatMonth("2026-09", IN_LOCALE, "short")).toBe("Sept 2026");
		expect(formatMonth("2026-09", { dateLocale: "en-US" }, "short")).toBe(
			"Sep 2026",
		);
	});

	test("other locales order and name the parts their own way", () => {
		expect(formatMonth("2026-10", { dateLocale: "de-DE" })).toBe("Oktober 2026");
		expect(formatMonth("2026-10", { dateLocale: "ja-JP" })).toBe("2026年10月");
	});

	test.each([
		["2026-01", "January 2026"],
		["2026-12", "December 2026"],
		["2023-11", "November 2023"],
		["2027-11", "November 2027"],
	])("%s reads %s", (month, text) => {
		expect(formatMonth(month, IN_LOCALE)).toBe(text);
	});

	test.each(["America/Los_Angeles", "Pacific/Kiritimati", "UTC"])(
		"no device zone moves a month, here %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatMonth("2026-01", IN_LOCALE)).toBe("January 2026");
			expect(formatMonth("2026-12", IN_LOCALE)).toBe("December 2026");
		},
	);
});

describe("formatYear", () => {
	test("in the locale's own way", () => {
		expect(formatYear(2026, { dateLocale: "en-IN" })).toBe("2026");
		expect(formatYear(2026, { dateLocale: "ja-JP" })).toBe("2026年");
	});

	test("a year with fewer than four digits keeps its own number", () => {
		expect(formatYear(999, { dateLocale: "en-IN" })).toBe("999");
	});
});

describe("formatDateYear (BR-F05-22)", () => {
	test("always writes the year, with no weekday", () => {
		expect(formatDateYear("2026-09-30", IN)).toBe("30 Sept 2026");
		expect(formatDateYear("2026-12-31", IN)).toBe("31 Dec 2026");
		expect(formatDateYear("2027-10-12", IN)).toBe("12 Oct 2027");
	});

	test("the year does not depend on today, unlike the short date", () => {
		expect(formatDateYear("2026-10-06", { dateLocale: "en-IN" })).toBe(
			"6 Oct 2026",
		);
	});

	test.each([
		["en-US", "Sep 30, 2026"],
		["en-GB", "30 Sept 2026"],
		["de-DE", "30. Sept. 2026"],
		["ja-JP", "2026年9月30日"],
	])("follows the locale: %s", (dateLocale, expected) => {
		expect(formatDateYear("2026-09-30", { dateLocale })).toBe(expected);
	});

	test.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"])(
		"never moves in a device zone such as %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatDateYear("2026-03-08", IN)).toBe("8 Mar 2026");
			expect(formatDateYear("2026-11-01", IN)).toBe("1 Nov 2026");
		},
	);

	test("a leap day formats", () => {
		expect(formatDateYear("2028-02-29", IN)).toBe("29 Feb 2028");
	});
});

describe("formatDayMonth (BR-F05-24)", () => {
	test("writes the day and month and never a year", () => {
		expect(formatDayMonth("2026-10-12", IN)).toBe("12 Oct");
		expect(formatDayMonth("2027-10-12", IN)).toBe("12 Oct");
		expect(formatDayMonth("2028-02-29", IN)).toBe("29 Feb");
	});

	test.each([
		["en-US", "Oct 12"],
		["de-DE", "12. Okt."],
		["ja-JP", "10月12日"],
	])("follows the locale: %s", (dateLocale, expected) => {
		expect(formatDayMonth("2026-10-12", { dateLocale })).toBe(expected);
	});

	test.each(["Pacific/Kiritimati", "America/New_York"])(
		"never moves in a device zone such as %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatDayMonth("2026-03-08", IN)).toBe("8 Mar");
		},
	);
});

describe("formatWeekday", () => {
	// 5 November 2026 is a Thursday.
	test("writes the weekday's name in full, or short", () => {
		expect(formatWeekday("2026-11-05", IN)).toBe("Thursday");
		expect(formatWeekday("2026-11-05", IN, "long")).toBe("Thursday");
		expect(formatWeekday("2026-11-05", IN, "short")).toBe("Thu");
	});

	test.each([
		["2026-11-01", "Sunday"],
		["2026-11-02", "Monday"],
		["2026-11-07", "Saturday"],
		["2028-02-29", "Tuesday"],
	])("%s is %s", (date, expected) => {
		expect(formatWeekday(date, IN)).toBe(expected);
	});

	test("follows the locale", () => {
		expect(formatWeekday("2026-11-05", { dateLocale: "de-DE" })).toBe(
			"Donnerstag",
		);
		expect(formatWeekday("2026-11-05", { dateLocale: "de-DE" }, "short")).toBe(
			"Do",
		);
		expect(formatWeekday("2026-11-05", { dateLocale: "ja-JP" })).toBe("木曜日");
	});

	test.each(["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/New_York"])(
		"never moves to the day before or after in a device zone such as %s",
		(zone) => {
			vi.stubEnv("TZ", zone);
			expect(formatWeekday("2026-11-05", IN)).toBe("Thursday");
			expect(formatWeekday("2026-11-01", IN)).toBe("Sunday");
		},
	);
});
