import { describe, expect, test } from "vitest";

import {
	deviceSuggestions,
	hasExactPayee,
	MAX_SUGGESTIONS,
	mergeSuggestions,
	payeeQueryText,
	RECENT_COUNT,
} from "../suggestions";
import { GOLDEN_PAYEES, named } from "./fixtures";

const payees = (items: { payee: string }[]) => items.map((item) => item.payee);

describe("the counts", () => {
	test("8 suggestions while typing and 5 while empty (BR-F03-45)", () => {
		expect(MAX_SUGGESTIONS).toBe(8);
		expect(RECENT_COUNT).toBe(5);
	});
});

describe("payeeQueryText (BR-F03-12, BR-F03-61)", () => {
	test("trims the ends", () => {
		expect(payeeQueryText("  Swi  ")).toBe("Swi");
		expect(payeeQueryText("\tSwi\n")).toBe("Swi");
	});

	test("keeps inner spaces and case", () => {
		expect(payeeQueryText("Sunrise Apa")).toBe("Sunrise Apa");
	});

	test("normalizes to NFC, so a decomposed é searches as the composed one", () => {
		expect(payeeQueryText("Café")).toBe("Café");
	});

	test.each([
		["empty", ""],
		["spaces", "   "],
		["a zero-width space", "​"],
		["a zero-width joiner and spaces", " ‍ "],
	])("%s is nothing to search for", (_name, text) => {
		expect(payeeQueryText(text)).toBeNull();
	});

	test.each([
		["a tab inside", "Swi\tggy"],
		["a NUL", "Swi\u0000"],
		["a DEL", "Swi\u007f"],
		["a C1 control", "Swi\u0085"],
		["a line separator", "Swi ggy"],
		["a lone surrogate", "Swi\ud800"],
	])("text with %s is never sent, since the server refuses it", (_name, text) => {
		expect(payeeQueryText(text)).toBeNull();
	});

	test("80 code points are a payee; 81 are not", () => {
		expect(payeeQueryText("a".repeat(80))).toBe("a".repeat(80));
		expect(payeeQueryText("a".repeat(81))).toBeNull();
	});

	test("length counts code points, so 80 emoji pass though they are 160 UTF-16 units", () => {
		expect(payeeQueryText("☕".repeat(80))).not.toBeNull();
		expect(payeeQueryText("😀".repeat(80))).toBe("😀".repeat(80));
		expect(payeeQueryText("😀".repeat(81))).toBeNull();
	});

	test("the length is counted after trimming", () => {
		expect(payeeQueryText(` ${"a".repeat(80)} `)).toBe("a".repeat(80));
	});
});

describe("deviceSuggestions (BR-F03-45)", () => {
	test("matches the start of the payee", () => {
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "swi"))).toEqual(["Swiggy"]);
	});

	// AC-F03-44, the device side of the shared rule
	test("matches the start of a later word", () => {
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "apart"))).toEqual([
			"Sunrise Apartments",
		]);
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "o"))).toEqual([
			"Indian Oil",
		]);
	});

	test("never matches inside a word", () => {
		expect(deviceSuggestions(GOLDEN_PAYEES, "rise")).toEqual([]);
		expect(deviceSuggestions(GOLDEN_PAYEES, "iggy")).toEqual([]);
	});

	test("ignores case", () => {
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "SWI"))).toEqual(["Swiggy"]);
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "aCmE c"))).toEqual([
			"Acme Corp",
		]);
	});

	test("lowers as Postgres lowers, so ist finds İstanbul (D-497)", () => {
		expect(payees(deviceSuggestions([named("İstanbul Kebab")], "ist"))).toEqual([
			"İstanbul Kebab",
		]);
	});

	test("keeps the list's own order, count first (BR-F03-44)", () => {
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "c"))).toEqual([
			"Croma",
			"Acme Corp",
			"Cult Gym",
		]);
	});

	test("gives at most 8, the first 8 in order", () => {
		const many = Array.from({ length: 12 }, (_, i) => named(`Shop ${i}`));
		expect(payees(deviceSuggestions(many, "shop"))).toEqual(
			Array.from({ length: 8 }, (_, i) => `Shop ${i}`),
		);
	});

	test("gives all of them when fewer than 8 match", () => {
		const some = Array.from({ length: 7 }, (_, i) => named(`Shop ${i}`));
		expect(deviceSuggestions(some, "shop")).toHaveLength(7);
	});

	test("an empty list suggests nothing", () => {
		expect(deviceSuggestions([], "swi")).toEqual([]);
	});

	test("a whole payee matches itself", () => {
		expect(
			payees(deviceSuggestions(GOLDEN_PAYEES, "Sunrise Apartments")),
		).toEqual(["Sunrise Apartments"]);
	});

	test("a space before the word matters: 'n' finds Netflix and Studio Nine", () => {
		expect(payees(deviceSuggestions(GOLDEN_PAYEES, "n"))).toEqual([
			"Netflix",
			"Studio Nine",
		]);
	});
});

