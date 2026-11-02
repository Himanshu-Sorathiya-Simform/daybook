import { describe, expect, test } from "vitest";

import { ONBOARDING_TEXT } from "../messages";

describe("ONBOARDING_TEXT (F02 sections 6 and 8, D-511)", () => {
	test("holds F02's exact wording", () => {
		expect(ONBOARDING_TEXT).toEqual({
			title: "Set up Daybook",
			intro: "Four quick choices. We filled in our best guesses.",
			submit: "Start using Daybook",
			countryHint:
				"Sets your number format and the currency of Daybook Premium. It can't be changed later.",
			currencyHint:
				"All your amounts use this currency. It's fixed once you add finance data.",
			timezoneHint:
				'Decides what "today" is and how times are shown. You can change it later.',
			weekStartHint: "Used in weekly charts and calendars.",
			noCountries: "No countries match.",
			offline: "You are offline. Connect to finish setup.",
			failed: "We couldn't save your setup. Try again.",
		});
	});
});
