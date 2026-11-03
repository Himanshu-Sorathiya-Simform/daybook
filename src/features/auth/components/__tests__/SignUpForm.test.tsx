import { act, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { delay, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { clearLogoutMarker, hasLogoutMarker } from "@/lib/logout-marker";
import { AUTH_MESSAGES } from "../../lib/messages";
import { SignUpForm } from "../SignUpForm";
import {
	authNetwork,
	refusal,
	route,
	SIGN_OUT,
	SIGN_UP,
	USER,
} from "../../lib/__tests__/auth-network";

beforeAll(() => authNetwork.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	authNetwork.resetHandlers();
	clearLogoutMarker();
	vi.restoreAllMocks();
});
afterAll(() => authNetwork.close());

const PASSWORD = "correct horse battery";
const signedUp = () => HttpResponse.json({ token: "t", user: USER });

const email = () => screen.getByRole("textbox", { name: "Email" });
const password = () => screen.getByLabelText("Password", { selector: "input" });
const name = () => screen.getByRole("textbox", { name: "Display name" });
const submit = () => screen.getByRole("button", { name: /Create account/ });

async function fill(
	user: UserEvent,
	values: { email?: string; password?: string; name?: string } = {},
) {
	const {
		email: e = "asha@example.com",
		password: p = PASSWORD,
		name: n = "Asha",
	} = values;
	if (e) await user.type(email(), e);
	if (p) await user.type(password(), p);
	if (n) await user.type(name(), n);
}

function setup() {
	const user = userEvent.setup();
	const view = renderInApp(<SignUpForm />);
	return { user, ...view };
}

describe("the form (F01 section 6)", () => {
	test("has Email, Password and Display name, with what browsers need to fill them", () => {
		setup();
		expect(email()).toHaveAttribute("type", "email");
		expect(email()).toHaveAttribute("autocomplete", "email");
		expect(password()).toHaveAttribute("type", "password");
		expect(password()).toHaveAttribute("autocomplete", "new-password");
		expect(name()).toHaveAttribute("autocomplete", "name");
		expect(password()).toHaveAccessibleDescription("At least 12 characters.");
	});

	test("offers Create account and a link to log in instead", () => {
		setup();
		expect(submit()).toHaveAttribute("type", "submit");
		expect(screen.getByText(/Already have an account\?/)).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute(
			"href",
			"/login",
		);
	});

	test("the password has its show/hide button", () => {
		setup();
		expect(
			screen.getByRole("button", { name: "Show password" }),
		).toBeInTheDocument();
	});

	test("can be completed by keyboard alone (AC-F01-16)", async () => {
		const calls = route("post", SIGN_UP, signedUp);
		const { user, navigate } = setup();
		await user.tab();
		expect(email()).toHaveFocus();
		await user.keyboard("asha@example.com");
		await user.tab();
		expect(password()).toHaveFocus();
		await user.keyboard(PASSWORD);
		await user.tab();
		expect(screen.getByRole("button", { name: "Show password" })).toHaveFocus();
		await user.tab();
		expect(name()).toHaveFocus();
		await user.keyboard("Asha{Enter}");
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
		expect(calls).toHaveLength(1);
	});
});

describe("checks (D-510)", () => {
	test("says nothing while the user types before the first submit", async () => {
		const { user } = setup();
		await user.type(email(), "asha");
		await user.type(password(), "short");
		await user.tab();
		expect(
			screen.queryByText(AUTH_MESSAGES.emailInvalid),
		).not.toBeInTheDocument();
		expect(
			screen.queryByText(AUTH_MESSAGES.passwordTooShort),
		).not.toBeInTheDocument();
	});

	test("an empty submit shows every field's message, sends nothing, and focuses the email", async () => {
		const calls = route("post", SIGN_UP, signedUp);
		const { user } = setup();
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.emailRequired),
		).toBeInTheDocument();
		expect(screen.getByText(AUTH_MESSAGES.passwordRequired)).toBeInTheDocument();
		expect(screen.getByText(AUTH_MESSAGES.name)).toBeInTheDocument();
		expect(email()).toHaveAttribute("aria-invalid", "true");
		expect(email()).toHaveFocus();
		expect(calls).toHaveLength(0);
	});

	test("focuses the first field with a message, not always the email", async () => {
		const { user } = setup();
		await user.type(email(), "asha@example.com");
		await user.click(submit());
		await waitFor(() => expect(password()).toHaveFocus());
	});

	test("after a submit, each field is checked again as it changes", async () => {
		const { user } = setup();
		await user.type(password(), "short");
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.passwordTooShort),
		).toBeInTheDocument();
		await user.type(password(), " and now long");
		await waitFor(() =>
			expect(
				screen.queryByText(AUTH_MESSAGES.passwordTooShort),
			).not.toBeInTheDocument(),
		);
		await user.clear(password());
		expect(
			await screen.findByText(AUTH_MESSAGES.passwordRequired),
		).toBeInTheDocument();
	});

	test("an address over 254 characters has its own line", async () => {
		const { user } = setup();
		await fill(user, { email: `${"a".repeat(243)}@example.com` });
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.emailTooLong),
		).toBeInTheDocument();
	});
});

