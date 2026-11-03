import { afterEach, describe, expect, test, vi } from "vitest";

import { formatShortDate } from "../date-format";

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