describe("mergeSuggestions (BR-F03-61)", () => {
	test("the device's come first, then the server's", () => {
		expect(
			payees(mergeSuggestions([named("Swiggy")], [named("Swiggy Instamart")])),
		).toEqual(["Swiggy", "Swiggy Instamart"]);
	});

	test("a server payee already listed is left out, compared as lower() compares", () => {
		expect(
			payees(
				mergeSuggestions(
					[named("Swiggy")],
					[named("SWIGGY"), named("swiggy"), named("Swiggy Genie")],
				),
			),
		).toEqual(["Swiggy", "Swiggy Genie"]);
	});

	test("the device's spelling wins over the server's for the same payee", () => {
		const merged = mergeSuggestions([named("swiggy")], [named("Swiggy")]);
		expect(payees(merged)).toEqual(["swiggy"]);
	});

	test("two server payees that differ only in case are listed once", () => {
		expect(
			payees(mergeSuggestions([], [named("Zomato"), named("ZOMATO")])),
		).toEqual(["Zomato"]);
	});

	test("stops at 8 in all", () => {
		const device = Array.from({ length: 5 }, (_, i) => named(`Device ${i}`));
		const server = Array.from({ length: 6 }, (_, i) => named(`Server ${i}`));
		expect(payees(mergeSuggestions(device, server))).toEqual([
			"Device 0",
			"Device 1",
			"Device 2",
			"Device 3",
			"Device 4",
			"Server 0",
			"Server 1",
			"Server 2",
		]);
	});

	test("8 device suggestions leave no room for the server's", () => {
		const device = Array.from({ length: 8 }, (_, i) => named(`Device ${i}`));
		expect(mergeSuggestions(device, [named("Server")])).toHaveLength(8);
		expect(payees(mergeSuggestions(device, [named("Server")]))).not.toContain(
			"Server",
		);
	});

	test("more than 8 device suggestions are cut to 8", () => {
		const device = Array.from({ length: 10 }, (_, i) => named(`Device ${i}`));
		expect(mergeSuggestions(device, [])).toHaveLength(8);
	});

	test("nothing from either side is nothing", () => {
		expect(mergeSuggestions([], [])).toEqual([]);
	});

	test("never changes the lists it was given", () => {
		const device = [named("A")];
		const server = [named("B")];
		mergeSuggestions(device, server);
		expect(payees(device)).toEqual(["A"]);
		expect(payees(server)).toEqual(["B"]);
	});
});

describe("hasExactPayee", () => {
	test("a suggestion equal to the text, in any case, is exact", () => {
		expect(hasExactPayee([named("Swiggy")], "swiggy")).toBe(true);
		expect(hasExactPayee([named("Swiggy")], "SWIGGY")).toBe(true);
	});

	test("a suggestion that only starts with the text is not exact", () => {
		expect(hasExactPayee([named("Swiggy")], "Swigg")).toBe(false);
	});

	test("Postgres lowering decides, so İstanbul equals istanbul", () => {
		expect(hasExactPayee([named("İstanbul")], "istanbul")).toBe(true);
	});

	test("no suggestions are never exact", () => {
		expect(hasExactPayee([], "Swiggy")).toBe(false);
	});
});
