import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { describe, expect, test } from "vitest";

import type { SubscriptionDeleteInput } from "@/lib/subscriptions/schemas";
import { subscriptionAnswer } from "../../lib/__tests__/fixtures";
import type { SubscriptionDeleted } from "../../lib/types";
import {
	readSubscriptionDeleteError,
	readSubscriptionNoticeError,
} from "../../lib/write-errors";
import { useDeleteSubscription } from "../useDeleteSubscription";
import {
	offline,
	ok,
	refuse,
	renderHookInApp,
	route,
	settled,
	testClient,
	testNetwork,
} from "./helpers";
import { watchAreas } from "./watching";

const network = testNetwork();

const NETFLIX = subscriptionAnswer("netflix");
const PATH = `/api/subscriptions/${NETFLIX.id}`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

const PLAIN: SubscriptionDeleteInput = { changedAt: "2026-11-02T06:30:00.000Z" };
// BR-F05-34: Undo after an Add.
const UNDO: SubscriptionDeleteInput = { ...PLAIN, undo: "create" };

const DELETED = (
	changes: Partial<SubscriptionDeleted> = {},
): SubscriptionDeleted => ({
	changeDate: "2026-11-02",
	chargesCreated: 0,
	chargesKept: 0,
	chargesDeleted: 0,
	months: [],
	...changes,
});

async function remove(
	result: { current: ReturnType<typeof useDeleteSubscription> },
	{ body = PLAIN, version = 1, idempotencyKey = KEY } = {},
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: NETFLIX.id, version, body, idempotencyKey })
			.catch(() => undefined);
	});
	await settled(result);
}

/** Deletes Netflix through a fresh client that watches each area, and lists the areas that
 * read again after it. */
async function refreshedBy(options: Parameters<typeof remove>[1] = {}) {
	const queryClient = testClient();
	const areas = watchAreas(queryClient);
	const { result } = renderHookInApp(() => useDeleteSubscription(), {
		queryClient,
	});
	await remove(result, options);
	const fetched = areas.fetched();
	areas.stop();
	return fetched;
}

