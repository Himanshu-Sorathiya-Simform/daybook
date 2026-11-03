import { act, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { viewKeys } from "../../lib/keys";
import { readViewError } from "../../lib/write-errors";
import { useEditView, type ViewChanges } from "../useEditView";
import { ok, refuse, renderHookInApp, route, testClient, settled } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02";
const PATH = `/api/transaction-views/${ID}`;
const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfb";
const VIEW = {
	id: ID,
	name: "Food",
	filter: { cat: ["food"] },
	sort: "date",
	dir: "desc",
	group: "day",
	version: 2,
	createdAt: "2026-11-02T06:30:00.000Z",
	updatedAt: "2026-11-02T06:40:00.000Z",
	currency: "INR",
};

async function edit(
	result: { current: ReturnType<typeof useEditView> },
	changes: ViewChanges,
	version = 1,
) {
	await act(async () => {
		await result.current
			.mutateAsync({ id: ID, version, changes, idempotencyKey: KEY })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useEditView (BR-F03-68, BR-F03-69)", () => {
	test("a rename patches the name alone at its version", async () => {
		const seen = route(network, "patch", PATH, () => ok(VIEW));
		const { result } = renderHookInApp(() => useEditView());
		await edit(result, { name: "Food" }, 4);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.body).toEqual({ name: "Food" });
		expect(seen[0]?.headers.get("if-match")).toBe('"4"');
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
	});

	test("Update view patches the four list fields together", async () => {
		const seen = route(network, "patch", PATH, () => ok(VIEW));
		const { result } = renderHookInApp(() => useEditView());
		const changes: ViewChanges = {
			filter: { range: "last_month", cat: ["food"] },
			sort: "date",
			dir: "desc",
			group: "payee",
		};
		await edit(result, changes);
		expect(seen[0]?.body).toEqual(changes);
	});

	test("success reloads the views list", async () => {
		route(network, "patch", PATH, () => ok(VIEW));
		const queryClient = testClient();
		queryClient.setQueryData(viewKeys.list(), { items: [], currency: "INR" });
		const { result } = renderHookInApp(() => useEditView(), { queryClient });
		await edit(result, { name: "Food" });
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	// AC-F03-55
	test("a 409 says the view changed, and the list reloads", async () => {
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current: VIEW } }),
		);
		const queryClient = testClient();
		queryClient.setQueryData(viewKeys.list(), { items: [], currency: "INR" });
		const { result } = renderHookInApp(() => useEditView(), { queryClient });
		await edit(result, { name: "Food" });
		expect(readViewError(result.current.error)).toEqual({
			kind: "stale",
			message: "This view changed on another device. Try again.",
			current: VIEW,
		});
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	// AC-F03-55
	test("a 404 says the view was deleted, and the list reloads", async () => {
		route(network, "patch", PATH, () => refuse(404, "not_found"));
		const queryClient = testClient();
		queryClient.setQueryData(viewKeys.list(), { items: [], currency: "INR" });
		const { result } = renderHookInApp(() => useEditView(), { queryClient });
		await edit(result, { name: "Food" });
		expect(readViewError(result.current.error)).toMatchObject({
			kind: "stale",
			message: "This view was deleted on another device.",
		});
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});
});
