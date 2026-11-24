import { describe, expect, test } from "vitest";

import type { Cadence } from "@/lib/subscriptions/schedule";
import {
	amountWithCadence,
	cadenceLabel,
	cadenceWords,
	chargesCaption,
	dayWithWeekday,
	type Formats,
	money,
	monthlyHint,
	ordinal,
	phoneDateLine,
	relativeDay,
	rowBadges,
	rowDate,
	scheduleText,
	shortDate,
} from "../labels";
import { subscriptionItem } from "./fixtures";

// The golden profile at the golden clock: Asha in Kolkata on 2 November 2026.
const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

const week = (every: number): Cadence => ({ unit: "week", every });
const month = (every: number): Cadence => ({ unit: "month", every });

describe("money (BR-F05-49)", () => {
	test("writes the amount in the profile's format with the currency's symbol", () => {
		expect(money(64900, F)).toBe("₹649.00");
		expect(money(1800000, F)).toBe("₹18,000.00");
		expect(money(24328700, F)).toBe("₹2,43,287.00");
		expect(money(2027392, F)).toBe("₹20,273.92");
		expect(money(0, F)).toBe("₹0.00");
	});

	test("follows the currency and number locale", () => {
		expect(money(64900, { ...F, currency: "USD", numberLocale: "en-US" })).toBe(
			"$649.00",
		);
		expect(money(120000, { ...F, currency: "JPY", numberLocale: "ja-JP" })).toBe(
			"￥120,000",
		);
		expect(
			money(1234567, { ...F, currency: "KWD", numberLocale: "en-US" }),
		).toBe("KWD\u00A01,234.567");
	});
});

describe("shortDate and dayWithWeekday (BR-F05-22, D-618)", () => {
	test("a date in the current year has a weekday only when asked", () => {
		expect(shortDate("2026-11-05", F)).toBe("5 Nov");
		expect(dayWithWeekday("2026-11-05", F)).toBe("Thu, 5 Nov");
		expect(dayWithWeekday("2026-12-01", F)).toBe("Tue, 1 Dec");
	});

	test("another year reads with its year and no weekday", () => {
		expect(dayWithWeekday("2027-10-12", F)).toBe("12 Oct 2027");
		expect(dayWithWeekday("2025-09-30", F)).toBe("30 Sept 2025");
		expect(shortDate("2027-10-12", F)).toBe("12 Oct 2027");
	});

	test("the current year is the profile's today, not the device's", () => {
		expect(dayWithWeekday("2027-01-05", { ...F, today: "2027-01-01" })).toBe(
			"Tue, 5 Jan",
		);
		expect(dayWithWeekday("2026-12-31", { ...F, today: "2027-01-01" })).toBe(
			"31 Dec 2026",
		);
	});

	test.each([
		["en-US", "Thu, Nov 5"],
		["en-GB", "Thu 5 Nov"],
		["de-DE", "Do., 5. Nov."],
	])("follows the date locale: %s writes %s", (dateLocale, expected) => {
		expect(dayWithWeekday("2026-11-05", { ...F, dateLocale })).toBe(expected);
	});
});

describe("relativeDay (BR-F05-22, D-619)", () => {
	const from = (date: string, today = "2026-11-02") => relativeDay(date, today);

	test("today and tomorrow", () => {
		expect(from("2026-11-02")).toBe("today");
		expect(from("2026-11-03")).toBe("tomorrow");
	});

	// AC-F05-34: golden's four next due dates.
	test.each([
		["2026-11-05", "in 3 days"],
		["2026-11-10", "in 8 days"],
		["2026-12-01", "in 29 days"],
		["2027-10-12", "in 11 months"],
	])("golden %s reads %s", (date, expected) => {
		expect(from(date)).toBe(expected);
	});

	test("counts days up to 45, and months from 46", () => {
		expect(from("2026-11-04")).toBe("in 2 days");
		expect(from("2026-12-17")).toBe("in 45 days");
		expect(from("2026-12-18")).toBe("in 2 months");
	});

	test.each([
		[60, "in 2 months"],
		[75, "in 2 months"],
		[77, "in 3 months"],
		[120, "in 4 months"],
		[200, "in 7 months"],
		[350, "in 11 months"],
	])("%i days is %s (days ÷ 30.44, rounded)", (days, expected) => {
		const date = new Date(Date.UTC(2026, 10, 2 + days))
			.toISOString()
			.slice(0, 10);
		expect(from(date)).toBe(expected);
	});

	test("from 12 months it is a year, however far", () => {
		expect(from("2027-10-28")).toBe("in a year"); // 360 days
		expect(from("2028-11-02")).toBe("in a year");
		expect(from("2036-11-02")).toBe("in a year");
	});

	test("crosses a year end and a leap day", () => {
		expect(relativeDay("2027-01-02", "2026-12-30")).toBe("in 3 days");
		expect(relativeDay("2028-03-01", "2028-02-28")).toBe("in 2 days");
		expect(relativeDay("2027-03-01", "2027-02-28")).toBe("tomorrow");
	});

	// D-619: the page stayed open past midnight.
	test("a date that has passed reads yesterday, or N days ago", () => {
		expect(from("2026-11-01")).toBe("yesterday");
		expect(from("2026-10-31")).toBe("2 days ago");
		expect(from("2026-10-03")).toBe("30 days ago");
		expect(from("2025-11-02")).toBe("365 days ago");
	});
});

