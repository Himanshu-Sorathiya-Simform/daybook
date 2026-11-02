import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp, url } from "@/components/app/tests/helpers";
import { clearLogoutMarker, hasLogoutMarker } from "@/lib/logout-marker";
import { LOGOUT_REVOKE_PATH, useLogout } from "../useLogout";

const SIGN_OUT = url("/api/auth/sign-out");

// Better Auth's client asks for the session after a sign-out; there is none.
const network = setupServer(
	http.get(url("/api/auth/get-session"), () => HttpResponse.json(null)),
);

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	vi.restoreAllMocks();
	network.resetHandlers();
	clearLogoutMarker();
});
afterAll(() => network.close());

/** Answers sign-out with `respond`, counting the calls. */
function signOut(respond: () => Response | Promise<Response>) {
	const calls: Request[] = [];
	network.use(
		http.post(SIGN_OUT, ({ request }) => {
			calls.push(request);
			return respond();
		}),
	);
	return calls;
}

/** A sign-out that answers when the test says. */
function heldSignOut(
	respond: () => Response = () => HttpResponse.json({ success: true }),
) {
	let answer!: () => void;
	const released = new Promise<void>((resolve) => {
		answer = resolve;
	});
	const calls = signOut(async () => {
		await released;
		return respond();
	});
	return { calls, answer };
}

const refusal = (status: number) =>
	HttpResponse.json({ code: "X", message: "No" }, { status });

let online = true;
function connection(value: boolean) {
	online = value;
	vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
}

function Logout() {
	const { state, logout } = useLogout();
	return (
		<>
			<p>state: {state}</p>
			<button
				type="button"
				onClick={() => void logout()}
			>
				Log out
			</button>
		</>
	);
}

function renderLogout() {
	const rendered = renderInApp(<Logout />);
	rendered.queryClient.setQueryData(["transactions"], { rows: [1, 2] });
	rendered.queryClient.setQueryData(["me"], { user: { id: "u1" } });
	return { ...rendered, user: userEvent.setup() };
}

const press = (user: ReturnType<typeof userEvent.setup>) =>
	user.click(screen.getByRole("button", { name: "Log out" }));

describe("useLogout (D-502, D-515)", () => {
	test("starts idle and does nothing until asked", () => {
		const calls = signOut(() => HttpResponse.json({ success: true }));
		const { navigate } = renderLogout();
		expect(screen.getByText("state: idle")).toBeInTheDocument();
		expect(calls).toHaveLength(0);
		expect(navigate).not.toHaveBeenCalled();
	});

	test("the revoke path is the session-expired route with reason=logout", () => {
		expect(LOGOUT_REVOKE_PATH).toBe("/api/session/expired?reason=logout");
	});

	test.each([
		["a 200", () => HttpResponse.json({ success: true })],
		["a 400, no session left", () => refusal(400)],
		["a 401, no session left", () => refusal(401)],
	])(
		"%s counts as done: no marker, cache cleared, /login loads",
		async (_name, respond) => {
			const calls = signOut(respond);
			const { user, navigate, queryClient } = renderLogout();
			await press(user);
			await waitFor(() =>
				expect(navigate).toHaveBeenCalledExactlyOnceWith("/login"),
			);
			expect(calls).toHaveLength(1);
			expect(hasLogoutMarker()).toBe(false);
			expect(queryClient.getQueryData(["transactions"])).toBeUndefined();
			expect(queryClient.getQueryData(["me"])).toBeUndefined();
		},
	);

	test.each([
		["a 403", () => refusal(403)],
		["a 404", () => refusal(404)],
		["a 429", () => refusal(429)],
		["a 500", () => refusal(500)],
		["a 503 with no body", () => new HttpResponse(null, { status: 503 })],
		["a network error", () => HttpResponse.error()],
	])(
		"%s does not count: the marker is written, the cache cleared, /login loads",
		async (_name, respond) => {
			signOut(respond);
			const { user, navigate, queryClient } = renderLogout();
			await press(user);
			await waitFor(() =>
				expect(navigate).toHaveBeenCalledExactlyOnceWith("/login"),
			);
			expect(hasLogoutMarker()).toBe(true);
			expect(queryClient.getQueryData(["transactions"])).toBeUndefined();
		},
	);

	test("while sign-out runs the state is running and nothing has moved yet", async () => {
		const { answer } = heldSignOut();
		const { user, navigate, queryClient } = renderLogout();
		await press(user);
		expect(await screen.findByText("state: running")).toBeInTheDocument();
		expect(navigate).not.toHaveBeenCalled();
		expect(queryClient.getQueryData(["transactions"])).toEqual({ rows: [1, 2] });
		answer();
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
	});

	test("a second press while sign-out runs sends no second sign-out", async () => {
		const { calls, answer } = heldSignOut();
		const { user, navigate } = renderLogout();
		await press(user);
		await waitFor(() => expect(calls).toHaveLength(1));
		await press(user);
		await press(user);
		answer();
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(calls).toHaveLength(1);
		expect(navigate).toHaveBeenCalledOnce();
	});

	test("the marker is written before /login loads", async () => {
		signOut(() => refusal(500));
		const { user, navigate } = renderLogout();
		let markedFirst: boolean | undefined;
		navigate.mockImplementation(() => {
			markedFirst = hasLogoutMarker();
		});
		await press(user);
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(markedFirst).toBe(true);
	});
});

