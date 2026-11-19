import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import type { SubscriptionEditInput } from "@/lib/subscriptions/schemas";
import { subscriptionAnswer } from "../../lib/__tests__/fixtures";
import type { SubscriptionChanged } from "../../lib/types";
import {
	readSubscriptionNoticeError,
	readSubscriptionWriteError,
} from "../../lib/write-errors";
import { useChangeSubscription } from "../useChangeSubscription";
import {
	offline,
	ok,
	refuse,
	renderHookInApp,
	route,
	settled,
	testClient,
} from "./helpers";
import { watchAreas } from "./watching";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const NETFLIX = subscriptionAnswer("netflix");
const PATH = `/api/subscriptions/${NETFLIX.id}`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

// Section 5's price change: Netflix to 799.00.
const BODY: SubscriptionEditInput = {
	changedAt: "2026-11-02T06:30:00.000Z",
	amountMinor: 79900,
	currency: "INR",
};

type Counts = Partial<
	Pick<
		SubscriptionChanged,
		"chargesCreated" | "chargesUpdated" | "chargesDeleted" | "months"
	>
>;

const NOTHING = {
	changeDate: "2026-11-02",
	chargesCreated: 0,
	chargesUpdated: 0,
	chargesDeleted: 0,
	months: [],
};
const answer = (
	counts: Partial<Omit<SubscriptionChanged, keyof typeof NETFLIX>> = {},
	changes: Partial<SubscriptionChanged> = {},
): SubscriptionChanged => ({
	...NETFLIX,
	version: 2,
	...NOTHING,
	...counts,
	...changes,
});