describe("cadenceWords (BR-F05-22)", () => {
	test.each([
		[week(1), "a week"],
		[week(2), "every 2 weeks"],
		[week(3), "every 3 weeks"],
		[week(52), "every 52 weeks"],
		[month(1), "a month"],
		[month(2), "every 2 months"],
		[month(3), "every 3 months"],
		[month(7), "every 7 months"],
		[month(12), "a year"],
		[month(24), "every 24 months"],
	])("%j reads %s", (cadence, expected) => {
		expect(cadenceWords(cadence)).toBe(expected);
	});
});

describe("cadenceLabel (BR-F05-24)", () => {
	test.each([
		[week(1), "Weekly"],
		[month(1), "Monthly"],
		[month(3), "Every 3 months"],
		[month(12), "Yearly"],
	])("the preset %j is %s", (cadence, expected) => {
		expect(cadenceLabel(cadence)).toBe(expected);
	});

	test.each([
		[week(2), "Every 2 weeks"],
		[week(52), "Every 52 weeks"],
		[month(2), "Every 2 months"],
		[month(7), "Every 7 months"],
		[month(24), "Every 24 months"],
	])("the custom %j is %s", (cadence, expected) => {
		expect(cadenceLabel(cadence)).toBe(expected);
	});
});

describe("amountWithCadence and monthlyHint (BR-F05-22)", () => {
	const row = (amountMinor: number, cadence: Cadence, monthlyMinor: number) => ({
		amountMinor,
		cadence,
		monthlyMinor,
	});

	// AC-F05-34
	test("golden's amounts", () => {
		expect(amountWithCadence(subscriptionItem("netflix"), F)).toBe(
			"₹649.00 a month",
		);
		expect(amountWithCadence(subscriptionItem("cultGym"), F)).toBe(
			"₹1,500.00 a month",
		);
		expect(amountWithCadence(subscriptionItem("sunrise"), F)).toBe(
			"₹18,000.00 a month",
		);
		expect(amountWithCadence(subscriptionItem("amazonPrime"), F)).toBe(
			"₹1,499.00 a year",
		);
	});

	test("the spec's other cadences", () => {
		expect(amountWithCadence(row(12000, week(1), 52000), F)).toBe(
			"₹120.00 a week",
		);
		expect(amountWithCadence(row(24000, week(2), 52000), F)).toBe(
			"₹240.00 every 2 weeks",
		);
		expect(amountWithCadence(row(620000, month(3), 206667), F)).toBe(
			"₹6,200.00 every 3 months",
		);
	});

	test("a monthly Subscription has no monthly hint, since its amount is the month's", () => {
		expect(monthlyHint(subscriptionItem("netflix"), F)).toBeNull();
		expect(monthlyHint(row(100, month(1), 100), F)).toBeNull();
	});

	// AC-F05-34: only Amazon Prime has one.
	test("every other cadence has one, from the monthly equivalent", () => {
		expect(monthlyHint(subscriptionItem("amazonPrime"), F)).toBe(
			"≈ ₹124.92 a month",
		);
		expect(monthlyHint(row(12000, week(1), 52000), F)).toBe("≈ ₹520.00 a month");
		// AC-F05-17: 120.00 every 2 weeks is 260.00 a month.
		expect(monthlyHint(row(12000, week(2), 26000), F)).toBe("≈ ₹260.00 a month");
		// 1,000.00 every 7 months is 142.86 a month.
		expect(monthlyHint(row(100000, month(7), 14286), F)).toBe(
			"≈ ₹142.86 a month",
		);
		expect(monthlyHint(row(620000, month(3), 206667), F)).toBe(
			"≈ ₹2,066.67 a month",
		);
	});

	test("a custom cadence equal to a monthly one is monthly", () => {
		expect(
			monthlyHint(row(100, { unit: "month", every: 1 }, 100), F),
		).toBeNull();
	});
});