describe("useLogout offline (D-502)", () => {
	test("offline from the start: no call, the marker, the cache cleared, the login screen", async () => {
		connection(false);
		const calls = signOut(() => HttpResponse.json({ success: true }));
		const { user, navigate, queryClient } = renderLogout();
		await press(user);
		expect(await screen.findByText("state: offline")).toBeInTheDocument();
		expect(calls).toHaveLength(0);
		expect(hasLogoutMarker()).toBe(true);
		expect(queryClient.getQueryData(["transactions"])).toBeUndefined();
		expect(navigate).not.toHaveBeenCalled();
	});

	test("the connection dropping during sign-out ends the same way", async () => {
		connection(true);
		signOut(() => {
			online = false;
			return HttpResponse.error();
		});
		const { user, navigate } = renderLogout();
		await press(user);
		expect(await screen.findByText("state: offline")).toBeInTheDocument();
		expect(hasLogoutMarker()).toBe(true);
		expect(navigate).not.toHaveBeenCalled();
	});

	test("back online, the tab loads the revoke path once", async () => {
		connection(false);
		const { user, navigate } = renderLogout();
		await press(user);
		await screen.findByText("state: offline");
		online = true;
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(navigate).toHaveBeenCalledExactlyOnceWith(LOGOUT_REVOKE_PATH);
	});

	test("a press after an offline logout does nothing more", async () => {
		connection(false);
		const calls = signOut(() => HttpResponse.json({ success: true }));
		const { user } = renderLogout();
		await press(user);
		await screen.findByText("state: offline");
		online = true;
		await press(user);
		expect(calls).toHaveLength(0);
		expect(screen.getByText("state: offline")).toBeInTheDocument();
	});

	test("an online event before any logout loads nothing", () => {
		const { navigate } = renderLogout();
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(navigate).not.toHaveBeenCalled();
	});

	test("an online event while sign-out runs loads nothing extra", async () => {
		const { answer } = heldSignOut();
		const { user, navigate } = renderLogout();
		await press(user);
		await screen.findByText("state: running");
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(navigate).not.toHaveBeenCalled();
		answer();
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledExactlyOnceWith("/login"),
		);
	});

	test("after unmounting, an online event loads nothing", async () => {
		connection(false);
		const { user, navigate, unmount } = renderLogout();
		await press(user);
		await screen.findByText("state: offline");
		unmount();
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(navigate).not.toHaveBeenCalled();
	});
});
