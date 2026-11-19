import { QueryObserver } from "@tanstack/react-query";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { type ReactNode, StrictMode } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { createQueryClient } from "@/lib/api/query-client";
import { QUERY_ROOTS } from "@/lib/api/query-keys";
import { onApiEvent } from "@/lib/api/events";
import type { CatchUpAnswer } from "@/lib/subscriptions/answers";
import { useBootCatchUp } from "../useBootCatchUp";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const url = (path: string) => new URL(path, window.location.origin).toString();

const connection = (online: boolean) =>
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
const flip = (online: boolean) => {
	connection(online);
	act(() => {
		window.dispatchEvent(new Event(online ? "online" : "offline"));
	});
};

/** Puts `data` under `queryKey` and watches it like a mounted page, counting the fetches it
 * makes from now on. */
function watched(
	queryClient: ReturnType<typeof createQueryClient>,
	queryKey: readonly unknown[],
	data: unknown,
) {
	let fetches = 0;
	queryClient.setQueryData(queryKey, data);
	new QueryObserver(queryClient, {
		queryKey,
		queryFn: () => {
			fetches += 1;
			return { refetched: true };
		},
		staleTime: Infinity,
	}).subscribe(() => {});
	return { fetches: () => fetches };
}

type Call = { headers: Headers; body: unknown };

/** Answers `POST /api/sync/catch-up` with `respond` and records each call. */
function serve(respond: (index: number) => Response | Promise<Response>) {
	const calls: Call[] = [];
	network.use(
		http.post(url("/api/sync/catch-up"), async ({ request }) => {
			calls.push({
				headers: request.headers,
				body: JSON.parse(await request.text()) as unknown,
			});
			return respond(calls.length - 1);
		}),
	);
	return calls;
}

const answer = (changes: Partial<CatchUpAnswer> = {}) =>
	HttpResponse.json({
		data: {
			skipped: false,
			chargesCreated: 0,
			pricesUpdated: false,
			...changes,
		},
	});

function mount() {
	const queryClient = createQueryClient();
	const wrapper = ({ children }: { children: ReactNode }) => (
		<AppProviders
			navigate={vi.fn()}
			queryClient={queryClient}
		>
			{children}
		</AppProviders>
	);
	const view = renderHook(() => useBootCatchUp(), { wrapper });
	return { ...view, queryClient };
}

function Probe() {
	useBootCatchUp();
	return null;
}

/** Lets a call that was going to be sent have gone out. */
const idle = () => act(() => new Promise((resolve) => setTimeout(resolve, 40)));