describe("rowDate (BR-F05-22)", () => {
	const item = subscriptionItem;

	// AC-F05-34
	test("an active row reads its next due date over how far off it is", () => {
		expect(rowDate(item("netflix"), F)).toEqual({
			top: "Thu, 5 Nov",
			sub: "in 3 days",
		});
		expect(rowDate(item("cultGym"), F)).toEqual({
			top: "Tue, 10 Nov",
			sub: "in 8 days",
		});
		expect(rowDate(item("sunrise"), F)).toEqual({
			top: "Tue, 1 Dec",
			sub: "in 29 days",
		});
		expect(rowDate(item("amazonPrime"), F)).toEqual({
			top: "12 Oct 2027",
			sub: "in 11 months",
		});
	});

	test("a Subscription due today reads today, and one due tomorrow tomorrow", () => {
		expect(rowDate(item("netflix", { nextDueOn: "2026-11-02" }), F).sub).toBe(
			"today",
		);
		expect(rowDate(item("netflix", { nextDueOn: "2026-11-03" }), F).sub).toBe(
			"tomorrow",
		);
	});

	test("a paused row reads resumes under the date it resumes on", () => {
		expect(
			rowDate(
				item("netflix", { status: "paused", nextDueOn: "2027-01-05" }),
				F,
			),
		).toEqual({ top: "5 Jan 2027", sub: "resumes" });
		expect(
			rowDate(
				item("netflix", { status: "paused", nextDueOn: "2026-12-05" }),
				F,
			),
		).toEqual({ top: "Sat, 5 Dec", sub: "resumes" });
	});

	test("an upcoming and an ending row read like an active one", () => {
		expect(
			rowDate(
				item("netflix", { status: "upcoming", nextDueOn: "2026-12-05" }),
				F,
			),
		).toEqual({ top: "Sat, 5 Dec", sub: "in 33 days" });
		expect(
			rowDate(item("netflix", { status: "ending", endDate: "2026-12-31" }), F),
		).toEqual({ top: "Thu, 5 Nov", sub: "in 3 days" });
	});

	test("an ended row reads Ended over its end date, with the year", () => {
		expect(
			rowDate(
				item("netflix", {
					status: "ended",
					endDate: "2026-09-30",
					nextDueOn: null,
				}),
				F,
			),
		).toEqual({ top: "Ended", sub: "30 Sept 2026" });
		expect(
			rowDate(
				item("netflix", {
					status: "ended",
					endDate: "2025-03-01",
					nextDueOn: null,
				}),
				F,
			),
		).toEqual({ top: "Ended", sub: "1 Mar 2025" });
	});

	test("an ended row never shows a next due date, whatever it holds", () => {
		expect(
			rowDate(item("netflix", { status: "ended", endDate: "2026-11-02" }), F)
				.top,
		).toBe("Ended");
	});

	test("an ended row with no end date has nothing under Ended", () => {
		expect(
			rowDate(
				item("netflix", { status: "ended", endDate: null, nextDueOn: null }),
				F,
			),
		).toEqual({ top: "Ended", sub: "" });
	});

	test("a row with no next due reads No more charges over when it ends", () => {
		expect(
			rowDate(
				item("netflix", {
					status: "ending",
					endDate: "2026-12-31",
					nextDueOn: null,
				}),
				F,
			),
		).toEqual({ top: "No more charges", sub: "Ends 31 Dec" });
		expect(
			rowDate(
				item("netflix", {
					status: "ending",
					endDate: "2027-12-31",
					nextDueOn: null,
				}),
				F,
			),
		).toEqual({ top: "No more charges", sub: "Ends 31 Dec 2027" });
	});

	test("a row with no next due and no end date has nothing under it", () => {
		expect(rowDate(item("netflix", { nextDueOn: null }), F)).toEqual({
			top: "No more charges",
			sub: "",
		});
	});

	// D-619
	test("a due date that has passed reads yesterday", () => {
		expect(rowDate(item("netflix", { nextDueOn: "2026-11-01" }), F)).toEqual({
			top: "Sun, 1 Nov",
			sub: "yesterday",
		});
	});

	test("the weekday follows the date locale", () => {
		expect(rowDate(item("netflix"), { ...F, dateLocale: "en-US" }).top).toBe(
			"Thu, Nov 5",
		);
	});
});

