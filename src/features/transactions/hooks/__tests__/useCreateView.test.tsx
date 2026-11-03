import { act, waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { viewKeys } from "../../lib/keys";
import { readViewError } from "../../lib/write-errors";
import { type ViewBody, useCreateView } from "../useCreateView";
import { ok, refuse, renderHookInApp, route, testClient, settled } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cfc";
/** F03 section 15's saved view. */
const BODY: ViewBody = {
	id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c02",
	name: "Food last month",
	filter: { range: "last_month", cat: ["food"] },
	sort: "date",
	dir: "desc",
	group: "day",
};
const SAVED = {
	...BODY,
	version: 1,
	createdAt: "2026-11-02T06:30:00.000Z",
	updatedAt: "2026-11-02T06:30:00.000Z",
	currency: "INR",
};

async function create(
	result: { current: ReturnType<typeof useCreateView> },
	body = BODY,
) {
	await act(async () => {
		await result.current
			.mutateAsync({ body, idempotencyKey: KEY })
			.catch(() => undefined);
	});
	await settled(result);
}

describe("useCreateView (BR-F03-67)", () => {
	test("posts the view with the action's key", async () => {
		const seen = route(network, "post", "/api/transaction-views", () =>
			ok(SAVED, 201),
		);
		const { result } = renderHookInApp(() => useCreateView());
		await create(result);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.body).toEqual(BODY);
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(seen[0]?.headers.get("if-match")).toBeNull();
		expect(result.current.data).toEqual(SAVED);
	});

	test("a view with amounts carries the currency (BR-F03-64)", async () => {
		const seen = route(network, "post", "/api/transaction-views", () =>
			ok(SAVED, 201),
		);
		const { result } = renderHookInApp(() => useCreateView());
		await create(result, {
			...BODY,
			filter: { minMinor: 50000 },
			currency: "INR",
		});
		expect(seen[0]?.body).toMatchObject({
			filter: { minMinor: 50000 },
			currency: "INR",
		});
	});

	test("a saved view reloads the views list", async () => {
		route(network, "post", "/api/transaction-views", () => ok(SAVED, 201));
		const queryClient = testClient();
		queryClient.setQueryData(viewKeys.list(), { items: [], currency: "INR" });
		const { result } = renderHookInApp(() => useCreateView(), { queryClient });
		await create(result);
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	// AC-F03-55
	test("a refusal reloads the views list too, since it may be stale", async () => {
		route(network, "post", "/api/transaction-views", () =>
			refuse(422, "validation_failed", {
				fields: { name: "You already have a view with this name." },
			}),
		);
		const queryClient = testClient();
		queryClient.setQueryData(viewKeys.list(), { items: [], currency: "INR" });
		const { result } = renderHookInApp(() => useCreateView(), { queryClient });
		await create(result);
		expect(readViewError(result.current.error)).toEqual({
			kind: "name",
			message: "You already have a view with this name.",
		});
		await waitFor(() =>
			expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
				true,
			),
		);
	});

	test("the 20-view limit is the error", async () => {
		route(network, "post", "/api/transaction-views", () =>
			refuse(422, "limit_reached", {
				message: "You have 20 views. Delete one to save another.",
			}),
		);
		const { result } = renderHookInApp(() => useCreateView());
		await create(result);
		expect(readViewError(result.current.error)).toEqual({
			kind: "form",
			message: "You have 20 views. Delete one to save another.",
		});
	});

	test("a failure is never retried by itself", async () => {
		const seen = route(network, "post", "/api/transaction-views", () =>
			refuse(500, "internal"),
		);
		const { result } = renderHookInApp(() => useCreateView());
		await create(result);
		expect(seen).toHaveLength(1);
	});
});