describe("useBootCatchUp (root 5.2 step 5, F05 flow 7.2)", () => {
	// AC-F05-03
	test("calls the boot endpoint once when the app starts online, with an empty body", async () => {
		connection(true);
		const calls = serve(() => answer());
		mount();
		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.body).toEqual({});
		await idle();
		expect(calls).toHaveLength(1);
	});

	test("sends it as a POST to /api/sync/catch-up with no If-Match", async () => {
		connection(true);
		const calls = serve(() => answer());
		mount();
		await waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.headers.get("if-match")).toBeNull();
	});

	test("a re-render calls nothing more", async () => {
		connection(true);
		const calls = serve(() => answer());
		const { rerender } = mount();
		await waitFor(() => expect(calls).toHaveLength(1));
		rerender();
		rerender();
		await idle();
		expect(calls).toHaveLength(1);
	});

	// React runs a mounted effect twice in Strict Mode, which `renderHook` does not do, so this
	// renders the hook's caller, as the shell is.
	test("Strict Mode's second run of the effect calls nothing more", async () => {
		connection(true);
		const calls = serve(() => answer());
		render(
			<StrictMode>
				<AppProviders
					navigate={vi.fn()}
					queryClient={createQueryClient()}
				>
					<Probe />
				</AppProviders>
			</StrictMode>,
		);
		await waitFor(() => expect(calls).toHaveLength(1));
		await idle();
		expect(calls).toHaveLength(1);
	});

	test("started offline, it calls nothing", async () => {
		connection(false);
		const calls = serve(() => answer());
		mount();
		await idle();
		expect(calls).toHaveLength(0);
	});

	test("started offline, it calls once the app comes back online", async () => {
		connection(false);
		const calls = serve(() => answer());
		mount();
		await idle();
		flip(true);
		await waitFor(() => expect(calls).toHaveLength(1));
	});

	test("going offline calls nothing", async () => {
		connection(true);
		const calls = serve(() => answer());
		mount();
		await waitFor(() => expect(calls).toHaveLength(1));
		flip(false);
		await idle();
		expect(calls).toHaveLength(1);
	});

	test("each return online calls it again, and staying offline between never does", async () => {
		connection(true);
		const calls = serve(() => answer());
		mount();
		await waitFor(() => expect(calls).toHaveLength(1));
		flip(false);
		flip(false);
		await idle();
		flip(true);
		await waitFor(() => expect(calls).toHaveLength(2));
		flip(true);
		await idle();
		expect(calls).toHaveLength(2);
		flip(false);
		flip(true);
		await waitFor(() => expect(calls).toHaveLength(3));
	});

	describe("when it created charges", () => {
		function areas(queryClient: ReturnType<typeof createQueryClient>) {
			return {
				subscriptions: watched(
					queryClient,
					[QUERY_ROOTS.subscriptions, "list"],
					{ seeded: true },
				),
				transactions: watched(
					queryClient,
					[QUERY_ROOTS.transactions, "list", {}],
					{ seeded: true },
				),
				payees: watched(queryClient, [QUERY_ROOTS.payees, "list"], {
					seeded: true,
				}),
				budgets: watched(
					queryClient,
					[QUERY_ROOTS.budgets, "month", "2026-11"],
					{ seeded: true },
				),
				profile: watched(queryClient, [QUERY_ROOTS.profile], {
					seeded: true,
				}),
			};
		}

		// Flow 7.2: on 2 November golden gets chargesCreated 1 and refetches.
		test("refetches Subscriptions, Transactions, payees and Budgets", async () => {
			connection(true);
			const calls = serve(() =>
				answer({ chargesCreated: 1, pricesUpdated: true }),
			);
			const { queryClient } = mount();
			const seen = areas(queryClient);
			await waitFor(() => expect(calls).toHaveLength(1));
			await waitFor(() => expect(seen.subscriptions.fetches()).toBe(1));
			expect(seen.transactions.fetches()).toBe(1);
			expect(seen.payees.fetches()).toBe(1);
			expect(seen.budgets.fetches()).toBe(1);
			expect(seen.profile.fetches()).toBe(0);
		});

		test("many charges refetch each read once", async () => {
			connection(true);
			serve(() => answer({ chargesCreated: 52 }));
			const { queryClient } = mount();
			const seen = areas(queryClient);
			await waitFor(() => expect(seen.transactions.fetches()).toBe(1));
			await idle();
			expect(seen.transactions.fetches()).toBe(1);
		});
	});

	describe("when it created none", () => {
		// AC-F05-03: repeating the boot endpoint creates nothing.
		test.each([
			["nothing was due", { chargesCreated: 0 }],
			[
				"the lazy check had made the charges already",
				{ chargesCreated: 0, pricesUpdated: true },
			],
			[
				"it was skipped while changes wait",
				{ skipped: true, chargesCreated: 0 },
			],
		])("refetches nothing, since %s", async (_why, changes) => {
			connection(true);
			const calls = serve(() => answer(changes));
			const { queryClient } = mount();
			const seen = {
				subscriptions: watched(
					queryClient,
					[QUERY_ROOTS.subscriptions, "list"],
					{ seeded: true },
				),
				transactions: watched(
					queryClient,
					[QUERY_ROOTS.transactions, "list", {}],
					{ seeded: true },
				),
			};
			await waitFor(() => expect(calls).toHaveLength(1));
			await idle();
			expect(seen.subscriptions.fetches()).toBe(0);
			expect(seen.transactions.fetches()).toBe(0);
		});
	});

	describe("a failure says nothing", () => {
		test.each([
			[
				"a 500",
				() =>
					HttpResponse.json(
						{
							error: {
								code: "internal",
								message: "m",
								requestId: "r",
							},
						},
						{ status: 500 },
					),
			],
			["no answer", () => HttpResponse.error()],
			[
				"a 403 profile_required",
				() =>
					HttpResponse.json(
						{
							error: {
								code: "profile_required",
								message: "m",
								requestId: "r",
							},
						},
						{ status: 403 },
					),
			],
		])(
			"%s refetches nothing and tries again only at the next start",
			async (_what, respond) => {
				connection(true);
				const calls = serve(respond);
				const { queryClient } = mount();
				const seen = watched(
					queryClient,
					[QUERY_ROOTS.transactions, "list", {}],
					{ seeded: true },
				);
				await waitFor(() => expect(calls).toHaveLength(1));
				await idle();
				expect(calls).toHaveLength(1);
				expect(seen.fetches()).toBe(0);
			},
		);

		test("does not throw into the page", async () => {
			connection(true);
			serve(() => HttpResponse.error());
			const { rerender } = mount();
			await idle();
			expect(() => rerender()).not.toThrow();
		});

		test("a 401 still shows the session-expired banner, as any API call's does", async () => {
			connection(true);
			const heard: string[] = [];
			const stop = onApiEvent((event) => heard.push(event.type));
			const calls = serve(() =>
				HttpResponse.json(
					{
						error: {
							code: "unauthenticated",
							message: "m",
							requestId: "r",
						},
					},
					{ status: 401 },
				),
			);
			mount();
			await waitFor(() => expect(calls).toHaveLength(1));
			await waitFor(() => expect(heard).toContain("unauthenticated"));
			stop();
		});
	});

	test("a failed start is not retried by the return online unless the connection really changed", async () => {
		connection(true);
		const calls = serve((index) =>
			index === 0 ? HttpResponse.error() : answer(),
		);
		mount();
		await waitFor(() => expect(calls).toHaveLength(1));
		flip(true);
		await idle();
		expect(calls).toHaveLength(1);
		flip(false);
		flip(true);
		await waitFor(() => expect(calls).toHaveLength(2));
	});
});
