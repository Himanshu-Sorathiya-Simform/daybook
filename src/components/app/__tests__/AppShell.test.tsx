import {
	act,
	cleanup,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { type ReactNode, useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { TimeField } from "@/components/forms/TimeField";

import { SESSION_EXPIRED_MESSAGE } from "../SessionExpiredBanner";
import { meFor, url } from "./helpers";
import { InRouter, routerFake } from "./router";

const SESSION = {
	session: {
		id: "s1",
		userId: "u1",
		token: "t",
		expiresAt: "2026-11-09T06:30:00.000Z",
		createdAt: "2026-11-02T06:30:00.000Z",
		updatedAt: "2026-11-02T06:30:00.000Z",
	},
	user: {
		id: "u1",
		email: "asha@example.com",
		name: "Asha Rao",
		emailVerified: false,
		createdAt: "2026-11-02T06:30:00.000Z",
		updatedAt: "2026-11-02T06:30:00.000Z",
	},
};

const network = setupServer(
	http.get(url("/api/auth/get-session"), () => HttpResponse.json(SESSION)),
	// The shell's /api/me answers only when a test says, so the server's user shows first.
	http.get(url("/api/me"), async () => {
		await delay("infinite");
		return HttpResponse.json({ data: meFor("u1") });
	}),
);

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(async () => {
	vi.restoreAllMocks();
	// Better Auth's session store outlives a render by one second (nanostores' unmount delay).
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 1100));
	network.resetHandlers();
	document.cookie = "daybook_logout=; Max-Age=0; Path=/";
	document.cookie = "daybook_sidebar=; Max-Age=0; Path=/";
});
afterAll(() => network.close());

const SERVER_USER = { name: "Asha Rao", email: "asha@example.com" };

/** Renders the shell from freshly loaded modules: Better Auth's session store keeps its last
 * answer in a module. Answers the router and `navigate` spies, and the fresh event emitter. */
async function renderShell({
	pathname = "/transactions",
	rail = false,
	dateLocale = "en-IN",
	body = <h1>Page body</h1>,
	onAdd,
	bodyWithFiller,
}: {
	pathname?: string;
	rail?: boolean;
	dateLocale?: string;
	body?: ReactNode;
	/** Fills the Add slot from the page, as the entry dialog does. */
	onAdd?: () => void;
	/** A page built with the slot filler, for pages that fill it more than once. */
	bodyWithFiller?: (Filler: (props: { open: () => void }) => null) => ReactNode;
} = {}) {
	vi.resetModules();
	const [{ AppProviders }, { AppShell }, { emitApiEvent }, { useAddSlot }] =
		await Promise.all([
			import("../AppProviders"),
			import("../AppShell"),
			import("@/lib/api/events"),
			import("@/hooks/useAddSlot"),
		]);
	function Filler({ open }: { open: () => void }) {
		useAddSlot(open);
		return null;
	}
	const router = routerFake();
	const navigate = vi.fn();
	const view = render(
		<AppProviders navigate={navigate}>
			<InRouter
				pathname={pathname}
				router={router}
			>
				<AppShell
					user={SERVER_USER}
					dateLocale={dateLocale}
					rail={rail}
					loggedOut={<p>Offline login screen</p>}
				>
					{bodyWithFiller ? bodyWithFiller(Filler) : body}
					{onAdd && <Filler open={onAdd} />}
				</AppShell>
			</InRouter>
		</AppProviders>,
	);
	return { ...view, router, navigate, emitApiEvent, user: userEvent.setup() };
}

const mains = () => screen.getAllByRole("navigation", { name: "Main" });
const sidebar = () =>
	mains().find((nav) => nav.classList.contains("max-md:hidden"))!;
const bottomBar = () => mains().find((nav) => nav.classList.contains("md:hidden"))!;

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
	await user.click(screen.getByRole("button", { name: "Account menu" }));
	return screen.findByRole("menu", { name: "Account menu" });
}

