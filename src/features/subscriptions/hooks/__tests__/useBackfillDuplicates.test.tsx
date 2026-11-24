import { act, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, test } from "vitest";

import { GOLDEN_BLOCK, meFor } from "@/components/app/__tests__/helpers";
import { ME_KEY } from "@/lib/api/me";
import { subscriptionKeys } from "../../lib/keys";
import { charge, listPage } from "../../lib/__tests__/fixtures";
import { useBackfillDuplicates } from "../useBackfillDuplicates";
import {
	ok,
	refuse,
	renderHookInApp,
	route,
	testClient,
	url,
	testNetwork,
} from "./helpers";

const network = testNetwork();

type Args = { name: string; from: string; to: string };

// Flow 7.1: Netflix from 5 Sep 2025, with the period running to 1 November 2026.
const NETFLIX: Args = { name: "Netflix", from: "2025-09-05", to: "2026-11-01" };

const manual = (changes: Parameters<typeof charge>[0] = {}) =>
	charge({
		source: "manual",
		subscriptionId: null,
		subscription: null,
		dueOn: null,
		...changes,
	});

/** A client that already knows the profile, as it does on any logged-in page. */
function clientFor(currency: "INR" | "JPY" | "KWD" | null = "INR") {
	const queryClient = testClient();
	queryClient.setQueryData(
		ME_KEY,
		meFor("u1", currency === null ? null : { ...GOLDEN_BLOCK, currency }),
	);
	return queryClient;
}

const render = (args: Args, queryClient = clientFor()) =>
	renderHookInApp((props: Args) => useBackfillDuplicates(props), {
		initialProps: args,
		queryClient,
	});

/** An enabled query is fetching as soon as it mounts or its inputs change, inside the act of
 * the render, so a query that is idle now was never going to fetch. */
async function stayedIdle(result: { current: { fetchStatus: string } }) {
	await act(async () => {});
	expect(result.current.fetchStatus).toBe("idle");
}

describe("useBackfillDuplicates (BR-F05-04, BR-F05-48)", () => {
	// AC-F05-33: the note names 5 Sep and 5 Oct and leaves out "Netflix Premium".
	test("reads the expenses of the period and keeps those whose payee is the name", async () => {
		const sep = manual({ occurredOn: "2026-09-05" });
		const oct = manual({ occurredOn: "2026-10-05" });
		const premium = manual({
			payee: "Netflix Premium",
			occurredOn: "2026-10-20",
		});
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([oct, premium, sep])),
		);
		const { result, queryClient } = render(NETFLIX);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([oct, sep]);
		expect(seen).toHaveLength(1);
		expect(seen[0]?.path).toBe(
			"/api/transactions?from=2025-09-05&to=2026-11-01&type=expense&q=Netflix&group=none&limit=100",
		);
		expect(
			queryClient.getQueryData(
				subscriptionKeys.duplicates("Netflix", "2025-09-05", "2026-11-01"),
			),
		).toEqual([oct, sep]);
	});

	test("matches the payee as typed in another case", async () => {
		const row = manual({ payee: "NETFLIX" });
		route(network, "get", "/api/transactions", () => ok(listPage([row])));
		const { result } = render({ ...NETFLIX, name: "netflix" });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([row]);
	});

	test("reads the name as it is stored: trimmed", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const { result } = render({ ...NETFLIX, name: "  Netflix  " });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toContain("&q=Netflix&");
	});

	test("no expense in the period is an empty list", async () => {
		route(network, "get", "/api/transactions", () => ok(listPage([])));
		const { result } = render(NETFLIX);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([]);
	});

	// AC-F05-33: a name of "TV" or "99" reads no duplicates and shows no note.
	describe("reads nothing", () => {
		test.each(["TV", "AC", "ab", "99", "100", "1,000", "", "   "])(
			"for the name %j, which F03 cannot search as text",
			async (name) => {
				const seen = route(network, "get", "/api/transactions", () =>
					ok(listPage([])),
				);
				const { result } = render({ ...NETFLIX, name });
				await stayedIdle(result);
				expect(seen).toHaveLength(0);
				expect(result.current.data).toBeUndefined();
			},
		);

		test("before the profile's currency is known, which decides what counts as a number", async () => {
			const seen = route(network, "get", "/api/transactions", () =>
				ok(listPage([])),
			);
			const queryClient = testClient();
			// A /api/me that never answers, as before it has loaded.
			network.use(http.get(url("/api/me"), () => new Promise(() => {})));
			const { result } = render(NETFLIX, queryClient);
			await stayedIdle(result);
			expect(seen).toHaveLength(0);
		});

		test("with no profile at all", async () => {
			const seen = route(network, "get", "/api/transactions", () =>
				ok(listPage([])),
			);
			const { result } = render(NETFLIX, clientFor(null));
			await stayedIdle(result);
			expect(seen).toHaveLength(0);
		});

		test("when the period has no day in it: a start date after yesterday", async () => {
			const seen = route(network, "get", "/api/transactions", () =>
				ok(listPage([])),
			);
			const { result } = render({
				name: "Netflix",
				from: "2026-11-02",
				to: "2026-11-01",
			});
			await stayedIdle(result);
			expect(seen).toHaveLength(0);
		});
	});

	test("a period of one day is read", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const { result } = render({
			name: "Netflix",
			from: "2026-11-01",
			to: "2026-11-01",
		});
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen[0]?.path).toContain("from=2026-11-01&to=2026-11-01");
	});

	test("what counts as a number follows the currency: 12.5 is text in yen", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const yen = render({ ...NETFLIX, name: "12.5" }, clientFor("JPY"));
		await waitFor(() => expect(yen.result.current.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
		const rupees = render({ ...NETFLIX, name: "12.5" }, clientFor("INR"));
		await stayedIdle(rupees.result);
		expect(seen).toHaveLength(1);
	});

	test("typing on reads again for the new name, and starts nothing for one that is too short", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const { result, rerender } = render({ ...NETFLIX, name: "Net" });
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(seen).toHaveLength(1);
		rerender({ ...NETFLIX, name: "Netf" });
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toContain("&q=Netf&");
		rerender({ ...NETFLIX, name: "Ne" });
		await stayedIdle(result);
		expect(seen).toHaveLength(2);
	});

	test("moving the start date reads the new period", async () => {
		const seen = route(network, "get", "/api/transactions", () =>
			ok(listPage([])),
		);
		const { result, rerender } = render(NETFLIX);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		rerender({ ...NETFLIX, from: "2026-01-05" });
		await waitFor(() => expect(seen).toHaveLength(2));
		expect(seen[1]?.path).toContain("from=2026-01-05&to=2026-11-01");
	});

	test("finds a duplicate on a later page", async () => {
		const early = manual({ occurredOn: "2025-09-05" });
		route(network, "get", "/api/transactions", (_request, index) =>
			ok(
				index === 0 ?
					listPage([manual({ payee: "Netflix Gift" })], "next")
				:	listPage([early]),
			),
		);
		const { result } = render(NETFLIX);
		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toEqual([early]);
	});

	test("a failed read is an error, so the note shows nothing", async () => {
		route(network, "get", "/api/transactions", () => refuse(500, "internal"));
		const { result } = render(NETFLIX);
		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.data).toBeUndefined();
	});
});
