import { QueryClient, skipToken } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { subscriptionKeys } from "../keys";
import {
	duplicatesOptions,
	monthChargesOptions,
	subscriptionChargesOptions,
	subscriptionListOptions,
	subscriptionMonthsOptions,
} from "../queries";
import { charge, listPage, subscriptionItem } from "./fixtures";
import { GOLDEN_SUBSCRIPTIONS } from "../../../../../seed/golden";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const url = (path: string) => new URL(path, window.location.origin).toString();
const ok = (data: unknown) => HttpResponse.json({ data });
const client = () =>
	new QueryClient({ defaultOptions: { queries: { retry: false } } });

/** Answers `GET /api/transactions` with `answer(searchParams)` and records each query string. */
function transactions(
	answer: (query: URLSearchParams, index: number) => ReturnType<typeof listPage>,
) {
	const queries: string[] = [];
	network.use(
		http.get(url("/api/transactions"), ({ request }) => {
			const { search, searchParams } = new URL(request.url);
			queries.push(search);
			return ok(answer(searchParams, queries.length - 1));
		}),
	);
	return queries;
}

describe("subscriptionListOptions (F05 section 11)", () => {
	test("is keyed under the Subscriptions root as the list", () => {
		expect(subscriptionListOptions().queryKey).toEqual(subscriptionKeys.list());
	});

	test("reads GET /api/subscriptions and answers its data", async () => {
		const answer = {
			items: [subscriptionItem("netflix")],
			totals: { monthlyMinor: 2027392, yearlyMinor: 24328700, count: 4 },
			upcoming: [],
			upcomingTotalMinor: 0,
			thisMonth: { chargedMinor: 1800000, toComeMinor: 214900 },
			currency: "INR",
		};
		const paths: string[] = [];
		network.use(
			http.get(url("/api/subscriptions"), ({ request }) => {
				paths.push(new URL(request.url).pathname);
				return ok(answer);
			}),
		);
		expect(await client().fetchQuery(subscriptionListOptions())).toEqual(answer);
		expect(paths).toEqual(["/api/subscriptions"]);
	});

	test("an error status is an error, not an empty answer", async () => {
		network.use(
			http.get(url("/api/subscriptions"), () =>
				HttpResponse.json(
					{ error: { code: "internal", message: "m", requestId: "r" } },
					{ status: 500 },
				),
			),
		);
		await expect(
			client().fetchQuery(subscriptionListOptions()),
		).rejects.toMatchObject({ status: 500 });
	});
});

describe("subscriptionMonthsOptions (BR-F05-36)", () => {
	test("is keyed by both months", () => {
		expect(subscriptionMonthsOptions("2026-10", "2026-12").queryKey).toEqual(
			subscriptionKeys.months("2026-10", "2026-12"),
		);
	});

	test("asks for the span and answers the months", async () => {
		const answer = {
			months: [
				{ month: "2026-10", chargedMinor: 2014800, expectedMinor: 0 },
				{ month: "2026-11", chargedMinor: 1800000, expectedMinor: 214900 },
				{ month: "2026-12", chargedMinor: 0, expectedMinor: 2014900 },
			],
			currency: "INR",
		};
		const queries: string[] = [];
		network.use(
			http.get(url("/api/subscriptions/months"), ({ request }) => {
				queries.push(new URL(request.url).search);
				return ok(answer);
			}),
		);
		expect(
			await client().fetchQuery(
				subscriptionMonthsOptions("2026-10", "2026-12"),
			),
		).toEqual(answer);
		expect(queries).toEqual(["?from=2026-10&to=2026-12"]);
	});
});

describe("monthChargesOptions (BR-F05-38, BR-F05-48)", () => {
	test("is keyed by the month", () => {
		expect(monthChargesOptions("2026-11").queryKey).toEqual(
			subscriptionKeys.monthCharges("2026-11"),
		);
	});

	// AC-F05-33: a month with 130 charges reads two pages and shows all 130.
	test("walks every page of the month's charges", async () => {
		const first = Array.from({ length: 100 }, () => charge());
		const second = Array.from({ length: 30 }, () => charge());
		const queries = transactions((_q, index) =>
			index === 0 ? listPage(first, "page-2") : listPage(second),
		);
		const rows = await client().fetchQuery(monthChargesOptions("2026-11"));
		expect(rows).toHaveLength(130);
		expect(rows).toEqual([...first, ...second]);
		expect(queries).toEqual([
			"?from=2026-11-01&to=2026-11-30&src=subscription&group=none&limit=100",
			"?from=2026-11-01&to=2026-11-30&src=subscription&group=none&limit=100&cursor=page-2",
		]);
	});

	test("a month with no charge is an empty list", async () => {
		transactions(() => listPage([]));
		expect(await client().fetchQuery(monthChargesOptions("2026-12"))).toEqual(
			[],
		);
	});

	test("keeps a deleted Subscription's charge, which has no link", async () => {
		const orphan = charge({ subscriptionId: null, subscription: null });
		transactions(() => listPage([orphan]));
		expect(await client().fetchQuery(monthChargesOptions("2026-10"))).toEqual([
			orphan,
		]);
	});
});

