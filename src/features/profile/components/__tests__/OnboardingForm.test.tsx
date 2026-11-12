import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { renderInApp } from "@/components/app/__tests__/helpers";
import { OnboardingForm } from "../OnboardingForm";

const NOW = new Date("2026-11-02T06:30:00.000Z");

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

describe("OnboardingForm (F02 section 6)", () => {
	test("on the server, before the browser is known, the form shows disabled, loading", () => {
		const html = renderToString(
			<AppProviders navigate={vi.fn()}>
				<OnboardingForm />
			</AppProviders>,
		);
		expect(html).toContain('placeholder="Loading countries…"');
		expect(html).toContain("Loading countries and time zones.");
		expect(html).toContain('aria-busy="true"');
		// Nothing is guessed yet: no country and no zone.
		expect(html).not.toContain(`value="India"`);
		expect(html).not.toContain("GMT+");
	});

	test("in the browser, it reads the device and shows the form", () => {
		renderInApp(<OnboardingForm now={NOW} />);
		expect(
			screen.getByRole("combobox", { name: "Country" }),
		).toBeInTheDocument();
	});

	test("a given device wins over the browser's", () => {
		renderInApp(
			<OnboardingForm
				device={{ zone: "Asia/Kuwait", language: "en-US" }}
				now={NOW}
			/>,
		);
		expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue(
			"Kuwait",
		);
	});

	test("offsets use the time the page opened when none is given", () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-07-01T12:00:00Z"),
		});
		renderInApp(
			<OnboardingForm device={{ zone: "Europe/Berlin", language: "de-DE" }} />,
		);
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			"Berlin, most of Germany (GMT+02:00)",
		);
	});

	test("the time is fixed when the page opens, not on every render", () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-07-01T12:00:00Z"),
		});
		const { rerender } = render(
			<AppProviders navigate={vi.fn()}>
				<OnboardingForm
					device={{ zone: "Europe/Berlin", language: "de-DE" }}
				/>
			</AppProviders>,
		);
		vi.setSystemTime(new Date("2026-11-02T06:30:00Z"));
		rerender(
			<AppProviders navigate={vi.fn()}>
				<OnboardingForm
					device={{ zone: "Europe/Berlin", language: "de-DE" }}
				/>
			</AppProviders>,
		);
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			"GMT+02:00",
		);
	});
});