describe("submitting (flow 7.1)", () => {
	// AC-F01-01 (the page part; the E2E test covers the session)
	test("sends the email trimmed, the password as typed and the name, then opens /onboarding", async () => {
		const calls = route("post", SIGN_UP, signedUp);
		const { user, navigate } = setup();
		await fill(user, {
			email: "  asha@example.com  ",
			password: ` ${PASSWORD} `,
		});
		await user.click(submit());
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledExactlyOnceWith("/onboarding"),
		);
		expect(calls).toEqual([
			{ email: "asha@example.com", password: ` ${PASSWORD} `, name: "Asha" },
		]);
	});

	test("while it waits, the button spins, the fields are disabled and a second submit sends nothing", async () => {
		const calls = route("post", SIGN_UP, async () => {
			await delay(150);
			return signedUp();
		});
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		await waitFor(() =>
			expect(submit()).toHaveAttribute("data-pending", "true"),
		);
		expect(email()).toBeDisabled();
		expect(password()).toBeDisabled();
		expect(name()).toBeDisabled();
		await user.click(submit());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(calls).toHaveLength(1);
	});

	test("stays disabled after success, while the next page loads", async () => {
		route("post", SIGN_UP, signedUp);
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(email()).toBeDisabled();
		expect(submit()).toHaveAttribute("data-pending", "true");
	});
});

describe("refusals (F01 section 8)", () => {
	// BR-F01-05, AC-F01-02
	test("a taken email says so under the email, with a link to log in instead", async () => {
		route("post", SIGN_UP, () =>
			refusal("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", 422),
		);
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.emailTaken),
		).toBeInTheDocument();
		expect(email()).toHaveAttribute("aria-invalid", "true");
		expect(
			screen.getByRole("link", { name: "Log in instead." }),
		).toHaveAttribute("href", "/login");
		await waitFor(() => expect(email()).toHaveFocus());
		expect(navigate).not.toHaveBeenCalled();
	});

	test("changing the email takes the taken-email message and its link away", async () => {
		route("post", SIGN_UP, () =>
			refusal("USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", 422),
		);
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		await screen.findByText(AUTH_MESSAGES.emailTaken);
		await user.type(email(), "x");
		expect(screen.queryByText(AUTH_MESSAGES.emailTaken)).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: "Log in instead." }),
		).not.toBeInTheDocument();
	});

	// BR-F01-03, flow 7.1 step 3
	test("a breached password: its message, the password cleared, everything else kept", async () => {
		route("post", SIGN_UP, () => refusal("PASSWORD_BREACHED", 400));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.passwordBreached),
		).toBeInTheDocument();
		expect(password()).toHaveValue("");
		expect(email()).toHaveValue("asha@example.com");
		expect(name()).toHaveValue("Asha");
	});

	test("typing a new password takes the breach message away", async () => {
		route("post", SIGN_UP, () => refusal("PASSWORD_BREACHED", 400));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		await screen.findByText(AUTH_MESSAGES.passwordBreached);
		await user.type(password(), "another long password");
		expect(
			screen.queryByText(AUTH_MESSAGES.passwordBreached),
		).not.toBeInTheDocument();
	});

	test("a refused name says so under the name, and keeps the other fields", async () => {
		route("post", SIGN_UP, () => refusal("INVALID_NAME", 400));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		expect(await screen.findByText(AUTH_MESSAGES.name)).toBeInTheDocument();
		expect(name()).toHaveAttribute("aria-invalid", "true");
		expect(password()).toHaveValue(PASSWORD);
	});

	test.each([
		["INVALID_EMAIL", 400, AUTH_MESSAGES.emailInvalid],
		["PASSWORD_TOO_SHORT", 400, AUTH_MESSAGES.passwordTooShort],
		["PASSWORD_TOO_LONG", 400, AUTH_MESSAGES.passwordTooLong],
	])("Better Auth's %s shows under its field", async (code, status, message) => {
		route("post", SIGN_UP, () => refusal(code, status));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		expect(await screen.findByText(message)).toBeInTheDocument();
	});

	// BR-F01-08
	test("too many attempts shows the rate-limit line above the button", async () => {
		route("post", SIGN_UP, () => new HttpResponse(null, { status: 429 }));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		expect(await screen.findByRole("alert")).toHaveTextContent(
			AUTH_MESSAGES.rateLimited,
		);
	});

	test.each([
		["a server error", () => refusal("INTERNAL_SERVER_ERROR", 500)],
		["no answer", () => HttpResponse.error()],
		["an unknown code", () => refusal("SOMETHING_NEW", 400)],
	])(
		"%s shows the generic line, and the form can be sent again",
		async (_name, respond) => {
			route("post", SIGN_UP, respond);
			const { user } = setup();
			await fill(user);
			await user.click(submit());
			expect(await screen.findByRole("alert")).toHaveTextContent(
				AUTH_MESSAGES.failed,
			);
			expect(email()).not.toBeDisabled();
			expect(submit()).not.toHaveAttribute("data-pending");
		},
	);

	test("a new submit clears the last form-level line", async () => {
		let answer = () => refusal("INTERNAL_SERVER_ERROR", 500);
		authNetwork.use();
		route("post", SIGN_UP, () => answer());
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		await screen.findByRole("alert");
		answer = signedUp;
		await user.click(submit());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
	});
});

