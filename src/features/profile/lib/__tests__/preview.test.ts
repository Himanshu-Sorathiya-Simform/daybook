import { describe, expect, test } from "vitest";

import { type PreviewChoices, previewOf } from "../preview";

// Monday 2 Nov 2026, 12:00 in India (TST-3's golden clock).
const NOW = new Date("2026-11-02T06:30:00.000Z");

const INDIA: PreviewChoices = {
	country: "IN",
	currency: "INR",
	timezone: "Asia/Kolkata",
	weekStart: "sunday",
};

const days = (choices: PreviewChoices, now = NOW) =>
	previewOf(choices, now).week.map((day) => `${day.weekday} ${day.day}`);

// D-511
describe("previewOf: amounts (MON-4, BR-F02-18)", () => {
	test("India: 1,00,000 in lakh grouping, the symbol before, the paise after", () => {
		expect(previewOf(INDIA, NOW).amount).toEqual({
			text: "₹1,00,000.00",
			symbol: "₹",
			symbolAfter: false,
			spaced: false,
			integer: "1,00,000",
			fraction: ".00",
		});
	});

	test("a spending amount with the minus sign, and a percentage", () => {
		const preview = previewOf(INDIA, NOW);
		expect(preview.negative).toBe("−₹1,240.50");
		expect(preview.percent).toBe("63.3%");
	});

	test("Germany: the symbol after, spaced, with German separators", () => {
		const preview = previewOf({ ...INDIA, country: "DE", currency: "EUR" }, NOW);
		expect(preview.amount).toMatchObject({
			symbol: "€",
			symbolAfter: true,
			spaced: true,
			integer: "100.000",
			fraction: ",00",
		});
		// German writes a no-break space before the sign.
		expect(preview.negative).toBe("−1.240,50\u00a0€");
		expect(preview.percent).toBe("63,3\u00a0%");
	});

	test("yen has no decimals, so the spending amount is a whole −1,240", () => {
		// Japan's own format writes the full-width yen sign.
		const preview = previewOf({ ...INDIA, country: "JP", currency: "JPY" }, NOW);
		expect(preview.amount.text).toBe("￥100,000");
		expect(preview.amount.fraction).toBe("");
		expect(preview.negative).toBe("−￥1,240");
	});

	test("the dinar has three decimals", () => {
		const preview = previewOf({ ...INDIA, country: "KW", currency: "KWD" }, NOW);
		expect(preview.amount.fraction).toMatch(/\.000$/);
		expect(preview.negative).toMatch(/1,240\.500/);
	});

	test("the currency's own format follows the country, not the currency", () => {
		const preview = previewOf({ ...INDIA, currency: "USD" }, NOW);
		expect(preview.amount.text).toBe("$1,00,000.00");
	});
});

describe("previewOf: today and the week (BR-F02-19)", () => {
	test("today, the time and the zone in India", () => {
		const preview = previewOf(INDIA, NOW);
		expect(preview.day).toBe("Mon, 2 Nov");
		expect(preview.time).toBe("12:00 pm");
		expect(preview.zone).toBe("Kolkata time (GMT+05:30)");
	});

	test("today is the zone's date, not the machine's or UTC's", () => {
		// 20:00 UTC on 1 Nov is 01:30 on 2 Nov in India, and still 1 Nov in New York.
		const late = new Date("2026-11-01T20:00:00.000Z");
		expect(previewOf(INDIA, late).day).toBe("Mon, 2 Nov");
		const york = previewOf(
			{
				country: "US",
				currency: "USD",
				timezone: "America/New_York",
				weekStart: "sunday",
			},
			late,
		);
		expect(york.day).toBe("Sun, Nov 1");
		expect(york.time).toBe("3:00 PM");
		expect(york.zone).toBe("New York time (GMT-05:00)");
	});

	test("the week starts on the chosen day, and only today is marked", () => {
		expect(days(INDIA)).toEqual([
			"Sun 1",
			"Mon 2",
			"Tue 3",
			"Wed 4",
			"Thu 5",
			"Fri 6",
			"Sat 7",
		]);
		expect(days({ ...INDIA, weekStart: "monday" })[0]).toBe("Mon 2");
		expect(days({ ...INDIA, weekStart: "saturday" })).toEqual([
			"Sat 31",
			"Sun 1",
			"Mon 2",
			"Tue 3",
			"Wed 4",
			"Thu 5",
			"Fri 6",
		]);
		const marked = previewOf(INDIA, NOW).week.filter((day) => day.isToday);
		expect(marked.map((day) => day.date)).toEqual(["2026-11-02"]);
	});

	test("today on the week's first and last day", () => {
		const sunday = new Date("2026-11-01T06:30:00.000Z");
		const week = previewOf(INDIA, sunday).week;
		expect(week[0]).toMatchObject({ date: "2026-11-01", isToday: true });
		const saturday = new Date("2026-11-07T06:30:00.000Z");
		expect(previewOf(INDIA, saturday).week[6]).toMatchObject({
			date: "2026-11-07",
			isToday: true,
		});
	});

	test("a week across a month and a year end", () => {
		const newYear = new Date("2026-12-31T06:30:00.000Z");
		const week = previewOf({ ...INDIA, weekStart: "monday" }, newYear).week;
		expect(week.map((day) => day.date)).toEqual([
			"2026-12-28",
			"2026-12-29",
			"2026-12-30",
			"2026-12-31",
			"2027-01-01",
			"2027-01-02",
			"2027-01-03",
		]);
	});

	test("the offset is the one at that moment, after a daylight-saving change", () => {
		const summer = new Date("2026-07-01T12:00:00.000Z");
		const berlin = {
			country: "DE",
			currency: "EUR",
			timezone: "Europe/Berlin",
			weekStart: "monday",
		} as const;
		expect(previewOf(berlin, summer).zone).toBe("Berlin time (GMT+02:00)");
		expect(previewOf(berlin, NOW).zone).toBe("Berlin time (GMT+01:00)");
	});
});
