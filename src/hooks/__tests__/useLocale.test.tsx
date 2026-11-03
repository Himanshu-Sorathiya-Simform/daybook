import { act, screen } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderToString } from "react-dom/server";

import { AppProviders } from "@/components/app/AppProviders";
import { browserLocale, latinDigits, useLocale } from "../useLocale";
import {
	GOLDEN_BLOCK,
	meFor,
	renderInApp,
	url,
} from "@/components/app/__tests__/helpers";

const network = setupServer();

beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function languages(list: string[]) {
	vi.spyOn(navigator, "languages", "get").mockReturnValue(list);
}

function LocaleView() {
	const locale = useLocale();
	return <pre>{JSON.stringify(locale)}</pre>;
}

const shown = () => JSON.parse(screen.getByText(/numberLocale/).textContent!);

describe("latinDigits (MON-4)", () => {
	test.each([
		["hi-IN", "hi-IN-u-nu-latn"],
		["ar-EG", "ar-EG-u-nu-latn"],
		["en", "en-u-nu-latn"],
		["fa-IR", "fa-IR-u-nu-latn"],
		// A tag that asks for other digits gets Latin ones instead.
		["ar-EG-u-nu-arab", "ar-EG-u-nu-latn"],
		["zh-Hans-CN", "zh-Hans-CN-u-nu-latn"],
	])("%s becomes %s", (tag, expected) => {
		expect(latinDigits(tag)).toBe(expected);
	});

	test.each(["", "!!", "en_US", "123"])(
		"an unreadable tag %j falls back to US English",
		(tag) => {
			expect(latinDigits(tag)).toBe("en-US-u-nu-latn");
		},
	);

	test("formats with Latin digits, even for a language whose own digits differ", () => {
		expect(new Intl.NumberFormat(latinDigits("ar-EG")).format(1234)).toMatch(
			/1.?234/,
		);
	});
});

describe("browserLocale (D-508)", () => {
	test("the browser's first language, Latin digits for numbers, its own zone", () => {
		expect(browserLocale("de-DE", "Europe/Berlin")).toEqual({
			numberLocale: "de-DE-u-nu-latn",
			dateLocale: "de-DE",
			timezone: "Europe/Berlin",
			currency: null,
			weekStart: null,
			fromProfile: false,
		});
	});

	test("normalizes the case of the tag", () => {
		expect(browserLocale("EN-gb", "UTC").dateLocale).toBe("en-GB");
	});

	test("without a language or a zone, US English in UTC", () => {
		expect(browserLocale(undefined, undefined)).toMatchObject({
			numberLocale: "en-US-u-nu-latn",
			dateLocale: "en-US",
			timezone: "UTC",
		});
	});

	test("an unreadable language falls back to US English for both", () => {
		expect(browserLocale("!!", "UTC")).toMatchObject({
			numberLocale: "en-US-u-nu-latn",
			dateLocale: "en-US",
		});
	});

	test("empty strings count as missing", () => {
		expect(browserLocale("", "")).toMatchObject({
			dateLocale: "en-US",
			timezone: "UTC",
		});
	});
});