describe("offline (F01 section 6)", () => {
	test("disables the form with the offline line", () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		setup();
		expect(screen.getByRole("status")).toHaveTextContent(AUTH_MESSAGES.offline);
		expect(email()).toBeDisabled();
		expect(password()).toBeDisabled();
		expect(name()).toBeDisabled();
		expect(submit()).toHaveAttribute("aria-disabled", "true");
	});

	test("sends nothing offline, even on Enter", async () => {
		const calls = route("post", SIGN_UP, signedUp);
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user } = setup();
		await user.click(submit());
		await user.keyboard("{Enter}");
		expect(calls).toHaveLength(0);
	});

	test("comes back when the connection does", async () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		setup();
		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(screen.queryByText(AUTH_MESSAGES.offline)).not.toBeInTheDocument();
		expect(email()).not.toBeDisabled();
	});
});

describe("a logout that never finished (BR-F01-15, D-384)", () => {
	test("is signed out first; then the sign-up goes on and the marker goes", async () => {
		document.cookie = "daybook_logout=1; Path=/";
		const signOuts = route("post", SIGN_OUT, () =>
			HttpResponse.json({ success: true }),
		);
		const signUps = route("post", SIGN_UP, signedUp);
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/onboarding"));
		expect(signOuts).toHaveLength(1);
		expect(signUps).toHaveLength(1);
		expect(hasLogoutMarker()).toBe(false);
	});

	test("when that sign-out fails, nothing signs up and the form says so", async () => {
		document.cookie = "daybook_logout=1; Path=/";
		route("post", SIGN_OUT, () => new HttpResponse(null, { status: 503 }));
		const signUps = route("post", SIGN_UP, signedUp);
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		expect(await screen.findByRole("alert")).toHaveTextContent(
			AUTH_MESSAGES.oldSession,
		);
		expect(signUps).toHaveLength(0);
		expect(navigate).not.toHaveBeenCalled();
		expect(hasLogoutMarker()).toBe(true);
	});
});

describe("the strength meter (BR-F01-04)", () => {
	test("rates the password as it is typed, and never blocks submission", async () => {
		const calls = route("post", SIGN_UP, signedUp);
		const { user, navigate } = setup();
		await fill(user, { password: "password1234" });
		expect(
			await screen.findByText(/Password strength: Weak/),
		).toBeInTheDocument();
		await user.click(submit());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(calls).toHaveLength(1);
	});
});

describe("edges", () => {
	test("a submit the page sends itself while offline sends nothing", async () => {
		const calls = route("post", SIGN_UP, signedUp);
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { container } = setup();
		act(() => container.querySelector("form")!.requestSubmit());
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(calls).toHaveLength(0);
	});

	test("typing in another field leaves a field's server message alone", async () => {
		route("post", SIGN_UP, () => refusal("INVALID_NAME", 400));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		await screen.findByText(AUTH_MESSAGES.name);
		await user.type(email(), "x");
		expect(screen.getByText(AUTH_MESSAGES.name)).toBeInTheDocument();
	});
});
