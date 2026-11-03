import { act, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { idOf, row } from "../../lib/__tests__/fixtures";
import { transactionKeys } from "../../lib/keys";
import { readDeleteError } from "../../lib/write-errors";
import { useDeleteTransaction } from "../useDeleteTransaction";
import { refuse, renderHookInApp, route, testClient, settled } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = idOf(24);
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfd";
const PATH = `/api/transactions/${ID}`;
const LIST = transactionKeys.list({}, { sort: "date", dir: "desc", group: "day" });
const gone = () => new HttpResponse(null, { status: 204 });

type Result = { current: ReturnType<typeof useDeleteTransaction> };

async function remove(
	result: Result,
	extra: { hint?: object; version?: number } = {},
) {
	await act(async () => {
		await result.current
			.mutateAsync({
				id: ID,
				version: extra.version ?? 1,
				idempotencyKey: KEY,
				...(extra.hint ? { hint: extra.hint as never } : {}),
			})
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useDeleteTransaction (BR-F03-26)", () => {
	test("deletes at its version with an empty body and the action's key", async () => {
		const seen = route(network, "delete", PATH, gone);
		const { result } = renderHookInApp(() => useDeleteTransaction());
		await remove(result, { version: 3 });
		expect(seen).toHaveLength(1);
		expect(seen[0]?.method).toBe("DELETE");
		expect(seen[0]?.body).toEqual({});
		expect(seen[0]?.headers.get("if-match")).toBe('"3"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.isSuccess).toBe(true);
	});

	test("a charge's delete carries its hint (BR-F03-17)", async () => {
		const seen = route(network, "delete", PATH, gone);
		const { result } = renderHookInApp(() => useDeleteTransaction());
		const hint = {
			subscriptionId: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c99",
			dueOn: "2026-10-10",
		};
		await remove(result, { hint });
		expect(seen[0]?.body).toEqual(hint);
	});

	test("a confirmed delete drops the row's query and refreshes the rest", async () => {
		route(network, "delete", PATH, gone);
		const queryClient = testClient();
		queryClient.setQueryData(transactionKeys.detail(ID), row({ id: ID }));
		queryClient.setQueryData(LIST, { pages: [], pageParams: [] });
		queryClient.setQueryData([QUERY_ROOTS.profile], { seeded: true });
		const { result } = renderHookInApp(() => useDeleteTransaction(), {
			queryClient,
		});
		await remove(result);
		await waitFor(() =>
			expect(
				queryClient.getQueryState(transactionKeys.detail(ID)),
			).toBeUndefined(),
		);
		expect(queryClient.getQueryState(LIST)?.isInvalidated).toBe(true);
		expect(queryClient.getQueryState([QUERY_ROOTS.profile])?.isInvalidated).toBe(
			true,
		);
	});

	// D-239, BR-F03-25
	test("a 404 counts as done, with no error, and the row's query goes", async () => {
		route(network, "delete", PATH, () => refuse(404, "not_found"));
		const queryClient = testClient();
		queryClient.setQueryData(transactionKeys.detail(ID), row({ id: ID }));
		const { result } = renderHookInApp(() => useDeleteTransaction(), {
			queryClient,
		});
		await remove(result);
		expect(result.current.isSuccess).toBe(true);
		expect(result.current.error).toBeNull();
		await waitFor(() =>
			expect(
				queryClient.getQueryState(transactionKeys.detail(ID)),
			).toBeUndefined(),
		);
	});

	// AC-F03-30
	test("a 409 is the error, with the row as it is now", async () => {
		const current = row({ id: ID, version: 2 });
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result } = renderHookInApp(() => useDeleteTransaction());
		await remove(result);
		expect(readDeleteError(result.current.error)).toEqual({
			kind: "conflict",
			current,
		});
	});

	test("no answer is the error that brings the row back with the connection message", async () => {
		route(network, "delete", PATH, () => HttpResponse.error());
		const { result } = renderHookInApp(() => useDeleteTransaction());
		await remove(result);
		expect(readDeleteError(result.current.error)).toEqual({
			kind: "refused",
			message: "Couldn't delete. Check your connection and try again.",
		});
	});

	test("a refused delete leaves every cached read alone", async () => {
		route(network, "delete", PATH, () =>
			refuse(422, "validation_failed", { fields: { amountMinor: "m" } }),
		);
		const queryClient = testClient();
		const before = row({ id: ID });
		queryClient.setQueryData(transactionKeys.detail(ID), before);
		queryClient.setQueryData(LIST, { pages: [], pageParams: [] });
		const { result } = renderHookInApp(() => useDeleteTransaction(), {
			queryClient,
		});
		await remove(result);
		expect(queryClient.getQueryData(transactionKeys.detail(ID))).toEqual(before);
		expect(queryClient.getQueryState(LIST)?.isInvalidated).toBe(false);
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "delete", PATH, () => refuse(500, "internal"));
		const { result } = renderHookInApp(() => useDeleteTransaction());
		await remove(result);
		expect(seen).toHaveLength(1);
	});
});
