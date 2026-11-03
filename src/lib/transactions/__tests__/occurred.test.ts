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

	// `Date.UTC(99, ...)` would mean 1999; the year is the one written.
	test.each([
		["0001-01-01", "12:00", "0001-01-01T12:00:00Z"],
		["0099-06-15", "10:30", "0099-06-15T10:30:00Z"],
		["0100-02-28", "23:59", "0100-02-28T23:59:00Z"],
	])("keeps a year under 100 as written: %s %s", (date, time, occurredAt) => {
		expect(toOccurred(date, time, "UTC").occurredAt).toBe(occurredAt);
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

	// B1, D-496: the result depends on the zone and the date, never on the machine's zone.
	// Each row is derived by hand from the zone's rule, with its instants written in UTC:
	// - an overlap shows a wall time twice; the earlier instant is the first, the earlier offset;
	// - a gap has no instant for its wall times; they take the offset from before the change, so
	//   the clock reads the gap's length later (D-221).
	describe.each(["UTC", "America/New_York", "Asia/Kolkata", "Pacific/Kiritimati"])(
		"with the machine in %s",
		(machine) => {
			test.each([
				// London: clocks go back 02:00 BST to 01:00 GMT at 01:00Z on 25 October.
				[
					"Europe/London",
					"2026-10-25",
					"00:59",
					"2026-10-24T23:59:00Z",
					"before the overlap",
				],
				[
					"Europe/London",
					"2026-10-25",
					"01:00",
					"2026-10-25T00:00:00Z",
					"first of the overlap",
				],
				[
					"Europe/London",
					"2026-10-25",
					"01:30",
					"2026-10-25T00:30:00Z",
					"the overlap, BST first",
				],
				[
					"Europe/London",
					"2026-10-25",
					"02:00",
					"2026-10-25T02:00:00Z",
					"after the overlap",
				],
				// London: clocks go forward 01:00 GMT to 02:00 BST at 01:00Z on 29 March.
				[
					"Europe/London",
					"2026-03-29",
					"00:59",
					"2026-03-29T00:59:00Z",
					"before the gap",
				],
				[
					"Europe/London",
					"2026-03-29",
					"01:00",
					"2026-03-29T01:00:00Z",
					"first of the gap",
				],
				[
					"Europe/London",
					"2026-03-29",
					"01:30",
					"2026-03-29T01:30:00Z",
					"the gap, 02:30 BST",
				],
				[
					"Europe/London",
					"2026-03-29",
					"02:00",
					"2026-03-29T01:00:00Z",
					"after the gap",
				],
				// Sydney: clocks go back 03:00 AEDT (+11) to 02:00 AEST (+10) on 5 April.
				[
					"Australia/Sydney",
					"2026-04-05",
					"01:59",
					"2026-04-04T14:59:00Z",
					"before the overlap",
				],
				[
					"Australia/Sydney",
					"2026-04-05",
					"02:30",
					"2026-04-04T15:30:00Z",
					"the overlap, AEDT first",
				],
				[
					"Australia/Sydney",
					"2026-04-05",
					"03:00",
					"2026-04-04T17:00:00Z",
					"after the overlap",
				],
				// Sydney: clocks go forward 02:00 AEST to 03:00 AEDT on 4 October.
				[
					"Australia/Sydney",
					"2026-10-04",
					"02:30",
					"2026-10-03T16:30:00Z",
					"the gap, 03:30 AEDT",
				],
				// Havana: clocks go forward at 00:00 to 01:00 on 8 March, and back at 01:00 to 00:00 on 1 November.
				[
					"America/Havana",
					"2026-03-08",
					"00:30",
					"2026-03-08T05:30:00Z",
					"the gap, 01:30 CDT",
				],
				[
					"America/Havana",
					"2026-03-08",
					"02:30",
					"2026-03-08T06:30:00Z",
					"after the gap",
				],
				[
					"America/Havana",
					"2026-11-01",
					"00:30",
					"2026-11-01T04:30:00Z",
					"the overlap, CDT first",
				],
				// Santiago: clocks go back at 24:00 to 23:00 on 4 April, and forward at 24:00 to 01:00 on 5 September.
				[
					"America/Santiago",
					"2026-04-04",
					"23:30",
					"2026-04-05T02:30:00Z",
					"the overlap, CLST first",
				],
				[
					"America/Santiago",
					"2026-09-06",
					"00:30",
					"2026-09-06T04:30:00Z",
					"the gap, 01:30 CLST",
				],
				// Lord Howe moves by 30 minutes: back 02:00 to 01:30 on 5 April, forward 02:00 to 02:30 on 4 October.
				[
					"Australia/Lord_Howe",
					"2026-04-05",
					"01:45",
					"2026-04-04T14:45:00Z",
					"the overlap, +11 first",
				],
				[
					"Australia/Lord_Howe",
					"2026-10-04",
					"02:15",
					"2026-10-03T15:45:00Z",
					"the gap, 02:45",
				],
				// Chatham, +12:45 and +13:45: back 03:45 to 02:45 on 5 April, forward 02:45 to 03:45 on 27 September.
				[
					"Pacific/Chatham",
					"2026-04-05",
					"03:15",
					"2026-04-04T13:30:00Z",
					"the overlap, +13:45 first",
				],
				[
					"Pacific/Chatham",
					"2026-09-27",
					"03:15",
					"2026-09-26T14:30:00Z",
					"the gap, 04:15",
				],
			])("%s %s %s is %s (%s)", (zone, date, time, expected) => {
				process.env["TZ"] = machine;
				expect(toOccurred(date, time, zone).occurredAt).toBe(expected);
			});
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

const formatters = new Map<string, Intl.DateTimeFormat>();

/** What a zone's wall clock reads at `instant`, as minutes since the epoch read as UTC. Written
 * with `Intl` alone, so it shares nothing with `toOccurred`. */
function wallMinutes(zone: string, instant: number): number {
	let formatter = formatters.get(zone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat("en-CA", {
			timeZone: zone,
			hourCycle: "h23",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
		formatters.set(zone, formatter);
	}
	const parts = formatter.formatToParts(new Date(instant));
	const part = (type: string) =>
		Number(parts.find((entry) => entry.type === type)?.value);
	return (
		Date.UTC(
			part("year"),
			part("month") - 1,
			part("day"),
			part("hour"),
			part("minute"),
		) / 60_000
	);
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const SWEEP_ZONES = [
	"Europe/London",
	"Europe/Dublin",
	"Africa/Casablanca",
	"Australia/Sydney",
	"Australia/Lord_Howe",
	"Pacific/Chatham",
	"America/Havana",
	"America/Santiago",
	"America/New_York",
];

/** The days of 2026 (as UTC midnights) after which `zone`'s offset differs. */
function changeDays(zone: string): number[] {
	const start = Date.UTC(2026, 0, 1);
	const offset = (instant: number) =>
		wallMinutes(zone, instant) - instant / MINUTE;
	const days: number[] = [];
	for (let day = 0; day < 365; day++) {
		const at = start + day * DAY;
		if (offset(at) !== offset(at + DAY)) days.push(at);
	}
	return days;
}

type SweepMinute = {
	date: string;
	time: string;
	expected: number;
	kind: "gap" | "overlap" | "plain";
};

const sweepCache = new Map<string, SweepMinute[]>();

/** The local minutes of the four days around each 2026 clock change in `zone`, each with the
 * instant `toOccurred` must give: the earliest instant whose wall clock shows the minute, or,
 * in a gap, the minute at the offset in force just before the change. It holds every minute
 * within 3 hours of a skipped or repeated time, where the answer can change, and every 15th
 * minute elsewhere, where the offset is constant. The expected instants are read from the zone's
 * wall clock at every minute, so they share no code with `toOccurred`, and are kept for the
 * three machine zones. */
function sweepMinutes(zone: string): SweepMinute[] {
	const cached = sweepCache.get(zone);
	if (cached) return cached;
	const minutes: SweepMinute[] = [];
	for (const change of changeDays(zone)) {
		// The instants of seven UTC days around the change, by their wall time: wider than the
		// wall days checked, so each wall minute finds its instants whatever the offset.
		const instants = new Map<number, number[]>();
		for (let at = change - 3 * DAY; at < change + 4 * DAY; at += MINUTE) {
			const wall = wallMinutes(zone, at);
			instants.set(wall, [...(instants.get(wall) ?? []), at]);
		}
		// The offset in force before the change, in minutes.
		const before = wallMinutes(zone, change - DAY) - (change - DAY) / MINUTE;
		const first = change / MINUTE - 1440;
		const kindOf = (wall: number) => {
			const count = instants.get(wall)?.length ?? 0;
			return (
				count === 0 ? "gap"
				: count > 1 ? "overlap"
				: "plain"
			);
		};
		const odd = new Set<number>();
		for (let wall = first; wall < first + 4 * 1440; wall++) {
			if (kindOf(wall) === "plain") continue;
			for (let near = wall - 180; near <= wall + 180; near++) odd.add(near);
		}
		for (let wall = first; wall < first + 4 * 1440; wall++) {
			if (!odd.has(wall) && (wall - first) % 15 !== 0) continue;
			const found = instants.get(wall);
			const when = new Date(wall * MINUTE).toISOString();
			minutes.push({
				date: when.slice(0, 10),
				time: when.slice(11, 16),
				expected: found ? Math.min(...found) : (wall - before) * MINUTE,
				kind: kindOf(wall),
			});
		}
	}
	sweepCache.set(zone, minutes);
	return minutes;
}

// B1, D-221, TIME-10: the minutes around each 2026 clock change, in nine zones, under three
// machine zones.
describe.each(["UTC", "America/New_York", "Asia/Kolkata"])(
	"the minutes around every clock change, with the machine in %s",
	(machine) => {
		test.each(SWEEP_ZONES)("%s", (zone) => {
			process.env["TZ"] = machine;
			const minutes = sweepMinutes(zone);
			// Each zone changed its clocks both ways, so the sweep met both a gap and an overlap.
			expect(minutes.some(({ kind }) => kind === "gap")).toBe(true);
			expect(minutes.some(({ kind }) => kind === "overlap")).toBe(true);
			const wrong = minutes
				.filter(
					({ date, time, expected }) =>
						Date.parse(toOccurred(date, time, zone).occurredAt)
						!== expected,
				)
				.map(({ date, time }) => `${date} ${time}`);
			expect(wrong).toEqual([]);
		});
	},
);
