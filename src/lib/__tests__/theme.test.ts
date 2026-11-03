// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import { THEME_COLORS, THEME_STORAGE_KEY } from "../theme";

const css = readFileSync("src/styles/colors.css", "utf8");

/** `--page` in the first block that starts with `selector`. */
function pageColor(selector: string): string | undefined {
	const start = css.indexOf(`${selector} {`);
	const block = css.slice(start, css.indexOf("}", start));
	return /--page:\s*(#[0-9a-f]{6})/i.exec(block)?.[1];
}

describe("theme", () => {
	test("next-themes keeps the choice under daybook.theme (BR-F02-21)", () => {
		expect(THEME_STORAGE_KEY).toBe("daybook.theme");
	});

	// BR-F02-22
	test.each([
		["light", ":root"],
		["dark", ".dark"],
	] as const)(
		"the %s theme-color is the page surface of %s",
		(theme, selector) => {
			expect(pageColor(selector)).toBe(THEME_COLORS[theme]);
		},
	);
});
