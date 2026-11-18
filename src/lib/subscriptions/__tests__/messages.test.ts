import { describe, expect, test } from "vitest";

import {
	endDateLimitMessage,
	fullDay,
	monthsWindowMessage,
	pauseUntilAfterMessage,
	pauseUntilLimitMessage,
	shortDay,
	startDateRangeMessage,
	SUBSCRIPTION_MESSAGES,
} from "../messages";

describe("the dates a message names", () => {
	test.each([
		["2026-11-05", "5 Nov"],
		["2026-01-01", "1 Jan"],
		["2026-12-31", "31 Dec"],
		["2028-02-29", "29 Feb"],
		["2026-10-09", "9 Oct"],
	])("shortDay %s is %s", (date, expected) => {
		expect(shortDay(date)).toBe(expected);
	});

	test.each([
		["2028-11-02", "2 Nov 2028"],
		["2016-11-02", "2 Nov 2016"],
		["2028-02-29", "29 Feb 2028"],
		["2026-01-05", "5 Jan 2026"],
	])("fullDay %s is %s", (date, expected) => {
		expect(fullDay(date)).toBe(expected);
	});

	test("is the same whatever zone the machine is in: dates are read in UTC", () => {
		expect(shortDay("2026-03-29")).toBe("29 Mar");
		expect(shortDay("2026-11-01")).toBe("1 Nov");
	});
});

// F05 section 8, word for word.
describe("F05 section 8's messages", () => {
	test("the date sentences", () => {
		expect(startDateRangeMessage("2016-11-02", "2027-11-02")).toBe(
			"Choose a date from 2 Nov 2016 to 2 Nov 2027.",
		);
		expect(pauseUntilAfterMessage("2026-11-05")).toBe(
			"Choose a date after 5 Nov.",
		);
		expect(pauseUntilLimitMessage("2028-11-02")).toBe(
			"Choose a date up to 2 Nov 2028.",
		);
		expect(endDateLimitMessage("2036-11-02")).toBe(
			"Choose an end date up to 2 Nov 2036.",
		);
		expect(monthsWindowMessage("2016-11", "2036-11")).toBe(
			"Choose months from Nov 2016 to Nov 2036.",
		);
	});

	test("the field messages", () => {
		expect(SUBSCRIPTION_MESSAGES).toMatchObject({
			nameRequired: "Enter a name, like Netflix or Rent.",
			nameTooLong: "Use 60 characters or fewer.",
			cadenceRequired: "Choose how often it repeats.",
			everyWeeks: "Enter how many weeks, from 1 to 52.",
			everyMonths: "Enter how many months, from 1 to 24.",
			categoryRequired: "Choose a category.",
			endBeforeStart: "The end date can't be before the start date.",
			changeTooOld:
				"This change is too old to apply. Discard it and make it again.",
		});
	});

	test("the rule messages", () => {
		expect(SUBSCRIPTION_MESSAGES).toMatchObject({
			skipNotUpcoming: "Only an upcoming charge can be skipped.",
			skipEdited:
				"This charge was edited, so it stays. Delete it in Transactions to skip it.",
			unskipPassed:
				"This charge date has passed, so it can't be brought back.",
			pauseFrom: "Choose a date with a charge to pause from.",
			doubleChargeSkip: "Choose a date with a charge to skip.",
			cannotUndo: "This change can't be undone any more.",
			notFound: "This Subscription was deleted on another device.",
			conflict: "This Subscription changed on another device.",
		});
	});

	test("shares Transactions' wording for amounts, ids and instants", () => {
		expect(SUBSCRIPTION_MESSAGES).toMatchObject({
			amountZero: "Enter an amount above zero.",
			amountWhole: "Send the amount as a whole number of minor units.",
			currency: "Use a supported currency.",
			currencyWithAmount: "Send the currency with the amount.",
			id: "Use a UUIDv7 id.",
			idInFuture:
				"This item's time is in the future. Check your device's clock.",
			instant: "Use an ISO date and time in UTC.",
			date: "Use a date as YYYY-MM-DD.",
			systemField: "Daybook sets this field.",
		});
	});

	test("no message uses an em dash or a question mark (docs rules)", () => {
		for (const message of Object.values(SUBSCRIPTION_MESSAGES)) {
			expect(message).not.toMatch(/—|\?/);
		}
	});

	test("every message ends with a full stop", () => {
		for (const message of Object.values(SUBSCRIPTION_MESSAGES)) {
			expect(message).toMatch(/\.$/);
		}
	});
});
