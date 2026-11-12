import { afterEach, describe, expect, test, vi } from "vitest";

import { handOverEmail, takeHandedEmail } from "../email-handoff";

afterEach(() => {
	sessionStorage.clear();
	vi.restoreAllMocks();
});

// BR-F01-31, D-510
describe("the email sign-up hands to login", () => {
	test("is taken back trimmed, once", () => {
		handOverEmail("  asha@example.com ");
		expect(takeHandedEmail()).toBe("asha@example.com");
		expect(takeHandedEmail()).toBeNull();
	});

	test("is nothing when none was left", () => {
		expect(takeHandedEmail()).toBeNull();
	});

	test("an empty email counts as none, and is removed too", () => {
		handOverEmail("   ");
		expect(takeHandedEmail()).toBeNull();
		expect(sessionStorage).toHaveLength(0);
	});

	test("a later hand-over replaces the earlier one", () => {
		handOverEmail("asha@example.com");
		handOverEmail("ravi@example.com");
		expect(takeHandedEmail()).toBe("ravi@example.com");
	});

	test("blocked storage leaves nothing and throws nothing", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new DOMException("blocked", "SecurityError");
		});
		expect(() => handOverEmail("asha@example.com")).not.toThrow();
		expect(takeHandedEmail()).toBeNull();
	});
});
