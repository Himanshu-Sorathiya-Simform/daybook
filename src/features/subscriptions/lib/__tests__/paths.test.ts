// @vitest-environment node
import { describe, expect, test } from "vitest";

import { type Cursor, encodeCursor } from "@/server/dal/transactions/cursor";
import { readListQuery } from "@/server/dal/transactions/query";
import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";
import {
	CHARGES_PAGE_SIZE,
	duplicatesPath,
	monthChargesPath,
	monthsPath,
	skipPath,
	skipsPath,
	SUBSCRIPTIONS_PATH,
	subscriptionChargesPath,
	subscriptionPath,
} from "../paths";

const NETFLIX = GOLDEN_SUBSCRIPTIONS.netflix.id;

/** What the API's own list reader makes of a path, which a 400 would refuse (BR-F03-33,
 * D-478). */
const read = (path: string) =>
	readListQuery(new URL(path, "https://daybook.test").searchParams, "INR");

describe("the Subscription routes (F05 section 11)", () => {
	test("the list and the create share one path", () => {
		expect(SUBSCRIPTIONS_PATH).toBe("/api/subscriptions");
	});

	test("a Subscription's change and delete path holds its id", () => {
		expect(subscriptionPath(NETFLIX)).toBe(`/api/subscriptions/${NETFLIX}`);
	});

	test("an id is encoded, so it can never add a path segment or a query", () => {
		expect(subscriptionPath("a/b?c#d")).toBe("/api/subscriptions/a%2Fb%3Fc%23d");
		expect(skipsPath("a/b")).toBe("/api/subscriptions/a%2Fb/skips");
	});

	test("skipping and bringing back a date use the skips path", () => {
		expect(skipsPath(NETFLIX)).toBe(`/api/subscriptions/${NETFLIX}/skips`);
		expect(skipPath(NETFLIX, "2026-11-05")).toBe(
			`/api/subscriptions/${NETFLIX}/skips/2026-11-05`,
		);
	});

	test("the months path holds both ends", () => {
		expect(monthsPath("2026-10", "2026-12")).toBe(
			"/api/subscriptions/months?from=2026-10&to=2026-12",
		);
	});
});

describe("whole sets of charges (BR-F05-48)", () => {
	test("a page holds 100 rows, the most a request may ask for (API-7)", () => {
		expect(CHARGES_PAGE_SIZE).toBe(100);
	});

	describe("a month's charges", () => {
		test("November 2026 runs from its first to its last day, deleted Subscriptions' included", () => {
			expect(monthChargesPath("2026-11", null)).toBe(
				"/api/transactions?from=2026-11-01&to=2026-11-30&src=subscription&group=none&limit=100",
			);
		});

		test.each([
			["2026-02", "2026-02-28"],
			["2028-02", "2028-02-29"],
			["2026-12", "2026-12-31"],
			["2026-04", "2026-04-30"],
		])("%s ends on %s", (month, last) => {
			expect(monthChargesPath(month, null)).toContain(`&to=${last}&`);
		});

		test("the API reads it as the source filter over that month, ungrouped, 100 rows", () => {
			const { filter, list, limit, cursor } = read(
				monthChargesPath("2026-10", null),
			);
			expect(filter).toEqual({
				from: "2026-10-01",
				to: "2026-10-31",
				src: "subscription",
			});
			expect(list).toEqual({ sort: "date", dir: "desc", group: "none" });
			expect(limit).toBe(100);
			expect(cursor).toBeUndefined();
		});
	});

	describe("one Subscription's charges", () => {
		test("filters by its id", () => {
			expect(subscriptionChargesPath(NETFLIX, null)).toBe(
				`/api/transactions?sub=${NETFLIX}&group=none&limit=100`,
			);
		});

		test("the API reads it as the Subscription filter, ungrouped, 100 rows", () => {
			const { filter, list, limit } = read(
				subscriptionChargesPath(NETFLIX, null),
			);
			expect(filter).toEqual({ sub: NETFLIX });
			expect(list.group).toBe("none");
			expect(limit).toBe(100);
		});
	});

	describe("the duplicates read", () => {
		test("asks for expenses over the period whose text holds the name", () => {
			expect(duplicatesPath("Netflix", "2025-09-05", "2026-11-01", null)).toBe(
				"/api/transactions?from=2025-09-05&to=2026-11-01&type=expense&q=Netflix&group=none&limit=100",
			);
		});

		test("the API reads it as a type, date and text filter", () => {
			const { filter } = read(
				duplicatesPath("Netflix", "2025-09-05", "2026-11-01", null),
			);
			expect(filter).toEqual({
				from: "2025-09-05",
				to: "2026-11-01",
				type: ["expense"],
				q: "Netflix",
			});
		});

		test.each([
			["Cafe Coffee Day", "Cafe%20Coffee%20Day"],
			["Café & Co", "Caf%C3%A9%20%26%20Co"],
			["50% off #1", "50%25%20off%20%231"],
			["a+b=c", "a%2Bb%3Dc"],
		])(
			"the name %j is written %s, so it cannot add a parameter",
			(name, written) => {
				const path = duplicatesPath(name, "2025-09-05", "2026-11-01", null);
				expect(path).toContain(`&q=${written}&`);
				expect(read(path).filter.q).toBe(name);
			},
		);
	});

	describe("the cursor", () => {
		const CURSOR: Cursor = {
			v: 1,
			sort: "date",
			dir: "desc",
			group: "none",
			travel: "next",
			on: "2026-10-05",
			at: "2026-10-04T18:30:00.000Z",
			id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe",
		};

		test("comes last, after the page size", () => {
			const cursor = encodeCursor(CURSOR);
			expect(monthChargesPath("2026-11", cursor)).toBe(
				`/api/transactions?from=2026-11-01&to=2026-11-30&src=subscription&group=none&limit=100&cursor=${cursor}`,
			);
		});

		test.each([
			["month", () => monthChargesPath("2026-10", encodeCursor(CURSOR))],
			[
				"Subscription",
				() => subscriptionChargesPath(NETFLIX, encodeCursor(CURSOR)),
			],
			[
				"duplicates",
				() =>
					duplicatesPath(
						"Netflix",
						"2025-09-05",
						"2026-10-31",
						encodeCursor(CURSOR),
					),
			],
		])(
			"a cursor made under the default sort and no grouping fits a %s page",
			(_name, path) => {
				expect(read(path()).cursor).toBe(encodeCursor(CURSOR));
			},
		);

		test("is encoded when it holds a reserved character", () => {
			expect(subscriptionChargesPath(NETFLIX, "a+b/c=")).toContain(
				"&cursor=a%2Bb%2Fc%3D",
			);
		});

		test("a first page has no cursor parameter", () => {
			expect(subscriptionChargesPath(NETFLIX, null)).not.toContain("cursor");
		});
	});
});
