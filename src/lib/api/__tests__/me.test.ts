import { describe, expect, test } from "vitest";

import { isMeKey, ME_KEY, ME_STALE_MS, meOptions } from "../me";
import { QUERY_ROOTS } from "../query-keys";

describe("meOptions (BR-P4-12, STATE-5)", () => {
	test("reads under the me root", () => {
		expect(ME_KEY).toEqual([QUERY_ROOTS.me]);
		expect(meOptions().queryKey).toEqual(["me"]);
	});

	test("stays fresh for 60 seconds and refetches on focus once older", () => {
		expect(ME_STALE_MS).toBe(60_000);
		expect(meOptions().staleTime).toBe(60_000);
		expect(meOptions().refetchOnWindowFocus).toBe(true);
	});
});

describe("isMeKey", () => {
	test.each([
		[["me"], true],
		[["me", "extra"], true],
		[["profile"], false],
		[["transactions", "me"], false],
		[[], false],
		[[{ me: true }], false],
	])("%j is %s", (key, expected) => {
		expect(isMeKey(key)).toBe(expected);
	});
});