async function logOut(user: ReturnType<typeof userEvent.setup>) {
	const menu = await openMenu(user);
	await user.click(within(menu).getByRole("menuitem", { name: "Log out" }));
}

describe("AppShell layout (root section 4, D-512)", () => {
	test("has the sidebar and the bottom bar, each shown on its side of 768px", async () => {
		await renderShell();
		expect(mains()).toHaveLength(2);
		expect(sidebar()).toHaveClass("max-md:hidden");
		expect(bottomBar()).toHaveClass("md:hidden");
		expect(bottomBar()).not.toHaveClass("max-md:hidden");
	});

	test("puts the page inside the main landmark, under the header", async () => {
		await renderShell();
		const main = screen.getByRole("main");
		expect(
			within(main).getByRole("heading", { name: "Page body" }),
		).toBeInTheDocument();
		expect(main).toHaveAttribute("id", "content");
		const header = screen.getByRole("banner");
		expect(
			header.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("leaves room for the bottom bar under the page on phones", async () => {
		await renderShell();
		expect(screen.getByRole("main")).toHaveClass(
			"max-md:pb-(--bottom-bar-height)",
		);
	});

	test("the first Tab reaches Skip to content, which leads to the page", async () => {
		const { user } = await renderShell();
		await user.tab();
		const skip = screen.getByRole("link", { name: "Skip to content" });
		expect(skip).toHaveFocus();
		expect(skip).toHaveAttribute("href", "#content");
		expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
	});

	test("the skip link is hidden until it has focus", async () => {
		await renderShell();
		expect(screen.getByRole("link", { name: "Skip to content" })).toHaveClass(
			"sr-only",
			"focus:not-sr-only",
		);
	});

	test("hosts the toasts", async () => {
		await renderShell();
		expect(
			screen.getByRole("region", { name: /Notifications/ }),
		).toBeInTheDocument();
	});

	test("marks the current page in the sidebar and the bottom bar", async () => {
		await renderShell({ pathname: "/budgets" });
		expect(
			within(sidebar()).getByRole("link", { name: "Budgets" }),
		).toHaveAttribute("aria-current", "page");
		expect(
			within(bottomBar()).getByRole("link", { name: "Budgets" }),
		).toHaveAttribute("aria-current", "page");
	});

	test("a link moves through Next's router, so the shell stays", async () => {
		const { user, router, navigate } = await renderShell();
		await user.click(within(sidebar()).getByRole("link", { name: "Goals" }));
		expect(router.push).toHaveBeenCalledExactlyOnceWith("/goals");
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe("AppShell Add (D-548)", () => {
	const headerAdd = () =>
		within(screen.getByRole("banner")).getByRole("button", {
			name: "Add Transaction",
		});
	const barAdd = () =>
		within(bottomBar()).getByRole("button", { name: "Add Transaction" });

	test("the header's Add and the bottom bar's Add call what the page put in the slot", async () => {
		const onAdd = vi.fn();
		const { user } = await renderShell({ onAdd });

		await user.click(headerAdd());
		await user.click(barAdd());

		expect(onAdd).toHaveBeenCalledTimes(2);
	});

	test("a page that leaves after a newer one filled the slot leaves the newer one", async () => {
		const older = vi.fn();
		const newer = vi.fn();
		function Pages({
			Filler,
		}: {
			Filler: (props: { open: () => void }) => null;
		}) {
			const [olderShown, setOlderShown] = useState(true);
			return (
				<>
					<h1>Page body</h1>
					{olderShown && <Filler open={older} />}
					<Filler open={newer} />
					<button
						type="button"
						onClick={() => setOlderShown(false)}
					>
						Drop older
					</button>
				</>
			);
		}
		const { user } = await renderShell({
			bodyWithFiller: (Filler) => <Pages Filler={Filler} />,
		});

		await user.click(screen.getByRole("button", { name: "Drop older" }));
		await user.click(headerAdd());

		expect(newer).toHaveBeenCalledOnce();
		expect(older).not.toHaveBeenCalled();
	});

	test("with nothing in the slot, Add does nothing and nothing breaks", async () => {
		const { user } = await renderShell();

		await user.click(headerAdd());
		await user.click(barAdd());

		expect(
			screen.getByRole("heading", { name: "Page body" }),
		).toBeInTheDocument();
	});
});

describe("AppShell date locale (BR-F02-19)", () => {
	const clock = (
		<TimeField
			label="Time"
			value="23:50"
			onChange={() => {}}
		/>
	);

	test.each([
		["en-IN", "11:50 pm"],
		["de-DE", "23:50"],
		["en-US", "11:50 PM"],
	])(
		"gives React Aria the profile's %s, so a time reads %s",
		async (dateLocale, shown) => {
			await renderShell({ dateLocale, body: clock });

			const time = screen.getByRole("group", { name: "Time" });
			expect(time.textContent!.replace(/[\u2066-\u2069]/g, "")).toBe(shown);
		},
	);
});

describe("AppShell sidebar width (D-513)", () => {
	test.each([
		[false, "Collapse sidebar"],
		[true, "Expand sidebar"],
	])("starts at the width the server read (rail=%s)", async (rail, toggle) => {
		await renderShell({ rail });
		expect(
			within(sidebar()).getByRole("button", { name: toggle }),
		).toBeInTheDocument();
	});

	test("collapsing shows the rail and keeps the choice in the cookie", async () => {
		const { user } = await renderShell();
		await user.click(
			within(sidebar()).getByRole("button", { name: "Collapse sidebar" }),
		);
		expect(
			within(sidebar()).getByRole("button", { name: "Expand sidebar" }),
		).toBeInTheDocument();
		expect(document.cookie).toContain("daybook_sidebar=rail");
	});

	test("expanding shows full width and keeps that choice", async () => {
		const { user } = await renderShell({ rail: true });
		await user.click(
			within(sidebar()).getByRole("button", { name: "Expand sidebar" }),
		);
		expect(
			within(sidebar()).getByRole("button", { name: "Collapse sidebar" }),
		).toBeInTheDocument();
		expect(document.cookie).toContain("daybook_sidebar=full");
	});
});

describe("AppShell user menu (D-504)", () => {
	test("shows the server's name and email before /api/me answers", async () => {
		const { user } = await renderShell();
		expect(
			screen.getByRole("button", { name: "Account menu" }),
		).toHaveTextContent("AR");
		const menu = await openMenu(user);
		expect(within(menu).getByText("Asha Rao")).toBeInTheDocument();
		expect(within(menu).getByText("asha@example.com")).toBeInTheDocument();
	});

	// AC-F02-16 (the menu side): a new name from /api/me shows without a reload.
	test("takes the name and email from /api/me once it answers", async () => {
		network.use(
			http.get(url("/api/me"), () =>
				HttpResponse.json({
					data: {
						...meFor("u1"),
						user: {
							id: "u1",
							name: "Meera Iyer",
							email: "meera@example.com",
						},
					},
				}),
			),
		);
		const { user } = await renderShell();
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "Account menu" }),
			).toHaveTextContent("MI"),
		);
		const menu = await openMenu(user);
		expect(within(menu).getByText("Meera Iyer")).toBeInTheDocument();
		expect(within(menu).getByText("meera@example.com")).toBeInTheDocument();
	});

	test("a failed /api/me keeps the server's user", async () => {
		let asked = 0;
		network.use(
			http.get(url("/api/me"), () => {
				asked += 1;
				return HttpResponse.json(
					{ error: { code: "internal", message: "x" } },
					{ status: 500 },
				);
			}),
		);
		await renderShell();
		await waitFor(() => expect(asked).toBeGreaterThan(0));
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(
			screen.getByRole("button", { name: "Account menu" }),
		).toHaveTextContent("AR");
	});
});

describe("AppShell session (BR-F01-12, BR-F01-13)", () => {
	test("checks the session when it first renders", async () => {
		const seen: Request[] = [];
		network.use(
			http.get(url("/api/auth/get-session"), ({ request }) => {
				seen.push(request);
				return HttpResponse.json(SESSION);
			}),
		);
		await renderShell();
		await waitFor(() => expect(seen.length).toBeGreaterThan(0));
		expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).toBeNull();
	});

	test("no session shows the session-expired banner above the shell", async () => {
		network.use(
			http.get(url("/api/auth/get-session"), () => HttpResponse.json(null)),
		);
		await renderShell();
		const message = await screen.findByText(SESSION_EXPIRED_MESSAGE);
		expect(
			message.compareDocumentPosition(screen.getByRole("banner"))
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("an API 401 shows the banner", async () => {
		const { emitApiEvent } = await renderShell();
		act(() => emitApiEvent({ type: "unauthenticated" }));
		expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument();
	});
});

describe("AppShell logout (D-502, D-515)", () => {
	test("Log out signs out and loads /login", async () => {
		const signOuts: Request[] = [];
		network.use(
			http.post(url("/api/auth/sign-out"), ({ request }) => {
				signOuts.push(request);
				return HttpResponse.json({ success: true });
			}),
		);
		const { user, navigate } = await renderShell();
		await logOut(user);
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledExactlyOnceWith("/login"),
		);
		expect(signOuts).toHaveLength(1);
		expect(document.cookie).not.toContain("daybook_logout=1");
	});

	test("a failed sign-out writes the marker, then loads /login", async () => {
		network.use(
			http.post(url("/api/auth/sign-out"), () =>
				HttpResponse.json({ code: "X", message: "x" }, { status: 503 }),
			),
		);
		const { user, navigate } = await renderShell();
		await logOut(user);
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledExactlyOnceWith("/login"),
		);
		expect(document.cookie).toContain("daybook_logout=1");
	});

	test("logout keeps the sidebar choice, like the theme", async () => {
		network.use(
			http.post(url("/api/auth/sign-out"), () =>
				HttpResponse.json({ success: true }),
			),
		);
		const { user, navigate } = await renderShell();
		await user.click(
			within(sidebar()).getByRole("button", { name: "Collapse sidebar" }),
		);
		await logOut(user);
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(document.cookie).toContain("daybook_sidebar=rail");
	});

	test("while sign-out runs, Log out is disabled and a 401 shows no banner", async () => {
		let answer!: () => void;
		const released = new Promise<void>((resolve) => {
			answer = resolve;
		});
		network.use(
			http.post(url("/api/auth/sign-out"), async () => {
				await released;
				return HttpResponse.json({ success: true });
			}),
		);
		const { user, navigate, emitApiEvent } = await renderShell();
		await logOut(user);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		const menu = await openMenu(user);
		expect(
			within(menu).getByRole("menuitem", { name: "Log out" }),
		).toHaveAttribute("aria-disabled", "true");
		expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).toBeNull();
		answer();
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
	});

	test("offline, the tab shows the login screen instead of the shell", async () => {
		let online = false;
		vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online);
		const { user, navigate } = await renderShell();
		await logOut(user);
		expect(await screen.findByText("Offline login screen")).toBeInTheDocument();
		expect(screen.queryByRole("navigation")).toBeNull();
		expect(screen.queryByRole("main")).toBeNull();
		expect(screen.queryByText("Page body")).toBeNull();
		expect(document.cookie).toContain("daybook_logout=1");
		expect(navigate).not.toHaveBeenCalled();
		online = true;
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(navigate).toHaveBeenCalledExactlyOnceWith(
			"/api/session/expired?reason=logout",
		);
	});
});
