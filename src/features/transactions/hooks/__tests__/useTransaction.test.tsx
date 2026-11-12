import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { idOf, row } from "../../lib/__tests__/fixtures";
import { useTransaction } from "../useTransaction";
import { createQueryClient } from "@/lib/api/query-client";
import { transactionKeys } from "../../lib/keys";
import { ok, refuse, renderHookInApp, route, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const ID = idOf(24);

describe("useTransaction (BR-F03-53)", () => {
	test("no id asks for nothing", async () => {
		const seen = route(network, "get", `/api/transactions/${ID}`, () =>
			ok(row()),
		);
		const { result } = renderHookInApp(() => useTransaction(null));
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toEqual([]);
		expect(result.current.fetchStatus).toBe("idle");
	});

	test("an id asks for that row", async () => {
		const seen = route(network, "get", `/api/transactions/${ID}`, () =>
			ok(row({ id: ID })),
		);
		const { result } = renderHookInApp(() => useTransaction(ID));
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
		expect(result.current.data?.id).toBe(ID);
	});

	test("a row selected later is asked for then", async () => {
		const seen = route(network, "get", `/api/transactions/${ID}`, () =>
			ok(row()),
		);
		const { result, rerender } = renderHookInApp<
			{ id: string | null },
			ReturnType<typeof useTransaction>
		>(({ id }) => useTransaction(id), { initialProps: { id: null } });
		rerender({ id: ID });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
	});

	test("a 404 is the query's error, asked once under the app's own retry rule", async () => {
		const seen = route(network, "get", `/api/transactions/${ID}`, () =>
			refuse(404, "not_found"),
		);
		const { result } = renderHookInApp(() => useTransaction(ID), {
			queryClient: createQueryClient(),
		});
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.error).toMatchObject({ status: 404 });
		expect(seen).toHaveLength(1);
	});

	test("a row the panel already has from a write is not asked for again", async () => {
		const seen = route(network, "get", `/api/transactions/${ID}`, () =>
			ok(row()),
		);
		const queryClient = testClient();
		queryClient.setQueryData(transactionKeys.detail(ID), row({ id: ID }));
		const { result } = renderHookInApp(() => useTransaction(ID), {
			queryClient,
		});
		expect(result.current.data?.id).toBe(ID);
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(seen).toEqual([]);
	});
});
