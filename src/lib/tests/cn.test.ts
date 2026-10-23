import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

import { cn } from "@/lib/cn";

const stylesDir = join(import.meta.dirname, "../../styles");

/** Names declared as `--<prefix>-<name>:` in a style file, leaving out `--text-x--line-height`. */
function tokenNames(file: string, prefix: string): string[] {
	const css = readFileSync(join(stylesDir, file), "utf8").replace(
		/\/\*[\s\S]*?\*\//g,
		"",
	);
	const pattern = new RegExp(`^\\s*--${prefix}-((?:(?!--)[a-z0-9-])+)\\s*:`, "gm");
	return [...css.matchAll(pattern)].map(([, name = ""]) => name);
}

describe("joining", () => {
	test("drops falsy values and reads objects and arrays", () => {
		expect(
			cn("p-2", false, null, undefined, [
				"m-1",
				{ "text-ink": true, "text-neg": false },
			]),
		).toBe("p-2 m-1 text-ink");
	});
});

describe("Tailwind conflicts", () => {
	test("a later utility replaces an earlier one of the same kind", () => {
		expect(cn("px-4", "px-2")).toBe("px-2");
	});

	test("a more specific utility after a general one keeps both", () => {
		expect(cn("px-3.5", "pl-0")).toBe("px-3.5 pl-0");
	});

	test("a general utility after a specific one removes the specific one", () => {
		expect(cn("pl-0", "px-3.5")).toBe("px-3.5");
	});

	test("the same variant replaces itself, and a different variant stays", () => {
		expect(cn("pressed:bg-accent-hover", "pressed:bg-neg")).toBe(
			"pressed:bg-neg",
		);
		expect(cn("bg-accent", "pressed:bg-accent-hover")).toBe(
			"bg-accent pressed:bg-accent-hover",
		);
	});

	test("our own utilities are left alone", () => {
		expect(cn("figures", "focus-ring")).toBe("figures focus-ring");
	});
});

describe("Daybook tokens", () => {
	const sizes = tokenNames("typography.css", "text");
	const radii = tokenNames("space.css", "radius");
	const shadows = tokenNames("space.css", "shadow");

	test("the token files declare the names this suite checks", () => {
		expect(sizes).toEqual(
			expect.arrayContaining(["title", "heading", "body", "amount"]),
		);
		expect(radii).toEqual(
			expect.arrayContaining(["control", "section", "card"]),
		);
		expect(shadows).toEqual(expect.arrayContaining(["popover", "dialog"]));
	});

	test.each(sizes)("text-%s is a size, so a colour does not remove it", (name) => {
		expect(cn(`text-${name}`, "text-ink-2")).toBe(`text-${name} text-ink-2`);
		expect(cn("text-ink-2", `text-${name}`)).toBe(`text-ink-2 text-${name}`);
	});

	test.each(sizes)("text-%s replaces an earlier size", (name) => {
		expect(cn("text-sm", `text-${name}`)).toBe(`text-${name}`);
		expect(cn(`text-${name}`, "text-base")).toBe("text-base");
	});

	test.each(radii)("rounded-%s replaces an earlier radius", (name) => {
		expect(cn("rounded-md", `rounded-${name}`)).toBe(`rounded-${name}`);
	});

	test.each(radii)("rounded-t-%s replaces an earlier top radius", (name) => {
		expect(cn("rounded-t-md", `rounded-t-${name}`)).toBe(`rounded-t-${name}`);
	});

	test.each(shadows)("shadow-%s replaces an earlier shadow", (name) => {
		expect(cn("shadow-sm", `shadow-${name}`)).toBe(`shadow-${name}`);
	});

	test("colour classes replace each other", () => {
		expect(cn("text-ink", "text-ink-2")).toBe("text-ink-2");
		expect(cn("text-cat-food", "text-ink")).toBe("text-ink");
		expect(cn("bg-page", "bg-soft")).toBe("bg-soft");
		expect(cn("border-line", "border-edge")).toBe("border-edge");
	});

	test("a weight class does not remove a size", () => {
		expect(cn("text-amount", "font-bold")).toBe("text-amount font-bold");
	});
});

describe("component cases from the prototype pages", () => {
	test("a danger text button drops the left padding and swaps the colour", () => {
		expect(cn("px-3.5 text-accent", "text-neg pl-0")).toBe(
			"px-3.5 text-neg pl-0",
		);
	});

	test("a caller height replaces the size height", () => {
		expect(cn("inline-flex h-9.5", "h-11")).toBe("inline-flex h-11");
	});

	test("a caller adds flex-1 and justify-center without losing the base", () => {
		expect(cn("inline-flex items-center", "flex-1 justify-center")).toBe(
			"inline-flex items-center flex-1 justify-center",
		);
	});

	test("a section keeps its frame when the caller adds a grid", () => {
		expect(cn("rounded-section border border-line p-5.5", "grid gap-7")).toBe(
			"rounded-section border border-line p-5.5 grid gap-7",
		);
	});

	test("a caller padding replaces the section padding", () => {
		expect(cn("rounded-section p-5.5", "p-4")).toBe("rounded-section p-4");
	});
});
