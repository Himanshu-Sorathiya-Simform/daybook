import { act } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { idOf, row } from "../../lib/__tests__/fixtures";
import { transactionKeys } from "../../lib/keys";
import { readWriteError } from "../../lib/write-errors";
import { useEditTransaction } from "../useEditTransaction";
import { ok, refuse, renderHookInApp, route, testClient, settled } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = idOf(21);
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfe";
const PATH = `/api/transactions/${ID}`;
const EDITED = row({ id: ID, amountMinor: 310000, version: 2 });
const EDIT = { mode: "edit", dateLocale: "en-IN", today: "2026-11-02" } as const;

async function edit(
	result: { current: ReturnType<typeof useEditTransaction> },
	version = 1,
) {
	await act(async () => {
		await result.current
			.mutateAsync({
				id: ID,
				version,
				changes: { amountMinor: 310000, currency: "INR" },
				idempotencyKey: KEY,
			})
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useEditTransaction (BR-F03-23)", () => {
	test("patches only the changes, at its version, with the action's key", async () => {
		const seen = route(network, "patch", PATH, () => ok(EDITED));
		const { result } = renderHookInApp(() => useEditTransaction());
		await edit(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe("PATCH");
		expect(seen[0]?.body).toEqual({ amountMinor: 310000, currency: "INR" });
		expect(seen[0]?.headers.get("if-match")).toBe('"1"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
	});

	test("sends the version it was given", async () => {
		const seen = route(network, "patch", PATH, () => ok(EDITED));
		const { result } = renderHookInApp(() => useEditTransaction());
		await edit(result, 7);
		expect(seen[0]?.headers.get("if-match")).toBe('"7"');
	});

	test("the date and time travel together when given", async () => {
		const seen = route(network, "patch", PATH, () => ok(EDITED));
		const { result } = renderHookInApp(() => useEditTransaction());
		await act(() =>
			result.current.mutateAsync({
				id: ID,
				version: 1,
				changes: {
					occurredAt: "2026-10-14T14:00:00Z",
					occurredOn: "2026-10-14",
				},
				idempotencyKey: KEY,
			}),
		);
		expect(seen[0]?.body).toEqual({
			occurredAt: "2026-10-14T14:00:00Z",
			occurredOn: "2026-10-14",
		});
	});

	test("a confirmed edit sets the row from the answer, and leaves the profile alone", async () => {
		route(network, "patch", PATH, () => ok(EDITED));
		const queryClient = testClient();
		queryClient.setQueryData(transactionKeys.detail(ID), row({ id: ID }));
		queryClient.setQueryData([QUERY_ROOTS.profile], { seeded: true });
		const { result } = renderHookInApp(() => useEditTransaction(), {
			queryClient,
		});
		await edit(result);
		expect(queryClient.getQueryData(transactionKeys.detail(ID))).toEqual(EDITED);
		expect(queryClient.getQueryState([QUERY_ROOTS.profile])?.isInvalidated).toBe(
			false,
		);
	});

	// AC-F03-19
	test("a 409 is the error, carrying the row as it is now for the conflict view", async () => {
		const current = row({ id: ID, amountMinor: 310000, version: 2 });
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result } = renderHookInApp(() => useEditTransaction());
		await edit(result);
		expect(readWriteError(result.current.error, EDIT)).toEqual({
			kind: "conflict",
			current,
		});
	});

	// BR-F03-25
	test("a 404 is the error that says the row was deleted elsewhere", async () => {
		route(network, "patch", PATH, () => refuse(404, "not_found"));
		const { result } = renderHookInApp(() => useEditTransaction());
		await edit(result);
		expect(readWriteError(result.current.error, EDIT)).toEqual({
			kind: "gone",
			message: "This Transaction was deleted on another device.",
		});
	});

	test("a refused edit leaves the cached row as it was", async () => {
		route(network, "patch", PATH, () =>
			refuse(422, "validation_failed", { fields: { amountMinor: "m" } }),
		);
		const queryClient = testClient();
		const before = row({ id: ID });
		queryClient.setQueryData(transactionKeys.detail(ID), before);
		const { result } = renderHookInApp(() => useEditTransaction(), {
			queryClient,
		});
		await edit(result);
		expect(queryClient.getQueryData(transactionKeys.detail(ID))).toEqual(before);
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "patch", PATH, () => refuse(500, "internal"));
		const { result } = renderHookInApp(() => useEditTransaction());
		await edit(result);
		expect(seen).toHaveLength(1);
	});
});
