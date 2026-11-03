import { act, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { viewKeys } from "../../lib/keys";
import { readViewError } from "../../lib/write-errors";
import { useDeleteView } from "../useDeleteView";
import { refuse, renderHookInApp, route, testClient, settled } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02";
const PATH = `/api/transaction-views/${ID}`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfa";

async function remove(result: { current: ReturnType<typeof useDeleteView> }) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: ID, version: 2, idempotencyKey: KEY })
			.catch(() => undefined);
	});
	await settled(result);
}

function seededClient() {
	const queryClient = testClient();
	queryClient.setQueryData(viewKeys.list(), { items: [], currency: "INR" });
	return queryClient;
}

describe("useDeleteView (BR-F03-69)", () => {
	test("deletes at its version with an empty body", async () => {
		const seen = route(
			network,
			"delete",
			PATH,
			() => new HttpResponse(null, { status: 204 }),
		);
		const { result } = renderHookInApp(() => useDeleteView());
		await remove(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.body).toEqual({});
		expect(seen[0]?.headers.get("if-match")).toBe('"2"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(result.current.isSuccess).toBe(true);
	});

	// AC-F03-55: a 404 on Delete removes the view with "View deleted."
	test("a 404 counts as done", async () => {
		route(network, "delete", PATH, () => refuse(404, "not_found"));
		const queryClient = seededClient();
		const { result } = renderHookInApp(() => useDeleteView(), { queryClient });
		await remove(result);
		expect(result.current.isSuccess).toBe(true);
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	test("a 409 is the error, and the list reloads", async () => {
		route(network, "delete", PATH, () => refuse(409, "version_conflict"));
		const queryClient = seededClient();
		const { result } = renderHookInApp(() => useDeleteView(), { queryClient });
		await remove(result);
		expect(readViewError(result.current.error)).toMatchObject({
			kind: "stale",
			message: "This view changed on another device. Try again.",
		});
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	test("success reloads the views list", async () => {
		route(
			network,
			"delete",
			PATH,
			() => new HttpResponse(null, { status: 204 }),
		);
		const queryClient = seededClient();
		const { result } = renderHookInApp(() => useDeleteView(), { queryClient });
		await remove(result);
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	test("no answer is the error, never retried", async () => {
		const seen = route(network, "delete", PATH, () => HttpResponse.error());
		const { result } = renderHookInApp(() => useDeleteView());
		await remove(result);
		expect(result.current.isError).toBe(true);
		expect(seen).toHaveLength(1);
	});
});
