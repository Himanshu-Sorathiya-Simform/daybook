import { waitFor } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_CATEGORIES, GOLDEN_PAYEES } from "../../lib/__tests__/fixtures";
import { usePayees } from "../usePayees";
import { ok, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

describe("usePayees (BR-F03-44)", () => {
	test("asks once for the list and the category counts", async () => {
		const seen = route(network, "get", "/api/payees", () =>
			ok({ items: GOLDEN_PAYEES, categories: GOLDEN_CATEGORIES }),
		);
		const { result } = renderHookInApp(() => {
			const dialog = usePayees();
			const field = usePayees();
			return { dialog, field };
		});
		await waitFor(() => expect(result.current.field.isSuccess).toBe(true));
		expect(seen.map((request) => request.path)).toEqual(["/api/payees"]);
		expect(result.current.dialog.data?.categories).toEqual(GOLDEN_CATEGORIES);
		expect(result.current.dialog.data?.items[0]?.payee).toBe("Swiggy");
	});
});
