import { describe, expect, test } from "vitest";

import { loginDestination } from "../destination";

const ORIGIN = "http://localhost:3000";

describe("loginDestination (BR-F01-09)", () => {
	// AC-F01-06
	test.each([
		"//evil.example",
		"/\\evil.example",
		"https://evil.example",
		"javascript:alert(1)",
	])("ignores %s and goes to /dashboard", (next) => {
		expect(loginDestination(next, ORIGIN)).toBe("/dashboard");
	});

	// AC-F01-06
	test("honours /transactions?cat=food", () => {
		expect(loginDestination("/transactions?cat=food", ORIGIN)).toBe(
			"/transactions?cat=food",
		);
	});

	test("without next, /dashboard", () => {
		expect(loginDestination(undefined, ORIGIN)).toBe("/dashboard");
	});

	test("an empty next is ignored", () => {
		expect(loginDestination("", ORIGIN)).toBe("/dashboard");
	});

	test("a repeated next names no single page, so it is ignored", () => {
		expect(loginDestination(["/goals", "/budgets"], ORIGIN)).toBe("/dashboard");
	});

	test("keeps a fragment and resolves dot segments inside the origin", () => {
		expect(loginDestination("/reports/../goals#top", ORIGIN)).toBe("/goals#top");
	});
});
