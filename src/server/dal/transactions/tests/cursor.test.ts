// @vitest-environment node
import { describe, expect, test } from "vitest";

import { ApiError } from "../../../api/errors";
import { type Cursor, decodeCursor, encodeCursor, readCursor } from "../cursor";

// golden #13: Acme Corp, 85,000.00 on 1 October at 10:05 IST.
const DATE_DAY: Cursor = {
	v: 1,
	sort: "date",
	dir: "desc",
	group: "day",
	travel: "next",
	on: "2026-10-01",
	at: "2026-10-01T04:35:00.000Z",
	id: "0199a000-0000-7000-8000-000000000013",
};

const AMOUNT_CATEGORY: Cursor = {
	...DATE_DAY,
	sort: "amount",
	group: "category",
	travel: "prev",
	amount: 8500000,
	groupKey: "salary",
	order: "0123456789abcdef",
};

const listOf = ({ sort, dir, group }: Cursor) => ({ sort, dir, group });

/** The cursor text for raw JSON, as a client could forge it. */
const forge = (json: unknown) =>
	Buffer.from(JSON.stringify(json)).toString("base64url");

function refusal(text: string, list = listOf(DATE_DAY)): unknown {
	try {
		decodeCursor(text, list);
	} catch (error) {
		if (error instanceof ApiError)
			return {
				code: error.code,
				status: error.status,
				details: error.details,
			};
		throw error;
	}
	return null;
}

const BAD_REQUEST = {
	code: "bad_request",
	status: 400,
	details: { params: ["cursor"] },
};

describe("encodeCursor and decodeCursor", () => {
	test.each([
		["the date sort with day grouping", DATE_DAY],
		[
			"the date sort, oldest first, with no grouping",
			{ ...DATE_DAY, dir: "asc", group: "none" },
		],
		[
			"the amount sort with no grouping",
			{ ...DATE_DAY, sort: "amount", group: "none", amount: 1 },
		],
		["the amount sort with category grouping", AMOUNT_CATEGORY],
		[
			"payee grouping with a key outside ASCII",
			{
				...DATE_DAY,
				group: "payee",
				groupKey: "café ümit",
				order: "ffffffffffffffff",
			},
		],
		[
			"the largest amount",
			{ ...DATE_DAY, sort: "amount", group: "none", amount: 999999999999 },
		],
	] as const)("round-trip %s", (_label, cursor) => {
		const text = encodeCursor(cursor as Cursor);
		expect(decodeCursor(text, listOf(cursor as Cursor))).toEqual(cursor);
	});

	test("write base64url: no +, / or = padding", () => {
		const text = encodeCursor({ ...AMOUNT_CATEGORY, groupKey: "??>>??>>" });
		expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
	});
});

