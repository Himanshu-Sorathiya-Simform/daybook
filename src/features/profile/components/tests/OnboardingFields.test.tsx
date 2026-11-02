import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { SessionExpiredBanner } from "@/components/app/SessionExpiredBanner";
import { renderInApp, url } from "@/components/app/tests/helpers";
import { isUuidV7 } from "@/lib/ids";
import { PROFILE_MESSAGES } from "@/lib/profile";
import { ONBOARDING_TEXT } from "../../lib/messages";
import type { Device } from "../../lib/onboarding";
import { OnboardingFields } from "../OnboardingFields";

const network = setupServer();
const PROFILE = url("/api/profile");
const NOW = new Date("2026-11-02T06:30:00.000Z");

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const KOLKATA: Device = { zone: "Asia/Kolkata", language: "en-US" };
const NOWHERE: Device = { zone: "UTC", language: "!!" };

const answer = (country = "IN") =>
	HttpResponse.json(
		{
			data: {
				profile: {
					country,
					currency: "INR",
					timezone: "Asia/Kolkata",
					weekStart: "sunday",
					numberLocale: "hi-IN-u-nu-latn",
					dateLocale: "en-IN",
				},
				version: 1,
				currencyEditable: true,
			},
		},
		{ status: 201 },
	);

/** Answers `POST /api/profile` with `respond`, keeping each request. */
function profileRoute(respond: () => Response | Promise<Response>) {
	const seen: { body: unknown; key: string | null }[] = [];
	network.use(
		http.post(PROFILE, async ({ request }) => {
			seen.push({
				body: await request.clone().json(),
				key: request.headers.get("idempotency-key"),
			});
			return respond();
		}),
	);
	return seen;
}

function setup(device: Device = KOLKATA) {
	const user = userEvent.setup();
	const view = renderInApp(
		<>
			<SessionExpiredBanner />
			<OnboardingFields
				device={device}
				at={NOW}
			/>
		</>,
	);
	return { user, ...view };
}

const country = () => screen.getByRole("combobox", { name: "Country" });
const currency = () => screen.getByRole("button", { name: /Currency/ });
const weekStart = () => screen.getByRole("radiogroup", { name: "Week starts on" });
const start = () => screen.getByRole("button", { name: /Start using Daybook/ });

async function chooseCountry(
	user: ReturnType<typeof userEvent.setup>,
	typed: string,
	name: string,
) {
	await user.clear(country());
	await user.type(country(), typed);
	await user.click(screen.getByRole("option", { name }));
}

