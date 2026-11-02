// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";

import { loadScorer, strengthLabel } from "../strength";

describe("strengthLabel (BR-F01-04, D-509)", () => {
	test.each([
		[0, "Weak"],
		[1, "Weak"],
		[2, "Fair"],
		[3, "Good"],
		[4, "Strong"],
	] as const)("score %i is %s", (score, label) => {
		expect(strengthLabel(score)).toBe(label);
	});
});

describe("loadScorer", () => {
	// Scores from zxcvbn-ts 4.2.0 with the common and English dictionaries, worked out once by
	// running it directly; the test checks the meter's wiring gives the same.
	test.each([
		["password", 0],
		["summer2026", 1],
		["mangoes2026", 2],
		["Kolkata2026!", 3],
		["correct horse battery staple", 4],
	])("scores %j as %i", async (password, score) => {
		const scoreOf = await loadScorer();
		expect(scoreOf(password, [])).toBe(score);
	});

	test("counts the user's email and name against the password", async () => {
		const scoreOf = await loadScorer();
		expect(scoreOf("asha1234asha", [])).toBe(4);
		expect(scoreOf("asha1234asha", ["asha@example.com", "Asha"])).toBe(3);
	});

	test("loads once and reuses it", async () => {
		expect(loadScorer()).toBe(loadScorer());
		expect(await loadScorer()).toBe(await loadScorer());
	});
});

// zxcvbn-ts arrives as a separate download; this fakes that download failing (D-509).
describe("when zxcvbn-ts cannot be loaded", () => {
	afterEach(() => {
		vi.doUnmock("@zxcvbn-ts/core");
		vi.resetModules();
	});

	test("loadScorer fails, and the next call tries again", async () => {
		let fail = true;
		vi.doMock("@zxcvbn-ts/core", async (original) => {
			if (fail) throw new Error("chunk failed to load");
			return original();
		});
		vi.resetModules();
		const fresh = await import("../strength");
		await expect(fresh.loadScorer()).rejects.toThrow();
		fail = false;
		const score = await fresh.loadScorer();
		expect(score("password", [])).toBe(0);
	});
});
