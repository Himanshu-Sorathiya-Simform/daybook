import { act, screen, waitFor } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { delay, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { clearLogoutMarker, hasLogoutMarker } from "@/lib/logout-marker";
import { LoginForm } from "../LoginForm";
import { handOverEmail, takeHandedEmail } from "../../lib/email-handoff";
import { AUTH_MESSAGES } from "../../lib/messages";
import {
	authNetwork,
	refusal,
	route,
	SIGN_IN,
	SIGN_OUT,
	USER,
} from "../../lib/__tests__/auth-network";

beforeAll(() => authNetwork.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	authNetwork.resetHandlers();
	clearLogoutMarker();
	sessionStorage.clear();
	vi.restoreAllMocks();
});
afterAll(() => authNetwork.close());

const PASSWORD = "correct horse battery";
const signedIn = () =>
	HttpResponse.json({ redirect: false, token: "t", user: USER });

const email = () => screen.getByRole("textbox", { name: "Email" });
const password = () => screen.getByLabelText("Password", { selector: "input" });
const submit = () => screen.getByRole("button", { name: /^Log in$/ });
const forgot = () => screen.getByRole("button", { name: "Forgot your password?" });

async function fill(user: UserEvent, e = "asha@example.com", p = PASSWORD) {
	if (e) await user.type(email(), e);
	if (p) await user.type(password(), p);
}

function setup(props: { destination?: string; expired?: boolean } = {}) {
	const user = userEvent.setup();
	const view = renderInApp(
		<LoginForm
			destination={props.destination ?? "/dashboard"}
			{...(props.expired !== undefined ? { expired: props.expired } : {})}
		/>,
	);
	return { user, ...view };
}

describe("the form (F01 section 6)", () => {
	test("has Email and Password, filled by password managers as a login", () => {
		setup();
		expect(email()).toHaveAttribute("type", "email");
		expect(email()).toHaveAttribute("autocomplete", "email");
		expect(password()).toHaveAttribute("type", "password");
		expect(password()).toHaveAttribute("autocomplete", "current-password");
		expect(
			screen.getByRole("button", { name: "Show password" }),
		).toBeInTheDocument();
	});

	test("offers Log in and a link to create an account", () => {
		setup();
		expect(submit()).toHaveAttribute("type", "submit");
		expect(screen.getByText(/New here\?/)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Create an account" }),
		).toHaveAttribute("href", "/signup");
	});

	test("can be completed by keyboard alone (AC-F01-16)", async () => {
		route("post", SIGN_IN, signedIn);
		const { user, navigate } = setup();
		await user.tab();
		expect(email()).toHaveFocus();
		await user.keyboard("asha@example.com");
		await user.tab();
		expect(password()).toHaveFocus();
		await user.keyboard(`${PASSWORD}{Enter}`);
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/dashboard"));
	});
});

describe("Forgot your password? (BR-F01-29)", () => {
	test("is closed at first", () => {
		setup();
		expect(forgot()).toHaveAttribute("aria-expanded", "false");
		expect(screen.queryByText(AUTH_MESSAGES.forgotPassword)).not.toBeVisible();
	});

	test("opens its note under the link, and closes it again", async () => {
		const { user } = setup();
		await user.click(forgot());
		expect(forgot()).toHaveAttribute("aria-expanded", "true");
		const note = screen.getByText(AUTH_MESSAGES.forgotPassword);
		expect(note).toBeVisible();
		expect(forgot()).toHaveAttribute("aria-controls", note.id);
		await user.click(forgot());
		expect(note).not.toBeVisible();
	});

	test("never submits the form", async () => {
		const calls = route("post", SIGN_IN, signedIn);
		const { user } = setup();
		await fill(user);
		await user.click(forgot());
		expect(calls).toHaveLength(0);
	});
});

describe("after an expired session", () => {
	test("says so above the fields with expired=1", () => {
		setup({ expired: true });
		const note = screen.getByRole("status");
		expect(note).toHaveTextContent(AUTH_MESSAGES.expired);
		expect(
			note.compareDocumentPosition(email()) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("says nothing otherwise", () => {
		setup();
		expect(screen.queryByText(AUTH_MESSAGES.expired)).not.toBeInTheDocument();
	});
});

// BR-F01-31, D-510
describe("the email sign-up hands over", () => {
	test("fills the email, once: the next visit starts empty", async () => {
		handOverEmail("asha@example.com");
		setup();
		await waitFor(() => expect(email()).toHaveValue("asha@example.com"));
		expect(takeHandedEmail()).toBeNull();
	});

	test("without one, the email starts empty", () => {
		setup();
		expect(email()).toHaveValue("");
	});
});

describe("checks (D-510)", () => {
	test("an empty submit asks for both, sends nothing and focuses the email", async () => {
		const calls = route("post", SIGN_IN, signedIn);
		const { user } = setup();
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.emailRequired),
		).toBeInTheDocument();
		expect(screen.getByText(AUTH_MESSAGES.passwordRequired)).toBeInTheDocument();
		await waitFor(() => expect(email()).toHaveFocus());
		expect(calls).toHaveLength(0);
	});

	test("a short password is still sent: only the server knows the password", async () => {
		const calls = route("post", SIGN_IN, () =>
			refusal("INVALID_EMAIL_OR_PASSWORD", 401),
		);
		const { user } = setup();
		await fill(user, "asha@example.com", "short");
		await user.click(submit());
		await screen.findByRole("alert");
		expect(calls).toEqual([{ email: "asha@example.com", password: "short" }]);
	});

	test("after a submit, a field is checked again as it changes", async () => {
		const { user } = setup();
		await user.type(email(), "asha");
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.emailInvalid),
		).toBeInTheDocument();
		await user.type(email(), "@example.com");
		await waitFor(() =>
			expect(
				screen.queryByText(AUTH_MESSAGES.emailInvalid),
			).not.toBeInTheDocument(),
		);
	});
});

