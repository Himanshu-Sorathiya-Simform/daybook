import { describe, expect, test } from "vitest";

import { readFilterParams } from "../transactions/url";
import { toSearchParams } from "../search-params";

describe("toSearchParams", () => {
	test("no parameters give an empty query", () => {
		expect(toSearchParams({}).toString()).toBe("");
	});

	test("keeps each name and value", () => {
		const query = toSearchParams({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: "food",
		});

		expect(query.toString()).toBe("from=2026-10-01&to=2026-10-31&cat=food");
	});

	test("keeps every value of a repeated name, in order", () => {
		const query = toSearchParams({ cat: ["food", "travel"] });

		expect(query.getAll("cat")).toEqual(["food", "travel"]);
	});

	test("leaves out a name with no value", () => {
		expect(toSearchParams({ cat: undefined, q: "chai" }).toString()).toBe(
			"q=chai",
		);
	});

	test("keeps an empty value, which a reader treats as absent", () => {
		const query = toSearchParams({ cat: "" });

		expect(query.has("cat")).toBe(true);
		expect(query.get("cat")).toBe("");
	});

	test("an empty list adds nothing", () => {
		expect(toSearchParams({ cat: [] }).toString()).toBe("");
	});

	test("keeps text that needs encoding, as decoded text", () => {
		const query = toSearchParams({ q: "50% off & more", payee: "Café/Bar #1" });

		expect(query.get("q")).toBe("50% off & more");
		expect(query.get("payee")).toBe("Café/Bar #1");
	});

	test("a repeated filter name stays invalid for the shared reader (D-458), as in the browser", () => {
		const { invalid } = readFilterParams(
			toSearchParams({ cat: ["food", "travel"] }),
			{
				currency: "INR",
			},
		);

		expect(invalid).toEqual(["cat"]);
	});

	test("reads the same filter as the browser's own query for the same link", () => {
		const link =
			"?from=2026-10-01&to=2026-10-31&cat=food,food&sort=amount&txn=x";
		const browser = new URLSearchParams(link);
		const server = toSearchParams({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: "food,food",
			sort: "amount",
			txn: "x",
		});

		expect(readFilterParams(server, { currency: "INR" })).toEqual(
			readFilterParams(browser, { currency: "INR" }),
		);
	});

	test("never changes the record it is given", () => {
		const params = { cat: ["food", "travel"] };
		toSearchParams(params);

		expect(params).toEqual({ cat: ["food", "travel"] });
	});
});