describe("pre-fill (BR-F02-03 to BR-F02-06)", () => {
	// AC-F02-08 (the page part; the E2E test covers the browser's own zone)
	test("Asia/Kolkata with en-US pre-fills India, INR, Kolkata and Sunday", () => {
		setup();
		expect(country()).toHaveValue("India");
		expect(currency()).toHaveTextContent("Indian rupee (INR)");
		expect(screen.getByText("Kolkata (GMT+05:30)")).toBeInTheDocument();
		expect(
			within(weekStart()).getByRole("radio", { name: "Sunday" }),
		).toBeChecked();
	});

	test("a one-zone country shows its zone as text, not a list (D-511)", () => {
		setup();
		expect(
			screen.queryByRole("button", { name: /Time zone/ }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Time zone")).toBeInTheDocument();
	});

	test("a country with several zones offers them in a list, the device's chosen", () => {
		setup({ zone: "America/Chicago", language: "en-US" });
		expect(country()).toHaveValue("United States");
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			"Chicago, Central (most areas) (GMT-06:00)",
		);
	});

	test("with no guess, the country is empty, Start is disabled and the zone shows a dash", () => {
		setup(NOWHERE);
		expect(country()).toHaveValue("");
		expect(start()).toHaveAttribute("aria-disabled", "true");
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	test("every field has F02's helper text", () => {
		setup({ zone: "America/Chicago", language: "en-US" });
		expect(country()).toHaveAccessibleDescription(ONBOARDING_TEXT.countryHint);
		expect(screen.getByText(ONBOARDING_TEXT.currencyHint)).toBeInTheDocument();
		expect(screen.getByText(ONBOARDING_TEXT.timezoneHint)).toBeInTheDocument();
		expect(weekStart()).toHaveAccessibleDescription(
			ONBOARDING_TEXT.weekStartHint,
		);
	});
});

describe("choosing the country (BR-F02-07, D-511)", () => {
	test("re-derives currency, zone and week start", async () => {
		const { user } = setup();
		await chooseCountry(user, "germ", "Germany");
		expect(currency()).toHaveTextContent("Euro (EUR)");
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			"Berlin, most of Germany (GMT+01:00)",
		);
		expect(
			within(weekStart()).getByRole("radio", { name: "Monday" }),
		).toBeChecked();
	});

	test("keeps a currency the user picked", async () => {
		const { user } = setup();
		await user.click(currency());
		await user.click(screen.getByRole("option", { name: "US dollar (USD)" }));
		await chooseCountry(user, "germ", "Germany");
		expect(currency()).toHaveTextContent("US dollar (USD)");
	});

	test("keeps a week start the user picked", async () => {
		const { user } = setup();
		await user.click(
			within(weekStart()).getByRole("radio", { name: "Saturday" }),
		);
		await chooseCountry(user, "germ", "Germany");
		expect(
			within(weekStart()).getByRole("radio", { name: "Saturday" }),
		).toBeChecked();
	});

	test("replaces a picked zone that is not in the new country", async () => {
		const { user } = setup({ zone: "America/Chicago", language: "en-US" });
		await user.click(screen.getByRole("button", { name: /Time zone/ }));
		await user.click(screen.getByRole("option", { name: /^Denver/ }));
		await chooseCountry(user, "canada", "Canada");
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			/^Toronto/,
		);
	});

	test("values a country set are re-derived again by the next country", async () => {
		const { user } = setup();
		await chooseCountry(user, "germ", "Germany");
		await chooseCountry(user, "japan", "Japan");
		expect(currency()).toHaveTextContent("Japanese yen (JPY)");
		expect(
			within(weekStart()).getByRole("radio", { name: "Sunday" }),
		).toBeChecked();
		expect(screen.getByText("Tokyo (GMT+09:00)")).toBeInTheDocument();
	});

	test("a new country takes the server's field messages away", async () => {
		profileRoute(() =>
			HttpResponse.json(
				{
					error: {
						code: "validation_failed",
						message: "m",
						fields: { country: PROFILE_MESSAGES.countryUnknown },
						requestId: "r",
					},
				},
				{ status: 422 },
			),
		);
		const { user } = setup();
		await user.click(start());
		await screen.findByText(PROFILE_MESSAGES.countryUnknown);
		await chooseCountry(user, "germ", "Germany");
		expect(
			screen.queryByText(PROFILE_MESSAGES.countryUnknown),
		).not.toBeInTheDocument();
	});

	test("tabbing through a field without picking leaves it to the country", async () => {
		const { user } = setup();
		await user.click(country());
		await user.tab();
		await user.tab();
		await chooseCountry(user, "germ", "Germany");
		expect(currency()).toHaveTextContent("Euro (EUR)");
	});

	test("choosing the value a field already shows changes nothing: it still follows the country (D-511)", async () => {
		const { user } = setup();
		await user.click(currency());
		await user.click(screen.getByRole("option", { name: "Indian rupee (INR)" }));
		await chooseCountry(user, "germ", "Germany");
		expect(currency()).toHaveTextContent("Euro (EUR)");
	});

	test("a replaced zone follows the country again afterwards", async () => {
		const { user } = setup({ zone: "America/Chicago", language: "en-US" });
		await user.click(screen.getByRole("button", { name: /Time zone/ }));
		await user.click(screen.getByRole("option", { name: /^Denver/ }));
		await chooseCountry(user, "canada", "Canada");
		await chooseCountry(user, "united states", "United States");
		// Not Denver: the zone was re-derived in Canada, so the device's zone applies again.
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			/^Chicago/,
		);
	});

	test("finds a country from any part of its name, ignoring accents", async () => {
		const { user } = setup();
		await user.clear(country());
		await user.type(country(), "kingdom");
		expect(
			screen.getByRole("option", { name: "United Kingdom" }),
		).toBeInTheDocument();
		await user.clear(country());
		await user.type(country(), "cote");
		expect(
			screen.getByRole("option", { name: "Côte d’Ivoire" }),
		).toBeInTheDocument();
	});

	test("says so when no country matches", async () => {
		const { user } = setup();
		await user.clear(country());
		await user.type(country(), "atlantis");
		expect(screen.getByText(ONBOARDING_TEXT.noCountries)).toBeInTheDocument();
	});

	test("clearing the box keeps the country chosen before", async () => {
		const { user } = setup();
		await user.clear(country());
		await user.tab();
		expect(start()).not.toHaveAttribute("aria-disabled");
	});

	test("an empty country enables Start once chosen", async () => {
		const { user } = setup(NOWHERE);
		await chooseCountry(user, "india", "India");
		expect(start()).not.toHaveAttribute("aria-disabled");
		expect(screen.getByText("Kolkata (GMT+05:30)")).toBeInTheDocument();
	});
});