describe("useDeleteSubscription (F05 section 11)", () => {
	test("deletes with the version as If-Match, the change time and the press's key", async () => {
		const seen = route(network, "delete", PATH, () =>
			ok(DELETED({ chargesKept: 2 })),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe("DELETE");
		expect(seen[0]?.body).toEqual(PLAIN);
		expect(seen[0]?.headers.get("if-match")).toBe('"1"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.data).toEqual(DELETED({ chargesKept: 2 }));
	});

	// AC-F05-23
	test("the Undo of an Add sends undo: create at version 1", async () => {
		const seen = route(network, "delete", PATH, () =>
			ok(DELETED({ chargesDeleted: 14 })),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result, { body: UNDO });
		expect(seen[0]?.body).toEqual({
			changedAt: "2026-11-02T06:30:00.000Z",
			undo: "create",
		});
		expect(seen[0]?.headers.get("if-match")).toBe('"1"');
	});

	test("a retry of the same press sends the same key (D-507)", async () => {
		const seen = route(network, "delete", PATH, (_request, index) =>
			index === 0 ? HttpResponse.error() : ok(DELETED()),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result);
		await remove(result);
		expect(seen.map((each) => each.headers.get("idempotency-key"))).toEqual([
			KEY,
			KEY,
		]);
	});

	describe("a confirmed delete refreshes what section 12 lists", () => {
		test("with no charge to keep or delete: the Subscriptions and the profile", async () => {
			route(network, "delete", PATH, () => ok(DELETED()));
			expect(await refreshedBy()).toEqual(["subscriptions", "profile"]);
		});

		// AC-F05-08: its charges stay as unlinked expenses, which Transactions lists differently.
		test("charges kept as unlinked expenses refresh Transactions, payees and Budgets too", async () => {
			route(network, "delete", PATH, () => ok(DELETED({ chargesKept: 2 })));
			expect(await refreshedBy()).toEqual([
				"subscriptions",
				"transactions",
				"payees",
				"budgets",
				"profile",
			]);
		});

		test.each<[string, Partial<SubscriptionDeleted>]>([
			["deleted", { chargesDeleted: 1 }],
			["created by the closing catch-up", { chargesCreated: 1 }],
			["a month listed", { months: ["2026-10"] }],
		])("charges %s do as well", async (_what, counts) => {
			route(network, "delete", PATH, () => ok(DELETED(counts)));
			expect(await refreshedBy()).toContain("transactions");
		});
	});

	// D-239
	describe("a 404", () => {
		test("on a plain delete counts as done and answers null", async () => {
			route(network, "delete", PATH, () => refuse(404, "not_found"));
			const { result } = renderHookInApp(() => useDeleteSubscription());
			await remove(result);
			expect(result.current.isSuccess).toBe(true);
			expect(result.current.data).toBeNull();
		});

		test("on a plain delete still refreshes everything, since its charges are unknown", async () => {
			route(network, "delete", PATH, () => refuse(404, "not_found"));
			expect(await refreshedBy()).toEqual([
				"subscriptions",
				"transactions",
				"payees",
				"budgets",
				"profile",
			]);
		});

		// BR-F05-33
		test("on the Undo of an Add is the error: it was deleted on another device", async () => {
			route(network, "delete", PATH, () => refuse(404, "not_found"));
			const { result } = renderHookInApp(() => useDeleteSubscription());
			await remove(result, { body: UNDO });
			expect(result.current.isError).toBe(true);
			expect(
				readSubscriptionNoticeError(result.current.error, { undo: true }),
			).toEqual({
				kind: "gone",
				message: "This Subscription was deleted on another device.",
			});
		});

		test("on the Undo of an Add refreshes nothing", async () => {
			route(network, "delete", PATH, () => refuse(404, "not_found"));
			expect(await refreshedBy({ body: UNDO })).toEqual([]);
		});
	});

	// AC-F05-14, AC-F05-23
	test("a 409 is the error, carrying the saved Subscription for the conflict view", async () => {
		const saved = subscriptionAnswer("netflix", { version: 2 });
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", { details: { current: saved } }),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result);
		expect(readSubscriptionDeleteError(result.current.error)).toEqual({
			kind: "conflict",
			current: saved,
		});
	});

	test("an Undo of an Add at version 2 meets the 409 too, for Delete anyway and Keep it", async () => {
		const saved = subscriptionAnswer("netflix", { version: 2 });
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", { details: { current: saved } }),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result, { body: UNDO, version: 2 });
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: true }),
		).toEqual({
			kind: "conflict",
			current: saved,
		});
	});

	test("a 422 from Undo reads that it can't be undone any more", async () => {
		route(network, "delete", PATH, () =>
			refuse(422, "validation_failed", { fields: { undo: 'Send "create".' } }),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result, { body: UNDO });
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: true }),
		).toEqual({
			kind: "failed",
			message: "This change can't be undone any more.",
		});
	});

	test("another refusal is the error, for the confirmation", async () => {
		route(network, "delete", PATH, () => refuse(500, "internal"));
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result);
		expect(readSubscriptionDeleteError(result.current.error)).toEqual({
			kind: "refused",
			message:
				"The Subscription could not be deleted. Check your connection and try again.",
		});
	});

	test("a refused delete refreshes nothing", async () => {
		route(network, "delete", PATH, () => refuse(500, "internal"));
		expect(await refreshedBy()).toEqual([]);
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "delete", PATH, () =>
			refuse(503, "unavailable"),
		);
		const { result } = renderHookInApp(() => useDeleteSubscription());
		await remove(result);
		expect(seen).toHaveLength(1);
	});

	// D-241
	test("offline before M5 it is tried at once and fails with the delete message", async () => {
		const online = offline();
		try {
			route(network, "delete", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useDeleteSubscription());
			await remove(result);
			expect(result.current.isPaused).toBe(false);
			expect(readSubscriptionDeleteError(result.current.error)).toEqual({
				kind: "refused",
				message:
					"The Subscription could not be deleted. Check your connection and try again.",
			});
		} finally {
			online();
		}
	});
});
