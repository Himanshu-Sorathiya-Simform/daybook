import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { SubscriptionCreateInput } from "@/lib/subscriptions/schemas";
import { subscriptionAnswer } from "../../lib/__tests__/fixtures";
import { readSubscriptionWriteError } from "../../lib/write-errors";
import { useCreateSubscription } from "../useCreateSubscription";
import {
	offline,
	ok,
	refuse,
	renderHookInApp,
	route,
	settled,
	testClient,
	watched,
} from "./helpers";
import { watchAreas } from "./watching";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8010";
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

// Flow 7.1: Netflix, 649.00 monthly from 5 Sep 2025, without past charges.
const BODY: SubscriptionCreateInput = {
	id: ID,
	name: "Netflix",
	amountMinor: 64900,
	currency: "INR",
	cadence: { unit: "month", every: 1 },
	startDate: "2025-09-05",
	category: "entertainment",
	note: null,
	backfill: false,
	createdAt: "2026-11-02T06:30:00.000Z",
};
const CREATED = { ...subscriptionAnswer("netflix", { id: ID }), chargesCreated: 0 };
// AC-F05-23: backfill from 5 Sep 2025 to 5 Oct 2026 is 14 charges.
const BACKFILLED = { ...CREATED, chargesCreated: 14 };

async function create(
	result: { current: ReturnType<typeof useCreateSubscription> },
	body: SubscriptionCreateInput = BODY,
	idempotencyKey = KEY,
) {
	await act(async () => {
		await result.current
			.mutateAsync({ body, idempotencyKey })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useCreateSubscription (F05 section 11)", () => {
	test("posts the Add body with the press's key and no version", async () => {
		const seen = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED, 201),
		);
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.path).toBe("/api/subscriptions");
		expect(seen[0]?.body).toEqual(BODY);
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(seen[0]?.headers.get("if-match")).toBeNull();
		expect(result.current.data).toEqual(CREATED);
	});

	// AC-F05-04, AC-F05-23
	test("posts a past-charges choice as it is", async () => {
		const seen = route(network, "post", "/api/subscriptions", () =>
			ok(BACKFILLED, 201),
		);
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result, { ...BODY, backfill: true });
		expect(seen[0]?.body).toMatchObject({ backfill: true });
		expect(result.current.data?.chargesCreated).toBe(14);
	});

	test("a retry of the same press sends the same key, so the server answers it once (D-507)", async () => {
		const seen = route(
			network,
			"post",
			"/api/subscriptions",
			(_request, index) =>
				index === 0 ? HttpResponse.error() : ok(CREATED, 201),
		);
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result);
		await create(result);
		expect(seen.map((each) => each.headers.get("idempotency-key"))).toEqual([
			KEY,
			KEY,
		]);
	});

	// D-603
	test("a repeated id answered 200 counts as created", async () => {
		route(network, "post", "/api/subscriptions", () => ok(CREATED, 200));
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result);
		expect(result.current.isSuccess).toBe(true);
	});

	describe("a confirmed create refreshes what section 12 lists", () => {
		test("with no past charge: the Subscriptions and the profile, whose currency lock counts them (BR-F02-14)", async () => {
			route(network, "post", "/api/subscriptions", () => ok(CREATED, 201));
			const queryClient = testClient();
			const areas = watchAreas(queryClient);
			const { result } = renderHookInApp(() => useCreateSubscription(), {
				queryClient,
			});
			await create(result);
			expect(areas.fetched()).toEqual(["subscriptions", "profile"]);
			areas.stop();
		});

		test("with past charges: also Transactions, payees and Budgets", async () => {
			route(network, "post", "/api/subscriptions", () => ok(BACKFILLED, 201));
			const queryClient = testClient();
			const areas = watchAreas(queryClient);
			const { result } = renderHookInApp(() => useCreateSubscription(), {
				queryClient,
			});
			await create(result, { ...BODY, backfill: true });
			expect(areas.fetched()).toEqual([
				"subscriptions",
				"transactions",
				"payees",
				"budgets",
				"profile",
			]);
			areas.stop();
		});

		test("never the session or the saved views", async () => {
			route(network, "post", "/api/subscriptions", () => ok(BACKFILLED, 201));
			const queryClient = testClient();
			const areas = watchAreas(queryClient);
			const { result } = renderHookInApp(() => useCreateSubscription(), {
				queryClient,
			});
			await create(result);
			expect(areas.fetched()).not.toContain("me");
			expect(areas.fetched()).not.toContain("views");
			areas.stop();
		});

		test("settles only once the page's list has refetched", async () => {
			route(network, "post", "/api/subscriptions", () => ok(CREATED, 201));
			const queryClient = testClient();
			let release: () => void = () => {};
			const slow = new Promise<void>((resolve) => {
				release = resolve;
			});
			const list = watched(
				queryClient,
				[QUERY_ROOTS.subscriptions, "list"],
				{ seeded: true },
				() => slow.then(() => ({ refetched: true })),
			);
			const { result } = renderHookInApp(() => useCreateSubscription(), {
				queryClient,
			});
			let done = false;
			let pending: Promise<unknown> = Promise.resolve();
			act(() => {
				pending = result.current
					.mutateAsync({ body: BODY, idempotencyKey: KEY })
					.then(() => {
						done = true;
					});
			});
			await act(() => new Promise((resolve) => setTimeout(resolve, 30)));
			expect(list.fetches()).toBe(1);
			expect(done).toBe(false);
			expect(result.current.isPending).toBe(true);
			await act(async () => {
				release();
				await pending;
			});
			expect(done).toBe(true);
			list.stop();
		});
	});

	test("a 422 is the error, with each message under its field", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(422, "validation_failed", {
				fields: {
					name: "Enter a name, like Netflix or Rent.",
					"cadence.every": "Enter how many weeks, from 1 to 52.",
				},
			}),
		);
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result);
		expect(readSubscriptionWriteError(result.current.error)).toEqual({
			kind: "fields",
			fields: {
				name: "Enter a name, like Netflix or Rent.",
				cadence: "Enter how many weeks, from 1 to 52.",
			},
			message: null,
		});
	});

	test("currency_mismatch is the error, with its message", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(422, "currency_mismatch", {
				message: "Not saved: your currency changed after this was made.",
			}),
		);
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result);
		expect(readSubscriptionWriteError(result.current.error)).toEqual({
			kind: "form",
			message: "Not saved: your currency changed after this was made.",
		});
	});

	test("a refused create refreshes nothing", async () => {
		route(network, "post", "/api/subscriptions", () => refuse(500, "internal"));
		const queryClient = testClient();
		const areas = watchAreas(queryClient);
		const { result } = renderHookInApp(() => useCreateSubscription(), {
			queryClient,
		});
		await create(result);
		expect(areas.fetched()).toEqual([]);
		areas.stop();
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "post", "/api/subscriptions", () =>
			refuse(503, "unavailable"),
		);
		const { result } = renderHookInApp(() => useCreateSubscription());
		await create(result);
		expect(seen).toHaveLength(1);
	});

	// D-241
	test("offline before M5 it is tried at once and fails with the save message, never left waiting", async () => {
		const online = offline();
		try {
			route(network, "post", "/api/subscriptions", () => HttpResponse.error());
			const { result } = renderHookInApp(() => useCreateSubscription());
			await create(result);
			expect(result.current.isPaused).toBe(false);
			expect(readSubscriptionWriteError(result.current.error)).toEqual({
				kind: "form",
				message:
					"The Subscription could not be saved. Check your connection and try again. Your changes are still here.",
			});
		} finally {
			online();
		}
	});

	test("two presses at once each send their own key, and both settle", async () => {
		const seen = route(network, "post", "/api/subscriptions", ({ body }) =>
			ok({ ...CREATED, id: (body as { id: string }).id }, 201),
		);
		const { result: first } = renderHookInApp(() => useCreateSubscription());
		const { result: second } = renderHookInApp(() => useCreateSubscription());
		await act(async () => {
			await Promise.all([
				first.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
				second.current.mutateAsync({
					body: { ...BODY, id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8011" },
					idempotencyKey: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cff",
				}),
			]);
		});
		await settled(first);
		await settled(second);
		expect(
			new Set(seen.map((each) => each.headers.get("idempotency-key"))).size,
		).toBe(2);
	});
});