describe("submitting (flow 7.1)", () => {
	test("sends the four choices with a UUIDv7 key, then opens /transactions (D-241)", async () => {
		const seen = profileRoute(() => answer());
		const { user, navigate } = setup();
		await user.click(start());
		await waitFor(() =>
			expect(navigate).toHaveBeenCalledExactlyOnceWith("/transactions"),
		);
		expect(seen).toHaveLength(1);
		expect(seen[0]!.body).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "sunday",
		});
		expect(isUuidV7(seen[0]!.key)).toBe(true);
	});

	test("a 200 (a profile made in another tab, BR-F02-09) opens /transactions too", async () => {
		profileRoute(() => HttpResponse.json({ data: {} }, { status: 200 }));
		const { user, navigate } = setup();
		await user.click(start());
		await waitFor(() => expect(navigate).toHaveBeenCalledWith("/transactions"));
	});

	test("sends what the user changed", async () => {
		const seen = profileRoute(() => answer("DE"));
		const { user, navigate } = setup();
		await chooseCountry(user, "germ", "Germany");
		await user.click(currency());
		await user.click(screen.getByRole("option", { name: "US dollar (USD)" }));
		await user.click(within(weekStart()).getByRole("radio", { name: "Sunday" }));
		await user.click(start());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(seen[0]!.body).toEqual({
			country: "DE",
			currency: "USD",
			timezone: "Europe/Berlin",
			weekStart: "sunday",
		});
	});

	test("while it waits, the button spins, the fields are disabled and a second press sends nothing", async () => {
		const seen = profileRoute(async () => {
			await delay(150);
			return answer();
		});
		const { user, navigate } = setup();
		await user.click(start());
		await waitFor(() => expect(start()).toHaveAttribute("data-pending", "true"));
		expect(country()).toBeDisabled();
		await user.click(start());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(seen).toHaveLength(1);
	});

	test("a 422 shows the server's field message and moves focus there", async () => {
		profileRoute(() =>
			HttpResponse.json(
				{
					error: {
						code: "validation_failed",
						message: "Some fields need attention.",
						fields: { country: PROFILE_MESSAGES.countryUnknown },
						requestId: "r",
					},
				},
				{ status: 422 },
			),
		);
		const { user, navigate } = setup();
		await user.click(start());
		expect(
			await screen.findByText(PROFILE_MESSAGES.countryUnknown),
		).toBeInTheDocument();
		await waitFor(() => expect(country()).toHaveFocus());
		expect(navigate).not.toHaveBeenCalled();
		expect(screen.queryByText(ONBOARDING_TEXT.failed)).not.toBeInTheDocument();
	});

	test("a field message goes once that field changes", async () => {
		profileRoute(() =>
			HttpResponse.json(
				{
					error: {
						code: "validation_failed",
						message: "m",
						fields: { currency: PROFILE_MESSAGES.currency },
						requestId: "r",
					},
				},
				{ status: 422 },
			),
		);
		const { user } = setup();
		await user.click(start());
		await screen.findByText(PROFILE_MESSAGES.currency);
		await user.click(currency());
		await user.click(screen.getByRole("option", { name: "US dollar (USD)" }));
		expect(
			screen.queryByText(PROFILE_MESSAGES.currency),
		).not.toBeInTheDocument();
	});

	test("a zone or week-start message shows under its own field", async () => {
		profileRoute(() =>
			HttpResponse.json(
				{
					error: {
						code: "validation_failed",
						message: "m",
						fields: {
							timezone: PROFILE_MESSAGES.timezoneInCountry,
							weekStart: PROFILE_MESSAGES.weekStart,
						},
						requestId: "r",
					},
				},
				{ status: 422 },
			),
		);
		const { user } = setup();
		await user.click(start());
		expect(
			await screen.findByText(PROFILE_MESSAGES.timezoneInCountry),
		).toBeInTheDocument();
		expect(screen.getByText(PROFILE_MESSAGES.weekStart)).toBeInTheDocument();
		await user.click(within(weekStart()).getByRole("radio", { name: "Monday" }));
		expect(
			screen.queryByText(PROFILE_MESSAGES.weekStart),
		).not.toBeInTheDocument();
	});

	test.each([
		["a server error", () => new HttpResponse(null, { status: 500 })],
		["no answer", () => HttpResponse.error()],
		[
			"a 403",
			() =>
				HttpResponse.json(
					{ error: { code: "cross_origin" } },
					{ status: 403 },
				),
		],
	])(
		"%s shows F02's error line and the form can be sent again",
		async (_name, respond) => {
			profileRoute(respond);
			const { user } = setup();
			await user.click(start());
			expect(await screen.findByRole("alert")).toHaveTextContent(
				ONBOARDING_TEXT.failed,
			);
			expect(country()).not.toBeDisabled();
		},
	);

	test("a 401 shows the session-expired banner, not the error line", async () => {
		profileRoute(() =>
			HttpResponse.json(
				{ error: { code: "unauthenticated", message: "m", requestId: "r" } },
				{ status: 401 },
			),
		);
		const { user } = setup();
		await user.click(start());
		expect(
			await screen.findByText(
				"Your session has expired. Log in to keep saving changes.",
			),
		).toBeInTheDocument();
		expect(screen.queryByText(ONBOARDING_TEXT.failed)).not.toBeInTheDocument();
	});

	test("a new press clears the last error line", async () => {
		let respond = () => new HttpResponse(null, { status: 500 });
		profileRoute(() => respond());
		const { user, navigate } = setup();
		await user.click(start());
		await screen.findByText(ONBOARDING_TEXT.failed);
		respond = answer;
		await user.click(start());
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(screen.queryByText(ONBOARDING_TEXT.failed)).not.toBeInTheDocument();
	});

	test("with no country, nothing is sent, even if the page submits itself", async () => {
		const seen = profileRoute(() => answer());
		const { container } = setup(NOWHERE);
		act(() => container.querySelector("form")!.requestSubmit());
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(seen).toHaveLength(0);
	});
});

