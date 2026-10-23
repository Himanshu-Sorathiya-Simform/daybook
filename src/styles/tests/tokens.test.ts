import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const stylesDir = join(import.meta.dirname, "..");
const globalsPath = join(import.meta.dirname, "../../../app/globals.css");

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const read = (file: string) =>
	withoutComments(readFileSync(join(stylesDir, file), "utf8"));
const cssFiles = readdirSync(stylesDir).filter((file) => file.endsWith(".css"));

/** Variable names declared in a flat `selector { ... }` block, found by selector. */
function declared(css: string, selector: string): string[] {
	const names: string[] = [];
	for (const [, sel = "", body = ""] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		if (sel.trim().split(/\s+/).pop() !== selector) continue;
		for (const [, name = ""] of body.matchAll(/(--[\w-]+)\s*:/g))
			names.push(name);
	}
	return names;
}

/** The `--color-x: var(--y)` pairs of every `@theme inline` block. */
function colourClasses(css: string): [string, string][] {
	const pairs: [string, string][] = [];
	for (const [, body = ""] of css.matchAll(/@theme inline\s*\{([^{}]*)\}/g)) {
		for (const [, name = "", target = ""] of body.matchAll(
			/--color-([\w-]+)\s*:\s*var\((--[\w-]+)\)/g,
		))
			pairs.push([`--${name}`, target]);
	}
	return pairs;
}

describe.each(["colors.css", "categories.css"])("%s", (file) => {
	const css = read(file);

	test("light and dark define the same variables", () => {
		const light = declared(css, ":root").sort();
		const dark = declared(css, ".dark")
			.filter((name) => name !== "color-scheme")
			.sort();

		expect(light.length).toBeGreaterThan(0);
		expect(dark).toEqual(light);
	});

	test("every variable has a Tailwind colour class of the same name", () => {
		const light = declared(css, ":root").sort();
		const pairs = colourClasses(css);

		expect(pairs.map(([, target]) => target).sort()).toEqual(light);
		for (const [name, target] of pairs) expect(name).toBe(target);
	});
});

test("the categories file holds the 20 fixed categories", () => {
	const names = declared(read("categories.css"), ":root");

	expect(names).toHaveLength(20);
	expect(names.every((name) => name.startsWith("--cat-"))).toBe(true);
});

test("overlay shadows switch between light and dark", () => {
	const css = read("space.css");

	expect(declared(css, ".dark")).toEqual(
		expect.arrayContaining(["--elevation-popover", "--elevation-dialog"]),
	);
});

describe("rules that keep Tailwind and the tokens from clashing", () => {
	test("--text-* variables are declared only in a @theme block", () => {
		for (const file of cssFiles) {
			const outsideTheme = read(file).replace(/@theme[^{]*\{[^{}]*\}/g, "");

			expect(outsideTheme, file).not.toMatch(/--text-[\w-]+\s*:/);
		}
	});

	test("spacing keeps Tailwind's default 4px step", () => {
		for (const file of cssFiles)
			expect(read(file), file).not.toMatch(/--spacing\s*:/);
	});

	test("dark mode uses the .dark class, not a data attribute", () => {
		for (const file of cssFiles)
			expect(read(file), file).not.toContain("data-theme");
	});

	test("no file loads fonts from a remote host", () => {
		for (const file of cssFiles)
			expect(read(file), file).not.toMatch(/https?:\/\//);
	});
});

test("globals.css imports every file in src/styles", () => {
	const globals = readFileSync(globalsPath, "utf8");

	for (const file of cssFiles) expect(globals).toContain(`../src/styles/${file}`);
});
