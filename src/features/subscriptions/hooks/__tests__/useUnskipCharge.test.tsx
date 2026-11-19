import { act } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { subscriptionAnswer } from "../../lib/__tests__/fixtures";
import { readSubscriptionNoticeError } from "../../lib/write-errors";
import { useUnskipCharge } from "../useUnskipCharge";
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
const PATH = `/api/subscriptions/${NETFLIX.id}/skips/2026-11-05`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";

// AC-F05-18: Undo skip on 3 November brings 5 November back.
const BODY = { changedAt: "2026-11-03T06:30:00.000Z" };
const BACK = subscriptionAnswer("netflix", { version: 3 });

async function unskip(
	result: { current: ReturnType<typeof useUnskipCharge> },
	{ dueOn = "2026-11-05", version = 2, body = BODY, idempotencyKey = KEY } = {},
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: NETFLIX.id, dueOn, version, body, idempotencyKey })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useUnskipCharge (BR-F05-27)", () => {
	test("deletes the date's skip with the version, the change time and the press's key", async () => {
		const seen = route(network, "delete", PATH, () => ok(BACK));
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe("DELETE");
		expect(seen[0]?.path).toBe(PATH);
		expect(seen[0]?.body).toEqual(BODY);
		expect(seen[0]?.headers.get("if-match")).toBe('"2"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.data).toEqual(BACK);
	});

	test("the date is in the path, whatever it is", async () => {
		const seen = route(
			network,
			"delete",
			`/api/subscriptions/${NETFLIX.id}/skips/2027-01-05`,
			() => ok(BACK),
		);
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result, { dueOn: "2027-01-05" });
		expect(seen[0]?.path).toBe(
			`/api/subscriptions/${NETFLIX.id}/skips/2027-01-05`,
		);
	});

	test("a retry of the same press sends the same key (D-507)", async () => {
		const seen = route(network, "delete", PATH, (_request, index) =>
			index === 0 ? HttpResponse.error() : ok(BACK),
		);
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		await unskip(result);
		expect(seen.map((each) => each.headers.get("idempotency-key"))).toEqual([
			KEY,
			KEY,
		]);
	});

	test("a date with no tombstone answered 200 counts as done", async () => {
		route(network, "delete", PATH, () => ok(BACK));
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		expect(result.current.isSuccess).toBe(true);
	});

	// AC-F05-18: online, the date is still to come, so no charge changes.
	test("a confirmed Undo skip refreshes the Subscriptions only", async () => {
		route(network, "delete", PATH, () => ok(BACK));
		const queryClient = testClient();
		const areas = watchAreas(queryClient);
		const { result } = renderHookInApp(() => useUnskipCharge(), { queryClient });
		await unskip(result);
		expect(areas.fetched()).toEqual(["subscriptions"]);
		areas.stop();
	});

	// AC-F05-18: Undo skip on 5 November returns 422.
	test("a 422 for a date that has passed says it can't be brought back", async () => {
		route(network, "delete", PATH, () =>
			refuse(422, "validation_failed", {
				fields: {
					dueOn: "This charge date has passed, so it can't be brought back.",
				},
			}),
		);
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: false }),
		).toEqual({
			kind: "failed",
			message: "This charge date has passed, so it can't be brought back.",
		});
	});

	test("the Undo of a skip that a 422 refuses reads that it can't be undone any more", async () => {
		route(network, "delete", PATH, () =>
			refuse(422, "validation_failed", {
				fields: {
					dueOn: "This charge date has passed, so it can't be brought back.",
				},
			}),
		);
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: true }),
		).toEqual({
			kind: "failed",
			message: "This change can't be undone any more.",
		});
	});

	test("a 409 is the error, carrying the saved Subscription", async () => {
		const saved = subscriptionAnswer("netflix", { version: 5 });
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", { details: { current: saved } }),
		);
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: false }),
		).toEqual({
			kind: "conflict",
			current: saved,
		});
	});

	test("a 404 is the error: it was deleted on another device", async () => {
		route(network, "delete", PATH, () => refuse(404, "not_found"));
		const { result } = renderHookInApp(() => useUnskipCharge());
		await unskip(result);
		expect(
			readSubscriptionNoticeError(result.current.error, { undo: false }),
		).toEqual({
			kind: "gone",
			message: "This Subscription was deleted on another device.",
		});
	});

	test("a refused Undo skip refreshes nothing", async () => {
		route(network, "delete", PATH, () =>
			refuse(422, "validation_failed", { fields: { dueOn: "x" } }),
		);
		const queryClient = testClient();
		const areas = watchAreas(queryClient);
		const { result } = renderHookInApp(() => useUnskipCharge(), { queryClient });
		await unskip(result);
		expect(areas.fetched()).toEqual([]);
		areas.stop();
	});

	// D-241
	test("offline before M5 it is tried at once and fails, never left waiting", async () => {
		const online = offline();
		try {
			route(network, "delete", PATH, () => HttpResponse.error());
			const { result } = renderHookInApp(() => useUnskipCharge());
			await unskip(result);
			expect(result.current.isPaused).toBe(false);
			expect(result.current.isError).toBe(true);
		} finally {
			online();
		}
	});
});
