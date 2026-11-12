import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { ONBOARDING_TEXT } from "../../lib/messages";
import { TimeZoneField } from "../TimeZoneField";

const NOW = new Date("2026-11-02T06:30:00.000Z");

describe("TimeZoneField (F02 section 6, D-511)", () => {
	test("a country with several zones gets a list, showing the chosen one", () => {
		render(
			<TimeZoneField
				country="US"
				value="America/Chicago"
				onChange={vi.fn()}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
			/>,
		);
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			"Chicago, Central (most areas) (GMT-06:00)",
		);
	});

	test("picking a zone reports its name", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<TimeZoneField
				country="DE"
				value="Europe/Berlin"
				onChange={onChange}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
			/>,
		);
		await user.click(screen.getByRole("button", { name: /Time zone/ }));
		await user.click(screen.getByRole("option", { name: /^Busingen/ }));
		expect(onChange).toHaveBeenCalledExactlyOnceWith("Europe/Busingen");
	});

	test("a country with one zone shows it as text, with its offset", () => {
		render(
			<TimeZoneField
				country="IN"
				value="Asia/Kolkata"
				onChange={vi.fn()}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
			/>,
		);
		expect(screen.getByText("Kolkata (GMT+05:30)")).toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.getByText(ONBOARDING_TEXT.timezoneHint)).toBeInTheDocument();
	});

	// D-511: nothing to choose until there is a country.
	test("before a country, a disabled list says to choose a country first", async () => {
		const user = userEvent.setup();
		render(
			<TimeZoneField
				country={null}
				value="UTC"
				onChange={vi.fn()}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
			/>,
		);
		const trigger = screen.getByRole("button", { name: /Time zone/ });
		expect(trigger).toHaveTextContent("Choose a country first");
		expect(trigger).not.toHaveTextContent("UTC");
		expect(trigger).toBeDisabled();
		await user.click(trigger);
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});

	test("while the page loads, the list is empty", () => {
		render(
			<TimeZoneField
				country={null}
				value="UTC"
				onChange={vi.fn()}
				at={NOW}
				placeholder=""
			/>,
		);
		expect(screen.getByRole("button", { name: /Time zone/ })).toHaveTextContent(
			/^$/,
		);
	});

	test("an error replaces the hint, in the list and in the text", () => {
		const { rerender } = render(
			<TimeZoneField
				country="IN"
				value="Asia/Kolkata"
				onChange={vi.fn()}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
				error="Choose a time zone in your country."
			/>,
		);
		expect(
			screen.getByText("Choose a time zone in your country."),
		).toBeInTheDocument();
		expect(
			screen.queryByText(ONBOARDING_TEXT.timezoneHint),
		).not.toBeInTheDocument();
		rerender(
			<TimeZoneField
				country="US"
				value="America/New_York"
				onChange={vi.fn()}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
				error="Choose a time zone in your country."
			/>,
		);
		expect(
			screen.getByText("Choose a time zone in your country."),
		).toBeInTheDocument();
	});

	test("disabled, the list cannot be opened", async () => {
		const user = userEvent.setup();
		render(
			<TimeZoneField
				country="US"
				value="America/New_York"
				onChange={vi.fn()}
				at={NOW}
				placeholder={ONBOARDING_TEXT.chooseCountryFirst}
				isDisabled
			/>,
		);
		await user.click(screen.getByRole("button", { name: /Time zone/ }));
		expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
	});
});