describe("phoneDateLine (BR-F05-22)", () => {
	const item = subscriptionItem;

	test("the next due date under the amount, with its weekday in the current year", () => {
		expect(phoneDateLine(item("netflix"), F)).toBe("Thu, 5 Nov");
		expect(phoneDateLine(item("amazonPrime"), F)).toBe("12 Oct 2027");
	});

	test("an ended row reads Ended and its end date", () => {
		expect(
			phoneDateLine(
				item("netflix", {
					status: "ended",
					endDate: "2026-09-30",
					nextDueOn: null,
				}),
				F,
			),
		).toBe("Ended 30 Sept");
		expect(
			phoneDateLine(
				item("netflix", {
					status: "ended",
					endDate: "2025-09-30",
					nextDueOn: null,
				}),
				F,
			),
		).toBe("Ended 30 Sept 2025");
	});

	test("a row with no next due shows nothing", () => {
		expect(phoneDateLine(item("netflix", { nextDueOn: null }), F)).toBe("");
		expect(
			phoneDateLine(
				item("netflix", { status: "ended", endDate: null, nextDueOn: null }),
				F,
			),
		).toBe("");
	});
});

describe("rowBadges (BR-F05-22)", () => {
	const item = subscriptionItem;

	test("an active or ended row has none", () => {
		expect(rowBadges(item("netflix"), F)).toEqual([]);
		expect(
			rowBadges(
				item("netflix", { status: "ended", endDate: "2026-09-30" }),
				F,
			),
		).toEqual([]);
	});

	test("an upcoming row reads Starts and its start date", () => {
		expect(
			rowBadges(
				item("netflix", { status: "upcoming", startDate: "2026-12-05" }),
				F,
			),
		).toEqual([{ kind: "starts", text: "Starts 5 Dec" }]);
		expect(
			rowBadges(
				item("netflix", { status: "upcoming", startDate: "2027-01-05" }),
				F,
			),
		).toEqual([{ kind: "starts", text: "Starts 5 Jan 2027" }]);
	});

	test("an ending row reads Ends and its end date, with the year", () => {
		expect(
			rowBadges(
				item("netflix", { status: "ending", endDate: "2026-12-31" }),
				F,
			),
		).toEqual([{ kind: "ends", text: "Ends 31 Dec 2026" }]);
	});

	test("an ending row with no end date has none", () => {
		expect(
			rowBadges(item("netflix", { status: "ending", endDate: null }), F),
		).toEqual([]);
	});

	test("a paused row reads Paused until its next due date", () => {
		expect(
			rowBadges(
				item("netflix", { status: "paused", nextDueOn: "2027-01-05" }),
				F,
			),
		).toEqual([{ kind: "paused", text: "Paused until 5 Jan 2027" }]);
		expect(
			rowBadges(
				item("netflix", { status: "paused", nextDueOn: "2026-12-05" }),
				F,
			),
		).toEqual([{ kind: "paused", text: "Paused until 5 Dec" }]);
	});

	test("a paused row with no next due, as when its end date falls inside the pause, reads Paused", () => {
		expect(
			rowBadges(item("netflix", { status: "paused", nextDueOn: null }), F),
		).toEqual([{ kind: "paused", text: "Paused" }]);
	});

	test("the dates follow the locale", () => {
		expect(
			rowBadges(
				item("netflix", { status: "upcoming", startDate: "2026-12-05" }),
				{
					...F,
					dateLocale: "en-US",
				},
			),
		).toEqual([{ kind: "starts", text: "Starts Dec 5" }]);
	});
});

describe("chargesCaption (BR-F05-22)", () => {
	test("is left out for none or one charge", () => {
		expect(chargesCaption(0, 0, F)).toBeNull();
		expect(chargesCaption(1, 64900, F)).toBeNull();
	});

	// AC-F05-34
	test("names the count and the sum for more than one", () => {
		expect(chargesCaption(2, 24000, F)).toBe(
			"2 charges in the next 30 days, ₹240.00",
		);
		expect(chargesCaption(5, 60000, F)).toBe(
			"5 charges in the next 30 days, ₹600.00",
		);
	});
});

describe("ordinal", () => {
	test.each([
		[1, "1st"],
		[2, "2nd"],
		[3, "3rd"],
		[4, "4th"],
		[5, "5th"],
		[10, "10th"],
		[11, "11th"],
		[12, "12th"],
		[13, "13th"],
		[14, "14th"],
		[21, "21st"],
		[22, "22nd"],
		[23, "23rd"],
		[24, "24th"],
		[29, "29th"],
		[30, "30th"],
		[31, "31st"],
	])("%i is %s", (day, expected) => {
		expect(ordinal(day)).toBe(expected);
	});
});

