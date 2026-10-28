import { afterEach, describe, expect, test } from "vitest";

import { localTime, toOccurred } from "@/lib/transactions/occurred";

const KOLKATA = "Asia/Kolkata";
const NEW_YORK = "America/New_York";
const MACHINE_ZONE = process.env["TZ"];

afterEach(() => {
	if (MACHINE_ZONE === undefined) delete process.env["TZ"];
	else process.env["TZ"] = MACHINE_ZONE;
});

describe("toOccurred (BR-F03-06)", () => {
	// golden: Transactions #2, #24, #25, #26 and the charge #1 (00:00 local, TIME-6).
	test.each([
		["2026-09-01", "10:15", "2026-09-01T04:45:00Z"],
		["2026-10-19", "22:15", "2026-10-19T16:45:00Z"],
		["2026-10-31", "23:50", "2026-10-31T18:20:00Z"],
		["2026-11-01", "00:30", "2026-10-31T19:00:00Z"],
		["2026-09-01", "00:00", "2026-08-31T18:30:00Z"],
	])("in Kolkata, %s at %s is %s", (date, time, occurredAt) => {
		expect(toOccurred(date, time, KOLKATA)).toEqual({
			occurredAt,
			occurredOn: date,
		});
	});

	test("keeps the chosen date as occurredOn, even when the UTC date differs", () => {
		expect(toOccurred("2026-11-01", "00:30", KOLKATA).occurredOn).toBe(
			"2026-11-01",
		);
	});

	test("writes the instant in UTC with the seconds at zero", () => {
		expect(toOccurred("2026-11-02", "11:40", KOLKATA).occurredAt).toBe(
			"2026-11-02T06:10:00Z",
		);
	});

	test("takes the first and last minute of the day", () => {
		expect(toOccurred("2026-11-02", "00:00", "UTC").occurredAt).toBe(
			"2026-11-02T00:00:00Z",
		);
		expect(toOccurred("2026-11-02", "23:59", "UTC").occurredAt).toBe(
			"2026-11-02T23:59:00Z",
		);
	});

	// AC-F03-08
	describe("daylight saving (D-221)", () => {
		test("a time in the spring-forward gap moves forward by the gap: 02:30 becomes 03:30 EDT", () => {
			expect(toOccurred("2026-03-08", "02:30", NEW_YORK)).toEqual({
				occurredAt: "2026-03-08T07:30:00Z",
				occurredOn: "2026-03-08",
			});
		});

		test("a time that occurs twice takes the earlier instant, in EDT", () => {
			expect(toOccurred("2026-11-01", "01:30", NEW_YORK)).toEqual({
				occurredAt: "2026-11-01T05:30:00Z",
				occurredOn: "2026-11-01",
			});
		});

		test("the minutes around the gap stay where they are", () => {
			expect(toOccurred("2026-03-08", "01:59", NEW_YORK).occurredAt).toBe(
				"2026-03-08T06:59:00Z",
			);
			expect(toOccurred("2026-03-08", "03:00", NEW_YORK).occurredAt).toBe(
				"2026-03-08T07:00:00Z",
			);
		});

		test("the minutes around the repeated hour stay where they are", () => {
			expect(toOccurred("2026-11-01", "00:59", NEW_YORK).occurredAt).toBe(
				"2026-11-01T04:59:00Z",
			);
			expect(toOccurred("2026-11-01", "02:00", NEW_YORK).occurredAt).toBe(
				"2026-11-01T07:00:00Z",
			);
		});

		test("a 30-minute gap moves forward by 30 minutes, in Lord Howe", () => {
			expect(
				toOccurred("2026-10-04", "02:15", "Australia/Lord_Howe").occurredAt,
			).toBe("2026-10-03T15:45:00Z");
		});

		test("London's gap at 01:00 moves 01:30 to 02:30 BST", () => {
			expect(
				toOccurred("2026-03-29", "01:30", "Europe/London").occurredAt,
			).toBe("2026-03-29T01:30:00Z");
		});
	});

	// TIME-10: the machine's own zone never enters the result.
	test.each(["Pacific/Kiritimati", "America/Los_Angeles", "UTC"])(
		"gives the same instants when the machine runs in %s",
		(zone) => {
			process.env["TZ"] = zone;
			expect(toOccurred("2026-11-01", "00:30", KOLKATA).occurredAt).toBe(
				"2026-10-31T19:00:00Z",
			);
			expect(toOccurred("2026-03-08", "02:30", NEW_YORK).occurredAt).toBe(
				"2026-03-08T07:30:00Z",
			);
		},
	);

	test.each([
		["2026-02-30", "10:00", KOLKATA, "a date that does not exist"],
		["2026-1-01", "10:00", KOLKATA, "a malformed date"],
		["2026-11-02", "24:00", KOLKATA, "hour 24"],
		["2026-11-02", "10:60", KOLKATA, "minute 60"],
		["2026-11-02", "9:05", KOLKATA, "a one-digit hour"],
		["2026-11-02", "10:05:30", KOLKATA, "seconds"],
	])("refuses %s at %s in %s: %s", (date, time, zone) => {
		expect(() => toOccurred(date, time, zone)).toThrow(RangeError);
	});
});

test("toOccurred names an unknown time zone in its error", () => {
	expect(() => toOccurred("2026-11-02", "10:00", "Mars/Olympus")).toThrow(
		"Unknown time zone: Mars/Olympus.",
	);
});

describe("localTime (BR-F03-11, D-238)", () => {
	test("shows an instant as hours and minutes in the profile zone", () => {
		expect(localTime("2026-10-31T19:00:00Z", KOLKATA)).toBe("00:30");
		expect(localTime("2026-08-31T18:30:00Z", KOLKATA)).toBe("00:00");
	});

	// AC-F03-32: after golden moves to Los Angeles, row 26 reads 12:00 pm.
	test("row 26 reads 12:00 in Los Angeles", () => {
		expect(localTime("2026-10-31T19:00:00Z", "America/Los_Angeles")).toBe(
			"12:00",
		);
	});

	test("both instants of a repeated hour read the same local time", () => {
		expect(localTime("2026-11-01T05:30:00Z", NEW_YORK)).toBe("01:30");
		expect(localTime("2026-11-01T06:30:00Z", NEW_YORK)).toBe("01:30");
	});

	test("reads back the time toOccurred took, outside a gap", () => {
		for (const time of ["00:00", "06:45", "12:00", "18:29", "23:59"]) {
			expect(
				localTime(
					toOccurred("2026-11-02", time, KOLKATA).occurredAt,
					KOLKATA,
				),
			).toBe(time);
		}
	});

	test("refuses an instant that is not one", () => {
		expect(() => localTime("yesterday", KOLKATA)).toThrow(RangeError);
	});
});
