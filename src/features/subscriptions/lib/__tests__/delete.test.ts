import { describe, expect, test } from "vitest";

import { chargesLine, DELETE_TEXT, offersCancel } from "../delete";

describe("the Delete confirmation's words (BR-F05-44)", () => {
	test("the title and buttons name the Subscription", () => {
		expect(DELETE_TEXT.title("Netflix")).toBe("Delete Netflix?");
		expect(DELETE_TEXT.keep("Netflix")).toBe("Keep Netflix");
		expect(DELETE_TEXT.delete("Netflix")).toBe("Delete Netflix");
	});

	test("says Daybook forgets the schedule and skipped dates", () => {
		expect(DELETE_TEXT.forgets).toBe(
			"Daybook stops adding charges and forgets the schedule and skipped dates.",
		);
	});

	test("its failure reads as the spec words it", () => {
		expect(DELETE_TEXT.failed).toBe(
			"The Subscription could not be deleted. Check your connection and try again.",
		);
	});

	test.each([
		[0, "It has no charges yet, so nothing changes in Transactions."],
		[1, "Its 1 charge stays in Transactions as an ordinary expense."],
		[2, "Its 2 charges stay in Transactions as ordinary expenses."],
		[101, "Its 101 charges stay in Transactions as ordinary expenses."],
	])("%i charges read %j", (count, line) => {
		expect(chargesLine(count)).toBe(line);
	});
});

describe("when it offers to cancel instead (BR-F05-44)", () => {
	test.each([
		["active", true],
		["ending", true],
		["paused", true],
		["upcoming", false],
		["ended", false],
	] as const)("a %s Subscription: %s", (status, offered) => {
		expect(offersCancel({ status })).toBe(offered);
	});
});