async function change(
	result: { current: ReturnType<typeof useChangeSubscription> },
	{ body = BODY, version = 1, idempotencyKey = KEY } = {},
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: NETFLIX.id, version, body, idempotencyKey })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useChangeSubscription (F05 section 11)", () => {
	test("patches the body with the version as If-Match and the press's key", async () => {
		const seen = route(network, "patch", PATH, () => ok(answer()));
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe("PATCH");
		expect(seen[0]?.body).toEqual(BODY);
		expect(seen[0]?.headers.get("if-match")).toBe('"1"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.data).toEqual(answer());
	});

	test.each([
		[
			"a Pause",
			{
				changedAt: BODY.changedAt,
				pause: { from: "2026-11-05", until: "2027-01-05" },
			},
		],
		["a Resume now", { changedAt: BODY.changedAt, pause: null }],
		["a Cancel", { changedAt: BODY.changedAt, endDate: "2026-09-30" }],
		[
			"a Resume that never stopped",
			{ changedAt: BODY.changedAt, endDate: null, backfillGap: true },
		],
		[
			"the double-charge skip",
			{
				changedAt: BODY.changedAt,
				startDate: "2026-09-15",
				skipDueOn: "2026-11-15",
			},
		],
		[
			"an Undo of an Edit's skip",
			{
				changedAt: BODY.changedAt,
				startDate: "2026-09-05",
				unskipDueOn: "2026-11-15",
			},
		],
		[
			"a rename of past charges",
			{
				changedAt: BODY.changedAt,
				name: "Netflix Premium",
				alsoPastCharges: true,
			},
		],
	] as const)("sends %s as it is", async (_what, body) => {
		const seen = route(network, "patch", PATH, () => ok(answer()));
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result, { body: body as SubscriptionEditInput });
		expect(seen[0]?.body).toEqual(body);
	});

	test("a retry of the same press sends the same key (D-507)", async () => {
		const seen = route(network, "patch", PATH, (_request, index) =>
			index === 0 ? HttpResponse.error() : ok(answer()),
		);
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		await change(result);
		expect(seen.map((each) => each.headers.get("idempotency-key"))).toEqual([
			KEY,
			KEY,
		]);
	});

	describe("a confirmed change refreshes what section 12 lists", () => {
		// AC-F05-32: nothing differs, so no charge and no version.
		test("with no charge changed: the Subscriptions only", async () => {
			route(network, "patch", PATH, () => ok(answer()));
			const queryClient = testClient();
			const areas = watchAreas(queryClient);
			const { result } = renderHookInApp(() => useChangeSubscription(), {
				queryClient,
			});
			await change(result);
			expect(areas.fetched()).toEqual(["subscriptions"]);
			areas.stop();
		});

		test.each<[string, Counts]>([
			["created", { chargesCreated: 1 }],
			["repriced", { chargesUpdated: 2 }],
			["deleted", { chargesDeleted: 1 }],
			["a month listed", { months: ["2026-11"] }],
		])(
			"with charges %s: also Transactions, payees and Budgets",
			async (_what, counts) => {
				route(network, "patch", PATH, () => ok(answer(counts)));
				const queryClient = testClient();
				const areas = watchAreas(queryClient);
				const { result } = renderHookInApp(() => useChangeSubscription(), {
					queryClient,
				});
				await change(result);
				expect(areas.fetched()).toEqual([
					"subscriptions",
					"transactions",
					"payees",
					"budgets",
				]);
				areas.stop();
			},
		);

		test("never the profile, since a change adds or removes no Subscription", async () => {
			route(network, "patch", PATH, () =>
				ok(answer({ chargesDeleted: 3, months: ["2026-10"] })),
			);
			const queryClient = testClient();
			const areas = watchAreas(queryClient);
			const { result } = renderHookInApp(() => useChangeSubscription(), {
				queryClient,
			});
			await change(result);
			expect(areas.fetched()).not.toContain("profile");
			areas.stop();
		});
	});

	// AC-F05-14
	test("a 409 is the error, carrying the saved Subscription for the conflict view", async () => {
		const saved = subscriptionAnswer("netflix", {
			version: 4,
			amountMinor: 89900,
		});
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current: saved } }),
		);
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		expect(readSubscriptionWriteError(result.current.error)).toEqual({
			kind: "conflict",
			current: saved,
		});
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: true }),
		).toEqual({
			kind: "conflict",
			current: saved,
		});
	});

	test("a 404 is the error: it was deleted on another device", async () => {
		route(network, "patch", PATH, () => refuse(404, "not_found"));
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		expect(readSubscriptionWriteError(result.current.error)).toEqual({
			kind: "gone",
			message: "This Subscription was deleted on another device.",
		});
	});

	test("a 422 is the error, with each message under its field", async () => {
		route(network, "patch", PATH, () =>
			refuse(422, "validation_failed", {
				fields: {
					"pause.from": "Choose a date with a charge to pause from.",
					skipDueOn: "Choose a date with a charge to skip.",
				},
			}),
		);
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		expect(readSubscriptionWriteError(result.current.error)).toEqual({
			kind: "fields",
			fields: {
				pause: "Choose a date with a charge to pause from.",
				skipDueOn: "Choose a date with a charge to skip.",
			},
			message: null,
		});
	});

	// BR-F05-33: a refused Undo reads that it can't be undone.
	test("from Undo, a 422 reads that the change can't be undone any more", async () => {
		route(network, "patch", PATH, () =>
			refuse(422, "validation_failed", { fields: { endDate: "x" } }),
		);
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: true }),
		).toEqual({
			kind: "failed",
			message: "This change can't be undone any more.",
		});
	});

	test("a refused change refreshes nothing", async () => {
		route(network, "patch", PATH, () => refuse(409, "version_conflict"));
		const queryClient = testClient();
		const areas = watchAreas(queryClient);
		const { result } = renderHookInApp(() => useChangeSubscription(), {
			queryClient,
		});
		await change(result);
		expect(areas.fetched()).toEqual([]);
		areas.stop();
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "patch", PATH, () => refuse(503, "unavailable"));
		const { result } = renderHookInApp(() => useChangeSubscription());
		await change(result);
		expect(seen).toHaveLength(1);
	});

	// D-241
	test("offline before M5 it is tried at once and fails, never left waiting", async () => {
		const online = offline();
		try {
			route(network, "patch", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useChangeSubscription());
			await change(result);
			expect(result.current.isPaused).toBe(false);
			expect(readSubscriptionWriteError(result.current.error)).toMatchObject({
				kind: "form",
			});
		} finally {
			online();
		}
	});

	test("an id with a reserved character stays in the path", async () => {
		const seen = route(network, "patch", "/api/subscriptions/a%2Fb", () =>
			ok(answer()),
		);
		const { result } = renderHookInApp(() => useChangeSubscription());
		await act(async () => {
			await result.current.mutateAsync({
				id: "a/b",
				version: 1,
				body: BODY,
				idempotencyKey: KEY,
			});
		});
		expect(seen[0]?.path).toBe("/api/subscriptions/a%2Fb");
	});
});