describe("decodeCursor refuses with 400 bad_request naming cursor", () => {
	test.each([
		["an empty text", ""],
		["characters outside base64url", "eyJ2IjoxfQ=="],
		["a + or /", "ab+/cd"],
		["text over 2,048 characters", "A".repeat(2049)],
		[
			"base64url that is not JSON",
			Buffer.from("not json").toString("base64url"),
		],
		["JSON that is not an object", forge([DATE_DAY])],
		["JSON null", forge(null)],
	])("%s", (_label, text) => {
		expect(refusal(text)).toEqual(BAD_REQUEST);
	});

	test.each([
		["version 2", { v: 2 }],
		["an unknown sort", { sort: "price" }],
		["an unknown direction", { dir: "up" }],
		["an unknown grouping", { group: "week" }],
		["an unknown travel", { travel: "back" }],
		["a date that does not exist", { on: "2026-02-30" }],
		["a date with a time", { on: "2026-10-01T00:00:00Z" }],
		["an instant without milliseconds", { at: "2026-10-01T04:35:00Z" }],
		["an instant with an offset", { at: "2026-10-01T10:05:00.000+05:30" }],
		["an instant that does not exist", { at: "2026-13-01T04:35:00.000Z" }],
		// D-490: Postgres has no year 0; casting either would fail as a 500.
		["a date in the year 0000", { on: "0000-12-31" }],
		["an instant in the year 0000", { at: "0000-12-31T23:59:00.000Z" }],
		["an id that is not a UUID", { id: "13" }],
		["an amount under the date sort", { amount: 100 }],
		["a group key under day grouping", { groupKey: "food" }],
		["a fingerprint under day grouping", { order: "0123456789abcdef" }],
		["an unknown field", { page: 2 }],
	])("contents with %s", (_label, change) => {
		expect(refusal(forge({ ...DATE_DAY, ...change }))).toEqual(BAD_REQUEST);
	});

	test.each([
		["v"],
		["sort"],
		["dir"],
		["group"],
		["travel"],
		["on"],
		["at"],
		["id"],
	])("contents without %s", (field) => {
		const rest = Object.fromEntries(
			Object.entries(DATE_DAY).filter(([key]) => key !== field),
		);
		expect(refusal(forge(rest))).toEqual(BAD_REQUEST);
	});

	test.each([
		["no amount under the amount sort", { amount: undefined }],
		["an amount of 0", { amount: 0 }],
		["an amount above the largest", { amount: 1000000000000 }],
		["a fractional amount", { amount: 1.5 }],
		["an amount as text", { amount: "8500000" }],
		["no group key under category grouping", { groupKey: undefined }],
		["an empty group key", { groupKey: "" }],
		["a group key over 320 characters", { groupKey: "a".repeat(321) }],
		// D-490: Postgres refuses a NUL in text (22021); no payee key holds a control character.
		["a group key holding a NUL", { groupKey: "swiggy\u0000" }],
		["a group key holding a C1 control", { groupKey: "swiggy\u0085" }],
		["a group key with a lone surrogate", { groupKey: "caf\ud800" }],
		["no fingerprint under category grouping", { order: undefined }],
		["a fingerprint of 15 characters", { order: "0123456789abcde" }],
		["a fingerprint in capitals", { order: "0123456789ABCDEF" }],
	])("amount-sorted, category-grouped contents with %s", (_label, change) => {
		const json = JSON.parse(JSON.stringify({ ...AMOUNT_CATEGORY, ...change }));
		expect(refusal(forge(json), listOf(AMOUNT_CATEGORY))).toEqual(BAD_REQUEST);
	});

	// AC-F03-38
	test("a cursor made under day grouping, sent with no grouping", () => {
		expect(
			refusal(encodeCursor(DATE_DAY), { ...listOf(DATE_DAY), group: "none" }),
		).toEqual(BAD_REQUEST);
	});

	// AC-F03-38
	test("a cursor made under the date sort, sent with the amount sort", () => {
		const cursor: Cursor = { ...DATE_DAY, group: "none" };
		expect(
			refusal(encodeCursor(cursor), {
				sort: "amount",
				dir: "desc",
				group: "none",
			}),
		).toEqual(BAD_REQUEST);
	});

	// D-474: the direction counts too, or the rows would come from the wrong side.
	test("a cursor made newest first, sent oldest first", () => {
		expect(
			refusal(encodeCursor(DATE_DAY), { ...listOf(DATE_DAY), dir: "asc" }),
		).toEqual(BAD_REQUEST);
	});

	test("a hand-edited cursor whose JSON no longer parses", () => {
		const text = encodeCursor(DATE_DAY);
		expect(refusal(text.slice(0, -4))).toEqual(BAD_REQUEST);
	});
});

describe("readCursor", () => {
	test("answers the cursor when its contents pass and it matches the list", () => {
		expect(readCursor(encodeCursor(DATE_DAY), listOf(DATE_DAY))).toEqual(
			DATE_DAY,
		);
	});

	test("answers null instead of throwing for contents that fail", () => {
		expect(readCursor("junk!", listOf(DATE_DAY))).toBeNull();
		expect(readCursor(forge({ ...DATE_DAY, on: "0000-12-31" }))).toBeNull();
	});

	test("answers null for a cursor made under other list parameters", () => {
		expect(
			readCursor(encodeCursor(DATE_DAY), { ...listOf(DATE_DAY), dir: "asc" }),
		).toBeNull();
	});

	// D-490: when the request's own sort, direction or group is invalid, there is nothing to
	// compare with, so only the contents count.
	test("without list parameters, checks the contents only", () => {
		expect(readCursor(encodeCursor(AMOUNT_CATEGORY))).toEqual(AMOUNT_CATEGORY);
	});
});