describe("scheduleText (BR-F05-24)", () => {
	const text = (startDate: string, cadence: Cadence, f: Formats = F) =>
		scheduleText({ startDate, cadence }, f);

	// 5 November 2026 is a Thursday.
	test("weekly names the weekday", () => {
		expect(text("2026-11-05", week(1))).toBe("Every Thursday");
		expect(text("2026-11-01", week(1))).toBe("Every Sunday");
	});

	test("every few weeks names the weekday too", () => {
		expect(text("2026-11-05", week(2))).toBe("Every 2 weeks on Thursday");
		expect(text("2026-11-01", week(52))).toBe("Every 52 weeks on Sunday");
	});

	test("monthly names the day of the month", () => {
		expect(text("2026-09-05", month(1))).toBe("Every month on the 5th");
		expect(text("2026-09-01", month(1))).toBe("Every month on the 1st");
		expect(text("2026-09-22", month(1))).toBe("Every month on the 22nd");
		expect(text("2026-09-23", month(1))).toBe("Every month on the 23rd");
		expect(text("2026-09-11", month(1))).toBe("Every month on the 11th");
	});

	test("every few months says how many", () => {
		expect(text("2026-09-05", month(2))).toBe("Every 2 months on the 5th");
		expect(text("2026-09-05", month(7))).toBe("Every 7 months on the 5th");
	});

	test("a start on the 29th to the 31st adds the clamp words", () => {
		expect(text("2026-01-29", month(1))).toBe(
			"Every month on the 29th, or the last day in shorter months",
		);
		expect(text("2026-01-30", month(1))).toBe(
			"Every month on the 30th, or the last day in shorter months",
		);
		expect(text("2026-01-31", month(1))).toBe(
			"Every month on the 31st, or the last day in shorter months",
		);
	});

	test("the day before the clamp range adds none", () => {
		expect(text("2026-01-28", month(1))).toBe("Every month on the 28th");
	});

	test("the clamp words follow a quarterly or custom start on the 30th", () => {
		expect(text("2026-01-30", month(3))).toBe(
			"Every 3 months on the 30th, or the last day in shorter months",
		);
		expect(text("2026-03-31", month(7))).toBe(
			"Every 7 months on the 31st, or the last day in shorter months",
		);
		expect(text("2028-02-29", month(6))).toBe(
			"Every 6 months on the 29th, or the last day in shorter months",
		);
	});

	describe("yearly", () => {
		test("names the day and month", () => {
			expect(text("2026-10-12", month(12))).toBe("Every year on 12 Oct");
		});

		test("a 29 February start adds the leap words", () => {
			expect(text("2028-02-29", month(12))).toBe(
				"Every year on 29 Feb, or 28 Feb in other years",
			);
		});

		test("a start on the 31st of a long month needs no clamp, since the month never changes", () => {
			expect(text("2026-12-31", month(12))).toBe("Every year on 31 Dec");
			expect(text("2026-01-30", month(12))).toBe("Every year on 30 Jan");
		});
	});

	describe("a multiple of 12 months other than 12", () => {
		test("a 29 February start adds the leap words", () => {
			expect(text("2028-02-29", month(24))).toBe(
				"Every 24 months on the 29th, or 28 Feb in other years",
			);
			expect(text("2028-02-29", month(36))).toBe(
				"Every 36 months on the 29th, or 28 Feb in other years",
			);
		});

		test("any other start needs no clamp", () => {
			expect(text("2026-01-31", month(24))).toBe(
				"Every 24 months on the 31st",
			);
			expect(text("2026-09-05", month(24))).toBe("Every 24 months on the 5th");
		});
	});

	// AC-F05-34: golden's schedules.
	test("golden's Subscriptions", () => {
		expect(text("2026-09-05", month(1))).toBe("Every month on the 5th");
		expect(text("2026-09-01", month(1))).toBe("Every month on the 1st");
		expect(text("2026-09-10", month(1))).toBe("Every month on the 10th");
		expect(text("2026-10-12", month(12))).toBe("Every year on 12 Oct");
	});

	test("weekday and date words follow the date locale (D-618)", () => {
		const us = { ...F, dateLocale: "en-US" };
		expect(text("2026-11-05", week(1), us)).toBe("Every Thursday");
		expect(text("2026-10-12", month(12), us)).toBe("Every year on Oct 12");
		expect(text("2028-02-29", month(12), us)).toBe(
			"Every year on Feb 29, or Feb 28 in other years",
		);
		expect(text("2026-11-05", week(2), { ...F, dateLocale: "de-DE" })).toBe(
			"Every 2 weeks on Donnerstag",
		);
	});
});
