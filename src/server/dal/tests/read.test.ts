// @vitest-environment node
import { describe, expect, test } from "vitest";
import { expiredPath } from "../read";

describe("expiredPath", () => {
	test("sends the page's path as next when the proxy gave it", () => {
		expect(
			expiredPath(
				new Headers({ "x-daybook-path": "/transactions?month=2026-11" }),
			),
		).toBe("/api/session/expired?next=%2Ftransactions%3Fmonth%3D2026-11");
	});

	test("without the path, goes to the route with no next", () => {
		expect(expiredPath(new Headers())).toBe("/api/session/expired");
	});

	test("an empty path counts as none", () => {
		expect(expiredPath(new Headers({ "x-daybook-path": "" }))).toBe(
			"/api/session/expired",
		);
	});
});