describe("offline (BR-F02-10)", () => {
	test("disables the form with F02's offline line, and sends nothing", async () => {
		const seen = profileRoute(() => answer());
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user, container } = setup();
		expect(screen.getByRole("status")).toHaveTextContent(
			ONBOARDING_TEXT.offline,
		);
		expect(country()).toBeDisabled();
		expect(start()).toHaveAttribute("aria-disabled", "true");
		await user.click(start());
		act(() => container.querySelector("form")!.requestSubmit());
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(seen).toHaveLength(0);
	});

	test("comes back when the connection does", () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		setup();
		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(country()).not.toBeDisabled();
	});
});

describe("keyboard (AC-F02-17)", () => {
	test("can be completed by keyboard alone", async () => {
		const seen = profileRoute(() => answer("DE"));
		const { user, navigate } = setup(NOWHERE);
		await user.tab();
		expect(country()).toHaveFocus();
		await user.keyboard("germ{ArrowDown}{Enter}");
		expect(country()).toHaveValue("Germany");
		// React Aria keeps the combobox's arrow button out of the Tab order.
		await user.tab();
		expect(currency()).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveFocus();
		await user.tab();
		expect(
			within(weekStart()).getByRole("radio", { name: "Monday" }),
		).toHaveFocus();
		await user.keyboard("{ArrowRight}");
		await user.tab();
		expect(start()).toHaveFocus();
		await user.keyboard("{Enter}");
		await waitFor(() => expect(navigate).toHaveBeenCalled());
		expect(seen[0]!.body).toMatchObject({ country: "DE", weekStart: "sunday" });
	});
});
