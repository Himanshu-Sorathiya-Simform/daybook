import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { useViews } from "../useViews";
import { ok, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

describe("useViews (BR-F03-63)", () => {
	test("asks for the saved views", async () => {
		const seen = route(network, "get", "/api/transaction-views", () =>
			ok({ items: [], currency: "INR" }),
		);
		const { result } = renderHookInApp(() => useViews());
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual([
			"/api/transaction-views",
		]);
		expect(result.current.data).toEqual({ items: [], currency: "INR" });
	});
});
