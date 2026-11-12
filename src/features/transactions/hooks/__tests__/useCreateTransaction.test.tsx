import { act, waitFor } from "@testing-library/react";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import type { TransactionCreateInput } from "@/lib/transactions/schemas";
import { row } from "../../lib/__tests__/fixtures";
import { payeeKeys, transactionKeys, viewKeys } from "../../lib/keys";
import { useCreateTransaction } from "../useCreateTransaction";
import { ok, refuse, renderHookInApp, route, settled, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const KEY = "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1cff";

/** F03 section 15's create request. */
const BODY: TransactionCreateInput = {
	id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c01",
	type: "expense",
	amountMinor: 64000,
	currency: "INR",
	occurredAt: "2026-10-19T16:45:00Z",
	occurredOn: "2026-10-19",
	createdAt: "2026-10-19T16:46:12Z",
	category: "food",
	payee: "Swiggy",
	description: null,
	note: null,
};
const SAVED = row({ id: BODY.id });
const LIST = transactionKeys.list({}, { sort: "date", dir: "desc", group: "day" });

describe("useCreateTransaction (BR-F03-20)", () => {
	test("posts the body with the action's Idempotency-Key", async () => {
		const seen = route(network, "post", "/api/transactions", () =>
			ok(SAVED, 201),
		);
		const { result } = renderHookInApp(() => useCreateTransaction());
		await act(() =>
			result.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
		);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.path).toBe("/api/transactions");
		expect(seen[0]?.body).toEqual(BODY);
		expect(seen[0]?.headers.get("idempotency-key")).toBe(KEY);
		expect(seen[0]?.headers.get("content-type")).toBe("application/json");
		expect(seen[0]?.headers.get("if-match")).toBeNull();
	});

	test("answers the saved row", async () => {
		route(network, "post", "/api/transactions", () => ok(SAVED, 201));
		const { result } = renderHookInApp(() => useCreateTransaction());
		const saved = await act(() =>
			result.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
		);
		expect(saved).toEqual(SAVED);
	});

	// AC-F03-05: a retry of the same create answers 200 with the row
	test("a 200 for an id already saved is a success too", async () => {
		route(network, "post", "/api/transactions", () => ok(SAVED, 200));
		const { result } = renderHookInApp(() => useCreateTransaction());
		await act(() =>
			result.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
		);
		await settled(result);
		expect(result.current.isSuccess).toBe(true);
	});

	test("a confirmed create sets the row's query and refreshes the rest (section 12)", async () => {
		route(network, "post", "/api/transactions", () => ok(SAVED, 201));
		const queryClient = testClient();
		queryClient.setQueryData(LIST, { pages: [], pageParams: [] });
		queryClient.setQueryData(payeeKeys.list(), { items: [] });
		queryClient.setQueryData([QUERY_ROOTS.profile], { seeded: true });
		queryClient.setQueryData(viewKeys.list(), { items: [] });
		const { result } = renderHookInApp(() => useCreateTransaction(), {
			queryClient,
		});
		await act(() =>
			result.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
		);
		expect(queryClient.getQueryData(transactionKeys.detail(BODY.id))).toEqual(
			SAVED,
		);
		await waitFor(() =>
			expect(queryClient.getQueryState(LIST)?.isInvalidated).toBe(true),
		);
		expect(queryClient.getQueryState(payeeKeys.list())?.isInvalidated).toBe(
			true,
		);
		expect(queryClient.getQueryState([QUERY_ROOTS.profile])?.isInvalidated).toBe(
			true,
		);
		expect(queryClient.getQueryState(viewKeys.list())?.isInvalidated).toBe(
			false,
		);
	});

	test("the dialog closes on the answer, without waiting for the refetches (flow 7.1)", async () => {
		route(network, "post", "/api/transactions", () => ok(SAVED, 201));
		// A list whose refetch never answers.
		route(
			network,
			"get",
			"/api/transactions",
			() => new Promise<Response>(() => {}),
		);
		const queryClient = testClient();
		const { result } = renderHookInApp(
			() => {
				const create = useCreateTransaction();
				return create;
			},
			{ queryClient },
		);
		const { QueryObserver } = await import("@tanstack/react-query");
		const observer = new QueryObserver(queryClient, {
			queryKey: LIST,
			queryFn: () => new Promise(() => {}),
		});
		const stop = observer.subscribe(() => {});
		const saved = await act(() =>
			result.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
		);
		expect(saved).toEqual(SAVED);
		stop();
	});

	test("a refusal is the mutation's error, with the field messages", async () => {
		route(network, "post", "/api/transactions", () =>
			refuse(422, "validation_failed", {
				fields: { payee: "Enter who you paid, or who paid you." },
			}),
		);
		const { result } = renderHookInApp(() => useCreateTransaction());
		await act(async () => {
			await result.current
				.mutateAsync({ body: BODY, idempotencyKey: KEY })
				.catch(() => undefined);
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toBeInstanceOf(ApiRequestError);
		expect(result.current.error).toMatchObject({
			status: 422,
			fields: { payee: "Enter who you paid, or who paid you." },
		});
	});

	test.each([
		["a 500", () => refuse(500, "internal")],
		["a 503", () => refuse(503, "timeout")],
		["no answer", () => HttpResponse.error()],
	])("%s is never retried by itself (D-507)", async (_name, answer) => {
		const seen = route(network, "post", "/api/transactions", answer);
		const { result } = renderHookInApp(() => useCreateTransaction());
		await act(async () => {
			await result.current
				.mutateAsync({ body: BODY, idempotencyKey: KEY })
				.catch(() => undefined);
		});
		expect(seen).toHaveLength(1);
	});

	test("a refused create changes no cached read", async () => {
		route(network, "post", "/api/transactions", () =>
			refuse(422, "currency_mismatch"),
		);
		const queryClient = testClient();
		queryClient.setQueryData(LIST, { pages: [], pageParams: [] });
		const { result } = renderHookInApp(() => useCreateTransaction(), {
			queryClient,
		});
		await act(async () => {
			await result.current
				.mutateAsync({ body: BODY, idempotencyKey: KEY })
				.catch(() => undefined);
		});
		expect(queryClient.getQueryState(LIST)?.isInvalidated).toBe(false);
		expect(
			queryClient.getQueryData(transactionKeys.detail(BODY.id)),
		).toBeUndefined();
	});

	test("Save again after a failure, with the same key, sends that key", async () => {
		const seen = route(
			network,
			"post",
			"/api/transactions",
			(_request, index) =>
				index === 0 ? refuse(503, "timeout") : ok(SAVED, 201),
		);
		const { result } = renderHookInApp(() => useCreateTransaction());
		await act(async () => {
			await result.current
				.mutateAsync({ body: BODY, idempotencyKey: KEY })
				.catch(() => undefined);
		});
		await act(() =>
			result.current.mutateAsync({ body: BODY, idempotencyKey: KEY }),
		);
		expect(
			seen.map((request) => request.headers.get("idempotency-key")),
		).toEqual([KEY, KEY]);
	});
});