describe("useLocale", () => {
	// BR-F02-18
	test("after onboarding, the profile's locales, zone, currency and week start", async () => {
		languages(["fr-FR"]);
		network.use(
			http.get(url("/api/me"), () => HttpResponse.json({ data: meFor("u1") })),
		);
		renderInApp(<LocaleView />);
		await screen.findByText(/hi-IN-u-nu-latn/);
		expect(shown()).toEqual({
			numberLocale: GOLDEN_BLOCK.numberLocale,
			dateLocale: GOLDEN_BLOCK.dateLocale,
			timezone: "Asia/Kolkata",
			currency: "INR",
			weekStart: "monday",
			fromProfile: true,
		});
	});

	// MON-4, D-508
	test("before onboarding, the browser's", async () => {
		languages(["fr-FR", "en-US"]);
		network.use(
			http.get(url("/api/me"), () =>
				HttpResponse.json({ data: meFor("u1", null) }),
			),
		);
		const { queryClient } = renderInApp(<LocaleView />);
		await vi.waitFor(() =>
			expect(queryClient.getQueryData(["me"])).toBeDefined(),
		);
		expect(shown()).toEqual({
			numberLocale: "fr-FR-u-nu-latn",
			dateLocale: "fr-FR",
			timezone: deviceZone(),
			currency: null,
			weekStart: null,
			fromProfile: false,
		});
	});

	test("while /api/me is loading, the browser's", () => {
		languages(["ja-JP"]);
		network.use(
			http.get(url("/api/me"), async () => {
				await delay("infinite");
				return HttpResponse.json({ data: meFor("u1") });
			}),
		);
		renderInApp(<LocaleView />);
		expect(shown()).toMatchObject({ dateLocale: "ja-JP", fromProfile: false });
	});

	test("when /api/me fails, the browser's", async () => {
		languages(["es-ES"]);
		network.use(
			http.get(url("/api/me"), () =>
				HttpResponse.json(
					{ error: { code: "internal", message: "m", requestId: "r" } },
					{ status: 500 },
				),
			),
		);
		const { queryClient } = renderInApp(<LocaleView />);
		await vi.waitFor(() =>
			expect(queryClient.getQueryState(["me"])?.status).toBe("error"),
		);
		expect(shown()).toMatchObject({ dateLocale: "es-ES", fromProfile: false });
	});

	test("a browser with no languages list uses navigator.language", () => {
		languages([]);
		vi.spyOn(navigator, "language", "get").mockReturnValue("pt-BR");
		network.use(
			http.get(url("/api/me"), async () => {
				await delay("infinite");
				return HttpResponse.json({ data: meFor("u1") });
			}),
		);
		renderInApp(<LocaleView />);
		expect(shown()).toMatchObject({ dateLocale: "pt-BR" });
	});

	test("follows a change of the browser's language", async () => {
		languages(["fr-FR"]);
		network.use(
			http.get(url("/api/me"), async () => {
				await delay("infinite");
				return HttpResponse.json({ data: meFor("u1") });
			}),
		);
		renderInApp(<LocaleView />);
		expect(shown()).toMatchObject({ dateLocale: "fr-FR" });
		languages(["it-IT"]);
		act(() => {
			window.dispatchEvent(new Event("languagechange"));
		});
		expect(shown()).toMatchObject({
			dateLocale: "it-IT",
			numberLocale: "it-IT-u-nu-latn",
		});
	});

	test("the profile wins over the browser's language once it arrives", async () => {
		languages(["fr-FR"]);
		network.use(
			http.get(url("/api/me"), () => HttpResponse.json({ data: meFor("u1") })),
		);
		renderInApp(<LocaleView />);
		expect(shown()).toMatchObject({ fromProfile: false });
		await screen.findByText(/hi-IN-u-nu-latn/);
		expect(shown()).toMatchObject({ fromProfile: true, dateLocale: "en-IN" });
	});

	test("stops listening for language changes once unmounted", () => {
		languages(["fr-FR"]);
		network.use(
			http.get(url("/api/me"), async () => {
				await delay("infinite");
				return HttpResponse.json({ data: meFor("u1") });
			}),
		);
		const removed = vi.spyOn(window, "removeEventListener");
		const { unmount } = renderInApp(<LocaleView />);
		unmount();
		expect(removed).toHaveBeenCalledWith("languagechange", expect.any(Function));
	});

	test("the server's render, before the browser is known, is US English in UTC", () => {
		languages(["fr-FR"]);
		const html = renderToString(
			<AppProviders navigate={vi.fn()}>
				<LocaleView />
			</AppProviders>,
		);
		const locale = JSON.parse(
			html.replace(/^<pre>|<\/pre>$/g, "").replaceAll("&quot;", '"'),
		);
		expect(locale).toEqual({
			numberLocale: "en-US-u-nu-latn",
			dateLocale: "en-US",
			timezone: "UTC",
			currency: null,
			weekStart: null,
			fromProfile: false,
		});
	});
});
