import { useQuery } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { useAppSession } from "@/hooks/useAppSession";
import { ME_KEY, useMe } from "@/hooks/useMe";
import { emitApiEvent } from "@/lib/api/events";
import { AppProviders } from "../AppProviders";
import { meFor, renderInApp, url } from "./helpers";

const network = setupServer();

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	window.history.replaceState(null, "", "/");
});
afterAll(() => network.close());

/** Shows the session state as text. */
function SessionState() {
	const { expired } = useAppSession();
	return <p>{expired ? "expired" : "live"}</p>;
}

/** `/api/me` answers with the users in `ids`, one per call, the last one repeating. */
function meAnswers(...ids: string[]) {
	let call = 0;
	network.use(
		http.get(url("/api/me"), () => {
			const id = ids[Math.min(call, ids.length - 1)]!;
			call += 1;
			return HttpResponse.json({ data: meFor(id) });
		}),
	);
	return () => call;
}

function MeUser() {
	const { data } = useMe();
	return <p>user {data?.user.id ?? "none"}</p>;
}

/** Another cached query, standing for every page's data. */
function OtherQuery() {
	useQuery({ queryKey: ["transactions"], queryFn: () => Promise.resolve([1]) });
	return null;
}

describe("API events (STATE-4)", () => {
	// BR-F01-13
	test("unauthenticated marks the session expired", async () => {
		renderInApp(<SessionState />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		expect(await screen.findByText("expired")).toBeInTheDocument();
	});

	// BR-F02-01
	test("profile_required opens /onboarding", () => {
		window.history.replaceState(null, "", "/transactions");
		const { navigate } = renderInApp(<SessionState />);
		act(() => emitApiEvent({ type: "profile_required" }));
		expect(navigate).toHaveBeenCalledExactlyOnceWith("/onboarding");
	});

	test("profile_required on /onboarding itself goes nowhere, so it cannot loop", () => {
		window.history.replaceState(null, "", "/onboarding");
		const { navigate } = renderInApp(<SessionState />);
		act(() => emitApiEvent({ type: "profile_required" }));
		expect(navigate).not.toHaveBeenCalled();
	});

	test("profile_required leaves the session live", () => {
		renderInApp(<SessionState />);
		act(() => emitApiEvent({ type: "profile_required" }));
		expect(screen.getByText("live")).toBeInTheDocument();
	});

	// BR-P4-12
	test("capabilities_changed refetches /api/me", async () => {
		const calls = meAnswers("u1");
		renderInApp(<MeUser />);
		await screen.findByText("user u1");
		expect(calls()).toBe(1);
		act(() => emitApiEvent({ type: "capabilities_changed" }));
		await waitFor(() => expect(calls()).toBe(2));
	});

	test("unmounting stops listening", () => {
		const { navigate, unmount } = renderInApp(<SessionState />);
		unmount();
		window.history.replaceState(null, "", "/transactions");
		emitApiEvent({ type: "profile_required" });
		expect(navigate).not.toHaveBeenCalled();
	});

	test("two apps each hear an event once", () => {
		window.history.replaceState(null, "", "/transactions");
		const first = renderInApp(<SessionState />);
		const second = renderInApp(<SessionState />);
		act(() => emitApiEvent({ type: "profile_required" }));
		expect(first.navigate).toHaveBeenCalledTimes(1);
		expect(second.navigate).toHaveBeenCalledTimes(1);
	});
});

describe("/api/me answers", () => {
	test("an answer hides the session-expired banner", async () => {
		meAnswers("u1");
		const { queryClient } = renderInApp(<SessionState />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		await screen.findByText("expired");
		await act(() =>
			queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => meFor("u1") }),
		);
		expect(await screen.findByText("live")).toBeInTheDocument();
	});

	// Root 5.2, D-508
	test("an answer for another user drops every other cached query, and keeps /api/me", async () => {
		const { queryClient } = renderInApp(<OtherQuery />);
		await act(() =>
			queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => meFor("u1") }),
		);
		await waitFor(() =>
			expect(queryClient.getQueryData(["transactions"])).toEqual([1]),
		);
		queryClient.setQueryData(["reports", "2026"], { total: 5 });
		await act(() =>
			queryClient.fetchQuery({
				queryKey: ME_KEY,
				queryFn: () => meFor("u2"),
				staleTime: 0,
			}),
		);
		expect(queryClient.getQueryData(["reports", "2026"])).toBeUndefined();
		expect(
			queryClient.getQueryCache().find({ queryKey: ["reports", "2026"] }),
		).toBeUndefined();
		expect(
			(queryClient.getQueryData(ME_KEY) as { user: { id: string } }).user.id,
		).toBe("u2");
	});

	test("an answer for the same user keeps the other queries", async () => {
		const { queryClient } = renderInApp(<SessionState />);
		await act(() =>
			queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => meFor("u1") }),
		);
		queryClient.setQueryData(["reports"], { total: 5 });
		await act(() =>
			queryClient.fetchQuery({
				queryKey: ME_KEY,
				queryFn: () => meFor("u1"),
				staleTime: 0,
			}),
		);
		expect(queryClient.getQueryData(["reports"])).toEqual({ total: 5 });
	});

	test("the first answer keeps queries cached before it", async () => {
		const { queryClient } = renderInApp(<SessionState />);
		queryClient.setQueryData(["reports"], { total: 5 });
		await act(() =>
			queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => meFor("u1") }),
		);
		expect(queryClient.getQueryData(["reports"])).toEqual({ total: 5 });
	});

	test("a failed /api/me leaves the cache and the owner alone", async () => {
		const { queryClient } = renderInApp(<SessionState />);
		await act(() =>
			queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => meFor("u1") }),
		);
		queryClient.setQueryData(["reports"], { total: 5 });
		await act(() =>
			queryClient
				.fetchQuery({
					queryKey: ME_KEY,
					queryFn: () => Promise.reject(new Error("down")),
					staleTime: 0,
				})
				.catch(() => undefined),
		);
		await act(() =>
			queryClient.fetchQuery({
				queryKey: ME_KEY,
				queryFn: () => meFor("u1"),
				staleTime: 0,
			}),
		);
		expect(queryClient.getQueryData(["reports"])).toEqual({ total: 5 });
	});

	test("another query's answer never counts as a user", async () => {
		const { queryClient } = renderInApp(<SessionState />);
		await act(() =>
			queryClient.fetchQuery({ queryKey: ME_KEY, queryFn: () => meFor("u1") }),
		);
		queryClient.setQueryData(["reports"], { total: 5 });
		await act(() =>
			queryClient.fetchQuery({
				queryKey: ["profile"],
				queryFn: () => meFor("u2"),
			}),
		);
		expect(queryClient.getQueryData(["reports"])).toEqual({ total: 5 });
	});
});

describe("the query client", () => {
	test("is made once and kept across renders", () => {
		function Probe({ seen }: { seen: unknown[] }) {
			const { navigate } = useAppSession();
			seen.push(navigate);
			return null;
		}
		const seen: unknown[] = [];
		const navigate = vi.fn();
		const { rerender } = render(
			<AppProviders navigate={navigate}>
				<Probe seen={seen} />
			</AppProviders>,
		);
		rerender(
			<AppProviders navigate={navigate}>
				<Probe seen={seen} />
			</AppProviders>,
		);
		expect(seen.length).toBeGreaterThanOrEqual(2);
		expect(new Set(seen).size).toBe(1);
	});

	test("without a navigate, a page load is the default", () => {
		function NavigateKind() {
			const { navigate } = useAppSession();
			return <p>{typeof navigate}</p>;
		}
		render(
			<AppProviders>
				<NavigateKind />
			</AppProviders>,
		);
		expect(screen.getByText("function")).toBeInTheDocument();
	});
});