describe("subscriptionChargesOptions (BR-F05-40, BR-F05-48)", () => {
	const NETFLIX = GOLDEN_SUBSCRIPTIONS.netflix.id;

	test("is keyed by the Subscription's id", () => {
		expect(subscriptionChargesOptions(NETFLIX).queryKey).toEqual(
			subscriptionKeys.charges(NETFLIX),
		);
	});

	test("with no id it asks for nothing", () => {
		const options = subscriptionChargesOptions(null);
		expect(options.queryFn).toBe(skipToken);
		expect(options.queryKey).toEqual(subscriptionKeys.charges(null));
	});

	// AC-F05-33: 101 charges are all read.
	test("walks every page of the Subscription's charges", async () => {
		const first = Array.from({ length: 100 }, () => charge());
		const second = [charge()];
		const queries = transactions((_q, index) =>
			index === 0 ? listPage(first, "more") : listPage(second),
		);
		const rows = await client().fetchQuery(subscriptionChargesOptions(NETFLIX));
		expect(rows).toHaveLength(101);
		expect(queries).toEqual([
			`?sub=${NETFLIX}&group=none&limit=100`,
			`?sub=${NETFLIX}&group=none&limit=100&cursor=more`,
		]);
	});

	test("a failing later page fails the read, whole", async () => {
		let calls = 0;
		network.use(
			http.get(url("/api/transactions"), () => {
				calls += 1;
				return calls === 1 ?
						ok(listPage([charge()], "more"))
					:	HttpResponse.json(
							{
								error: {
									code: "internal",
									message: "m",
									requestId: "r",
								},
							},
							{ status: 503 },
						);
			}),
		);
		await expect(
			client().fetchQuery(subscriptionChargesOptions(NETFLIX)),
		).rejects.toMatchObject({ status: 503 });
	});
});

describe("duplicatesOptions (BR-F05-04, BR-F05-48)", () => {
	const READ = { name: "Netflix", from: "2025-09-05", to: "2026-11-01" };
	const expense = (changes: Parameters<typeof charge>[0] = {}) =>
		charge({
			source: "manual",
			subscriptionId: null,
			subscription: null,
			dueOn: null,
			...changes,
		});

	test("is keyed by the name and the period", () => {
		expect(duplicatesOptions(READ).queryKey).toEqual(
			subscriptionKeys.duplicates("Netflix", "2025-09-05", "2026-11-01"),
		);
	});

	test("with no read it asks for nothing", () => {
		const options = duplicatesOptions(null);
		expect(options.queryFn).toBe(skipToken);
		expect(options.queryKey).toEqual(subscriptionKeys.duplicates(null, "", ""));
	});

	// AC-F05-33: the note names 5 Sep and 5 Oct and leaves out "Netflix Premium".
	test("keeps only the expenses whose payee is the name", async () => {
		const sep = expense({ occurredOn: "2026-09-05" });
		const oct = expense({ occurredOn: "2026-10-05" });
		const premium = expense({
			payee: "Netflix Premium",
			occurredOn: "2026-10-20",
		});
		const queries = transactions(() => listPage([oct, premium, sep]));
		expect(await client().fetchQuery(duplicatesOptions(READ))).toEqual([
			oct,
			sep,
		]);
		expect(queries).toEqual([
			"?from=2025-09-05&to=2026-11-01&type=expense&q=Netflix&group=none&limit=100",
		]);
	});

	test("filters across every page, so a duplicate on a later page is found", async () => {
		const early = expense({ occurredOn: "2025-09-05" });
		transactions((_q, index) =>
			index === 0 ?
				listPage([expense({ payee: "Netflix Gift" })], "next")
			:	listPage([early]),
		);
		expect(await client().fetchQuery(duplicatesOptions(READ))).toEqual([early]);
	});

	test("answers an empty list when nothing matches", async () => {
		transactions(() => listPage([]));
		expect(await client().fetchQuery(duplicatesOptions(READ))).toEqual([]);
	});

	test("a name with a reserved character is encoded in the request", async () => {
		const queries = transactions(() => listPage([]));
		await client().fetchQuery(
			duplicatesOptions({ ...READ, name: "Tom & Jerry #1" }),
		);
		expect(queries[0]).toContain("&q=Tom%20%26%20Jerry%20%231&");
	});
});
