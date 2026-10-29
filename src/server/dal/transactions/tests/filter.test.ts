// @vitest-environment node
import { type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";

import type { TransactionFilter } from "@/lib/transactions/url";
import { SEARCH_TEXT, containsPattern, filterSql, withoutFields } from "../filter";

/** The SQL text and parameters of the filter's clause. The integration test runs it. */
const dialect = new PgDialect();
const render = (query: SQL) => dialect.sqlToQuery(query);
const clause = (filter: TransactionFilter) => render(filterSql(filter, "INR"));

const SEARCH =
	"(coalesce(payee, '') || E'\\x1f' || coalesce(description, '') || E'\\x1f' || coalesce(note, ''))";

describe("filterSql", () => {
	test("is true for the empty filter", () => {
		expect(clause({})).toMatchObject({ sql: "true", params: [] });
	});

	test.each([
		[{ from: "2026-10-01" }, "(occurred_on >= $1::date)", ["2026-10-01"]],
		[{ to: "2026-10-31" }, "(occurred_on <= $1::date)", ["2026-10-31"]],
		[{ src: "subscription" }, "(source = $1)", ["subscription"]],
		[{ minMinor: 50000 }, "(amount_minor >= $1)", [50000]],
		[{ maxMinor: 300000 }, "(amount_minor <= $1)", [300000]],
	] as const)("writes %j as %s", (filter, sql, params) => {
		expect(clause(filter)).toMatchObject({ sql, params });
	});

	test("sends a type or category list as one array parameter", () => {
		expect(clause({ type: ["expense", "refund"], cat: ["food"] })).toMatchObject(
			{
				sql: "(type = ANY($1::text[]) AND category = ANY($2::text[]))",
				params: [["expense", "refund"], ["food"]],
			},
		);
	});

	test("sends an empty list as an empty array, which matches nothing", () => {
		expect(clause({ type: [] })).toMatchObject({
			sql: "(type = ANY($1::text[]))",
			params: [[]],
		});
	});

	// D-470
	test.each([
		{ goal: "0199a000-0000-7000-8001-000000000001" },
		{ sub: "0199a000-0000-7000-8002-000000000001" },
	])("matches nothing for %j until M2 adds the column", (filter) => {
		expect(clause(filter)).toMatchObject({ sql: "(false)", params: [] });
	});

	test("adds one clause for a Goal and a Subscription together", () => {
		expect(
			clause({
				goal: "0199a000-0000-7000-8001-000000000001",
				sub: "0199a000-0000-7000-8002-000000000001",
			}).sql,
		).toBe("(false)");
	});

	test("joins every field with AND, in the URL's order (FIL-1)", () => {
		expect(
			clause({
				from: "2026-10-01",
				to: "2026-10-31",
				type: ["expense"],
				cat: ["food"],
				src: "manual",
				minMinor: 50000,
				maxMinor: 300000,
				q: "big",
			}),
		).toMatchObject({
			sql:
				"(occurred_on >= $1::date AND occurred_on <= $2::date AND type = ANY($3::text[])"
				+ " AND category = ANY($4::text[]) AND source = $5 AND amount_minor >= $6"
				+ ` AND amount_minor <= $7 AND (${SEARCH} ILIKE $8))`,
			params: [
				"2026-10-01",
				"2026-10-31",
				["expense"],
				["food"],
				"manual",
				50000,
				300000,
				"%big%",
			],
		});
	});
});

describe("search in filterSql (BR-F03-35)", () => {
	test("text searches the search expression only", () => {
		expect(clause({ q: "swiggy" })).toMatchObject({
			sql: `((${SEARCH} ILIKE $1))`,
			params: ["%swiggy%"],
		});
	});

	test("a numeric q of 3 characters or more searches the amount or the text", () => {
		expect(clause({ q: "649" })).toMatchObject({
			sql: `((amount_minor = $1 OR ${SEARCH} ILIKE $2))`,
			params: [64900, "%649%"],
		});
	});

	test("a numeric q under 3 characters searches the amount only", () => {
		expect(clause({ q: "64" })).toMatchObject({
			sql: "((amount_minor = $1))",
			params: [6400],
		});
	});

	test("the amount uses the currency's exponent", () => {
		expect(render(filterSql({ q: "649" }, "JPY")).params).toEqual([
			649,
			"%649%",
		]);
		expect(render(filterSql({ q: "1.250" }, "KWD")).params).toEqual([
			1250,
			"%1.250%",
		]);
	});

	test("the expression joins the three fields with U+001F, missing ones empty", () => {
		expect(render(SEARCH_TEXT).sql).toBe(SEARCH);
	});
});

describe("containsPattern", () => {
	test.each([
		["swiggy", "%swiggy%"],
		["50%", "%50\\%%"],
		["a_b", "%a\\_b%"],
		["back\\slash", "%back\\\\slash%"],
		["%_\\", "%\\%\\_\\\\%"],
		["Crème brûlée", "%Crème brûlée%"],
	])("escapes %j as %j", (text, pattern) => {
		expect(containsPattern(text)).toBe(pattern);
	});
});

describe("withoutFields", () => {
	const filter: TransactionFilter = {
		from: "2026-10-01",
		to: "2026-10-31",
		cat: ["food"],
		minMinor: 50000,
		maxMinor: 300000,
	};

	test("drops only the named fields", () => {
		expect(withoutFields(filter, "minMinor", "maxMinor")).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: ["food"],
		});
		expect(withoutFields(filter, "cat")).toEqual({
			from: "2026-10-01",
			to: "2026-10-31",
			minMinor: 50000,
			maxMinor: 300000,
		});
	});

	test("ignores a named field the filter lacks, and leaves the filter itself alone", () => {
		expect(withoutFields(filter, "q", "type")).toEqual(filter);
		expect(filter.minMinor).toBe(50000);
	});
});