describe("submitting (flow 7.2)", () => {
	test("sends the email trimmed and the password as typed, then opens the destination", async () => {
		const calls = route("post", SIGN_IN, signedIn);
		const { user, navigate } = setup({ destination: "/transactions?cat=food" });
		await fill(user, "  asha@example.com ", ` ${PASSWORD}`);
		await user.click(submit());
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledExactlyOnceWith(
				"/transactions?cat=food",
			),
		);
		expect(calls).toEqual([
			{ email: "asha@example.com", password: ` ${PASSWORD}` },
		]);
	});

	test("while it waits, the button spins and the fields are disabled", async () => {
		const calls = route("post", SIGN_IN, async () => {
			await delay(150);
			return signedIn();
		});
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		await waitFor(() =>
			expect(submit()).toHaveAttribute("data-pending", "true"),
		);
		expect(email()).toBeDisabled();
		expect(password()).toBeDisabled();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(calls).toHaveLength(1);
	});
});

describe("refusals (F01 section 8)", () => {
	// BR-F01-07, AC-F01-04
	test("a wrong email or password reads the same, at the top with focus, and keeps the email", async () => {
		route("post", SIGN_IN, () => refusal("INVALID_EMAIL_OR_PASSWORD", 401));
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		const alert = await screen.findByRole("alert");
		expect(alert).toHaveTextContent(AUTH_MESSAGES.wrongCredentials);
		await waitFor(() => expect(alert).toHaveFocus());
		expect(
			alert.compareDocumentPosition(email())
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(email()).toHaveValue("asha@example.com");
		expect(email()).not.toHaveAttribute("aria-invalid", "true");
		expect(navigate).not.toHaveBeenCalled();
	});

	// BR-F01-08, AC-F01-05
	test("too many attempts shows the rate-limit line", async () => {
		route("post", SIGN_IN, () =>
			HttpResponse.json(
				{ message: "Too many requests. Please try again later." },
				{ status: 429 },
			),
		);
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
	])("%s shows the generic line", async (_name, respond) => {
		route("post", SIGN_IN, respond);
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		expect(await screen.findByRole("alert")).toHaveTextContent(
			AUTH_MESSAGES.failed,
		);
		expect(email()).not.toBeDisabled();
	});

	test("a 401 from Better Auth never shows the session-expired banner (BR-F01-13)", async () => {
		route("post", SIGN_IN, () => refusal("INVALID_EMAIL_OR_PASSWORD", 401));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		await screen.findByRole("alert");
		expect(
			screen.queryByText(
				"Your session has expired. Log in to keep saving changes.",
			),
		).not.toBeInTheDocument();
	});
});

describe("offline (F01 section 6)", () => {
	test("disables the form with the offline line, and sends nothing", async () => {
		const calls = route("post", SIGN_IN, signedIn);
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user } = setup();
		expect(screen.getByRole("status")).toHaveTextContent(AUTH_MESSAGES.offline);
		expect(email()).toBeDisabled();
		expect(password()).toBeDisabled();
		expect(submit()).toHaveAttribute("aria-disabled", "true");
		await user.click(submit());
		expect(calls).toHaveLength(0);
	});

	test("comes back when the connection does", () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		setup();
		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(email()).not.toBeDisabled();
	});
});

describe("a logout that never finished (BR-F01-15, D-384)", () => {
	test("is signed out first; then the login goes on and the marker goes", async () => {
		document.cookie = "daybook_logout=1; Path=/";
		const signOuts = route("post", SIGN_OUT, () => refusal("UNAUTHORIZED", 401));
		const signIns = route("post", SIGN_IN, signedIn);
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(signOuts).toHaveLength(1);
		expect(signIns).toHaveLength(1);
		expect(hasLogoutMarker()).toBe(false);
	});

	test("when that sign-out fails, nothing signs in and the form says so", async () => {
		document.cookie = "daybook_logout=1; Path=/";
		route("post", SIGN_OUT, () => HttpResponse.error());
		const signIns = route("post", SIGN_IN, signedIn);
		const { user, navigate } = setup();
		await fill(user);
		await user.click(submit());
		expect(await screen.findByRole("alert")).toHaveTextContent(
			AUTH_MESSAGES.oldSession,
		);
		expect(signIns).toHaveLength(0);
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe("edges", () => {
	test("a field code from Better Auth shows under that field, and typing takes it away", async () => {
		route("post", SIGN_IN, () => refusal("INVALID_EMAIL", 400));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		expect(
			await screen.findByText(AUTH_MESSAGES.emailInvalid),
		).toBeInTheDocument();
		await waitFor(() => expect(email()).toHaveFocus());
		await user.type(email(), "x");
		expect(
			screen.queryByText(AUTH_MESSAGES.emailInvalid),
		).not.toBeInTheDocument();
	});

	test("typing in another field leaves a field's server message alone", async () => {
		route("post", SIGN_IN, () => refusal("INVALID_EMAIL", 400));
		const { user } = setup();
		await fill(user);
		await user.click(submit());
		await screen.findByText(AUTH_MESSAGES.emailInvalid);
		await user.type(password(), "x");
		expect(screen.getByText(AUTH_MESSAGES.emailInvalid)).toBeInTheDocument();
	});

	test("a submit the page sends itself while offline sends nothing", async () => {
		const calls = route("post", SIGN_IN, signedIn);
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { container } = setup();
		act(() => container.querySelector("form")!.requestSubmit());
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(calls).toHaveLength(0);
	});
});
