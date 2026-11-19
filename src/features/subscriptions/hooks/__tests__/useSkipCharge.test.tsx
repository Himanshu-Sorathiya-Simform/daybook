import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { subscriptionAnswer } from "../../lib/__tests__/fixtures";
import { readSubscriptionNoticeError } from "../../lib/write-errors";
import { useSkipCharge } from "../useSkipCharge";
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
const PATH = `/api/subscriptions/${NETFLIX.id}/skips`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

// AC-F05-18: skipping Netflix's 5 November charge on golden at 2 November.
const BODY = { dueOn: "2026-11-05", changedAt: "2026-11-02T06:30:00.000Z" };
const SKIPPED = subscriptionAnswer("netflix", {
	version: 2,
	skips: ["2026-11-05"],
	nextDueOn: "2026-12-05",
});

async function skip(
	result: { current: ReturnType<typeof useSkipCharge> },
	{ body = BODY, version = 1, idempotencyKey = KEY } = {},
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: NETFLIX.id, version, body, idempotencyKey })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useSkipCharge (BR-F05-26)", () => {
	test("posts the date and change time to the skips path, with the version and the press's key", async () => {
		const seen = route(network, "post", PATH, () => ok(SKIPPED));
		const { result } = renderHookInApp(() => useSkipCharge());
		await skip(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.path).toBe(PATH);
		expect(seen[0]?.body).toEqual(BODY);
		expect(seen[0]?.headers.get("if-match")).toBe('"1"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.data).toEqual(SKIPPED);
	});

	test("a retry of the same press sends the same key (D-507)", async () => {
		const seen = route(network, "post", PATH, (_request, index) =>
			index === 0 ? HttpResponse.error() : ok(SKIPPED),
		);
		const { result } = renderHookInApp(() => useSkipCharge());
		await skip(result);
		await skip(result);
		expect(seen.map((each) => each.headers.get("idempotency-key"))).toEqual([
			KEY,
			KEY,
		]);
	});

	test("a repeated skip answered 200 counts as done", async () => {
		route(network, "post", PATH, () => ok(SKIPPED));
		const { result } = renderHookInApp(() => useSkipCharge());
		await skip(result);
		expect(result.current.isSuccess).toBe(true);
	});

	// AC-F05-18: online, the date is still to come, so no charge changes.
	test("a confirmed skip refreshes the Subscriptions only", async () => {
		route(network, "post", PATH, () => ok(SKIPPED));
		const queryClient = testClient();
		const areas = watchAreas(queryClient);
		const { result } = renderHookInApp(() => useSkipCharge(), { queryClient });
		await skip(result);
		expect(areas.fetched()).toEqual(["subscriptions"]);
		areas.stop();
	});

	// AC-F05-18
	test.each([
		["5 October, which has passed", "Only an upcoming charge can be skipped."],
		["a date that is not due", "Only an upcoming charge can be skipped."],
		[
			"a date whose charge was edited",
			"This charge was edited, so it stays. Delete it in Transactions to skip it.",
		],
	])("a 422 for %s says why, in the server's words", async (_what, message) => {
		route(network, "post", PATH, () =>
			refuse(422, "validation_failed", { fields: { dueOn: message } }),
		);
		const { result } = renderHookInApp(() => useSkipCharge());
		await skip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: false }),
		).toEqual({
			kind: "failed",
			message,
		});
	});

	test("a 409 is the error, carrying the saved Subscription", async () => {
		const saved = subscriptionAnswer("netflix", { version: 3 });
		route(network, "post", PATH, () =>
			refuse(409, "version_conflict", { details: { current: saved } }),
		);
		const { result } = renderHookInApp(() => useSkipCharge());
		await skip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: false }),
		).toEqual({
			kind: "conflict",
			current: saved,
		});
	});

	test("a 404 is the error: it was deleted on another device", async () => {
		route(network, "post", PATH, () => refuse(404, "not_found"));
		const { result } = renderHookInApp(() => useSkipCharge());
		await skip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: false }),
		).toEqual({
			kind: "gone",
			message: "This Subscription was deleted on another device.",
		});
	});

	test("a refused skip refreshes nothing", async () => {
		route(network, "post", PATH, () =>
			refuse(422, "validation_failed", { fields: { dueOn: "x" } }),
		);
		const queryClient = testClient();
		const areas = watchAreas(queryClient);
		const { result } = renderHookInApp(() => useSkipCharge(), { queryClient });
		await skip(result);
		expect(areas.fetched()).toEqual([]);
		areas.stop();
	});

	// D-241
	test("offline before M5 it is tried at once and fails, never left waiting", async () => {
		const online = offline();
		try {
			route(network, "post", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useSkipCharge());
			await skip(result);
			expect(result.current.isPaused).toBe(false);
			expect(
				readSubscriptionNoticeError(result.current.error, { undo: false }),
			).toMatchObject({
				kind: "failed",
				message:
					"The Subscription could not be saved. Check your connection and try again.",
			});
		} finally {
			online();
		}
	});
});
