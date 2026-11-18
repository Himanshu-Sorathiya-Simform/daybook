import { describe, expect, test } from "vitest";

import { ApiError } from "../../../api/errors";
import { readMonthsQuery } from "../query";

/** `readMonthsQuery` (F05 section 11, BR-F05-36, D-596, D-478) on the golden month, November
 * 2026. */

const NOW = "2026-11";
const read = (query: string) => readMonthsQuery(new URLSearchParams(query), NOW);

/** The ApiError a query is refused with, as code and named parameters. */
function refusal(query: string) {
	try {
		read(query);
	} catch (error) {
		if (!(error instanceof ApiError)) throw error;
		return {
			code: error.code,
			params: error.details["params"],
			message: error.message,
		};
	}
	throw new Error("The query was not refused.");
}

describe("a valid query", () => {
	test("is read as two months", () => {
		expect(read("from=2026-10&to=2026-12")).toEqual({
			from: "2026-10",
			to: "2026-12",
		});
	});

	test("may hold a single month, and unknown names are ignored (D-458)", () => {
		expect(read("from=2026-11&to=2026-11&x=1")).toEqual({
			from: "2026-11",
			to: "2026-11",
		});
	});

	test("may span exactly 24 months", () => {
		expect(read("from=2026-01&to=2027-12")).toEqual({
			from: "2026-01",
			to: "2027-12",
		});
	});

	test("may reach 120 months either side of the current month", () => {
		expect(read("from=2016-11&to=2016-11")).toEqual({
			from: "2016-11",
			to: "2016-11",
		});
		expect(read("from=2036-11&to=2036-11")).toEqual({
			from: "2036-11",
			to: "2036-11",
		});
	});
});

const GENERIC = "The request could not be read.";
const WINDOW = "Choose months from Nov 2016 to Nov 2036.";

describe("a refused query is 400 bad_request, naming every refused parameter, from first", () => {
	test.each([
		["no parameters", "", ["from", "to"]],
		["no from", "to=2026-12", ["from"]],
		["no to", "from=2026-10", ["to"]],
		["an empty from", "from=&to=2026-12", ["from"]],
		["a month with one digit", "from=2026-1&to=2026-12", ["from"]],
		["month 13", "from=2026-13&to=2026-12", ["from"]],
		["month 00", "from=2026-00&to=2026-12", ["from"]],
		["a date", "from=2026-10-01&to=2026-12", ["from"]],
		["both malformed", "from=a&to=b", ["from", "to"]],
		["a repeated from", "from=2026-10&from=2026-11&to=2026-12", ["from"]],
		["a repeated to", "from=2026-10&to=2026-11&to=2026-12", ["to"]],
		["from after to", "from=2026-12&to=2026-10", ["from"]],
		["25 months", "from=2026-01&to=2028-01", ["to"]],
		["a span of 121 months", "from=2026-11&to=2036-12", ["to"]],
	])("%s says the generic message", (_name, query, params) => {
		expect(refusal(query)).toEqual({
			code: "bad_request",
			params,
			message: GENERIC,
		});
	});

	// BR-F05-36, D-601: a window miss says which months can be asked for.
	test.each([
		["from past the window", "from=2036-12&to=2036-12", ["from", "to"]],
		["to past the window", "from=2036-10&to=2036-12", ["to"]],
		["from before the window", "from=2016-10&to=2016-10", ["from", "to"]],
	])("%s says the window", (_name, query, params) => {
		expect(refusal(query)).toEqual({
			code: "bad_request",
			params,
			message: WINDOW,
		});
	});
});
