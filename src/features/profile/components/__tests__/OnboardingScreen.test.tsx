import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { SESSION_EXPIRED_MESSAGE } from "@/components/app/SessionExpiredBanner";
import { renderInApp, url } from "@/components/app/__tests__/helpers";
import { clearLogoutMarker } from "@/lib/logout-marker";
import { ONBOARDING_TEXT } from "../../lib/messages";
import { OnboardingScreen } from "../OnboardingScreen";

const EMAIL = "asha@example.com";
const SESSION = {
	session: { id: "s", userId: "u1", expiresAt: "2026-12-01T00:00:00.000Z" },
	user: { id: "u1", email: EMAIL, name: "Asha" },
};

const network = setupServer();
let session: typeof SESSION | null = SESSION;

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
	clearLogoutMarker();
	session = SESSION;
});
afterAll(() => network.close());

/** Answers the session check, and sign-out with `respond`, counting its calls. */
function routes(
	respond: () => Response | Promise<Response> = () =>
		HttpResponse.json({ success: true }),
) {
	const signOuts: Request[] = [];
	network.use(
		http.get(url("/api/auth/get-session"), () => HttpResponse.json(session)),
		http.post(url("/api/auth/sign-out"), ({ request }) => {
			signOuts.push(request);
			return respond();
		}),
	);
	return signOuts;
}

function setup() {
	const user = userEvent.setup();
	const view = renderInApp(
		<OnboardingScreen
			email={EMAIL}
			loggedOut={<p>the login screen</p>}
		>
			<p>the form</p>
		</OnboardingScreen>,
	);
	return { user, ...view };
}

const logOut = () => screen.getByRole("button", { name: "Log out" });

// D-511, BR-F02-01
describe("OnboardingScreen (F02 section 6)", () => {
	test("shows the title, the line and the form", () => {
		routes();
		setup();
		expect(
			screen.getByRole("heading", { level: 1, name: ONBOARDING_TEXT.title }),
		).toBeInTheDocument();
		expect(screen.getByText(ONBOARDING_TEXT.intro)).toBeInTheDocument();
		expect(screen.getByText("the form")).toBeInTheDocument();
	});

	test("the top bar holds the name, not as a link, then the email and Log out", () => {
		routes();
		setup();
		const bar = screen.getByRole("banner");
		expect(within(bar).getByText("Daybook")).toBeInTheDocument();
		expect(within(bar).queryByRole("link")).not.toBeInTheDocument();
		expect(within(bar).getByText(EMAIL)).toBeInTheDocument();
		expect(within(bar).getByRole("button", { name: "Log out" })).toBe(logOut());
	});

	test("Log out signs out and opens login", async () => {
		const signOuts = routes();
		const { user, navigate } = setup();
		await user.click(logOut());
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
		expect(signOuts).toHaveLength(1);
	});

	test("while it signs out, Log out waits, and a second press sends nothing", async () => {
		let answer!: () => void;
		const held = new Promise<void>((resolve) => {
			answer = resolve;
		});
		const signOuts = routes(async () => {
			await held;
			return HttpResponse.json({ success: true });
		});
		const { user, navigate } = setup();
		await user.click(logOut());
		await waitFor(() =>
			expect(logOut()).toHaveAttribute("aria-disabled", "true"),
		);
		await user.click(logOut());
		answer();
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/login"));
		expect(signOuts).toHaveLength(1);
	});

	test("offline, logging out shows the login screen in this tab", async () => {
		routes();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user, navigate } = setup();
		await user.click(logOut());
		expect(await screen.findByText("the login screen")).toBeInTheDocument();
		expect(screen.queryByText("the form")).not.toBeInTheDocument();
		expect(navigate).not.toHaveBeenCalled();
	});

	test("logging out ends the session, and that is no expiry to warn about", async () => {
		session = null;
		let answer!: () => void;
		const held = new Promise<void>((resolve) => {
			answer = resolve;
		});
		routes(async () => {
			await held;
			return HttpResponse.json({ success: true });
		});
		vi.resetModules();
		const [{ renderInApp: renderFresh }, { OnboardingScreen: FreshScreen }] =
			await Promise.all([
				import("@/components/app/__tests__/helpers"),
				import("../OnboardingScreen"),
			]);
		const user = userEvent.setup();
		renderFresh(
			<FreshScreen
				email={EMAIL}
				loggedOut={<p>the login screen</p>}
			>
				<p>the form</p>
			</FreshScreen>,
		);
		await screen.findByText(SESSION_EXPIRED_MESSAGE);
		await user.click(logOut());
		await waitFor(() =>
			expect(
				screen.queryByText(SESSION_EXPIRED_MESSAGE),
			).not.toBeInTheDocument(),
		);
		answer();
	});

	test("a session that ended elsewhere shows the expired banner", async () => {
		session = null;
		routes();
		// Better Auth's session store lives in a module and keeps its last answer, so this test
		// renders from freshly loaded modules, as SessionCheck's own tests do.
		vi.resetModules();
		const [{ renderInApp: renderFresh }, { OnboardingScreen: FreshScreen }] =
			await Promise.all([
				import("@/components/app/__tests__/helpers"),
				import("../OnboardingScreen"),
			]);
		renderFresh(
			<FreshScreen
				email={EMAIL}
				loggedOut={<p>the login screen</p>}
			>
				<p>the form</p>
			</FreshScreen>,
		);
		expect(await screen.findByText(SESSION_EXPIRED_MESSAGE)).toBeInTheDocument();
	});
});
