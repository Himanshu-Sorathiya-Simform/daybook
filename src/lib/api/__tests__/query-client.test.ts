import { describe, expect, test } from "vitest";

import { ApiRequestError } from "../client";
import {
	createQueryClient,
	DEFAULT_STALE_MS,
	MAX_QUERY_RETRIES,
	shouldRetryQuery,
} from "../query-client";

const http = (status: number) => new ApiRequestError("http", { status });

describe("shouldRetryQuery (STATE-4, D-507)", () => {
	test.each([
		["no answer", new ApiRequestError("network")],
		["no answer in time", new ApiRequestError("timeout")],
		["429", http(429)],
		["500", http(500)],
		["502", http(502)],
		["503", http(503)],
		["599", http(599)],
	])("retries after %s", (_name, error) => {
		expect(shouldRetryQuery(0, error)).toBe(true);
		expect(shouldRetryQuery(1, error)).toBe(true);
	});

	test("stops after two retries", () => {
		expect(MAX_QUERY_RETRIES).toBe(2);
		expect(shouldRetryQuery(2, new ApiRequestError("network"))).toBe(false);
		expect(shouldRetryQuery(3, http(500))).toBe(false);
	});

	test.each([400, 401, 403, 404, 409, 413, 415, 422, 428, 499])(
		"never retries a %i",
		(status) => {
			expect(shouldRetryQuery(0, http(status))).toBe(false);
		},
	);

	test("never retries a 2xx that broke the envelope", () => {
		expect(shouldRetryQuery(0, http(200))).toBe(false);
	});

	test("never retries an http error without a status", () => {
		expect(shouldRetryQuery(0, new ApiRequestError("http"))).toBe(false);
	});

	test.each([
		["a TypeError", new TypeError("bug")],
		["a plain Error", new Error("bug")],
		["a string", "bug"],
		["null", null],
	])("never retries %s, which is a bug and not the network", (_name, error) => {
		expect(shouldRetryQuery(0, error)).toBe(false);
	});
});

describe("createQueryClient", () => {
	test("queries retry by the rule, and mutations never retry by themselves", () => {
		const client = createQueryClient();
		const defaults = client.getDefaultOptions();
		expect(defaults.queries?.retry).toBe(shouldRetryQuery);
		expect(defaults.mutations?.retry).toBe(false);
	});

	test("an answer stays fresh for 30 seconds unless a query sets its own", () => {
		expect(DEFAULT_STALE_MS).toBe(30_000);
		expect(createQueryClient().getDefaultOptions().queries?.staleTime).toBe(
			30_000,
		);
	});

	test("makes a new client each time, so no two pages share a cache", () => {
		expect(createQueryClient()).not.toBe(createQueryClient());
	});
});
