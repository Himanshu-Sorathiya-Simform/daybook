import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "next-themes";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { THEME_COLORS } from "@/lib/theme";
import { ThemeColor } from "../ThemeColor";

/** The device's scheme, as `prefers-color-scheme` reports it. jsdom has no `matchMedia`. */
let deviceDark = false;

beforeEach(() => {
	deviceDark = false;
	window.matchMedia = vi.fn((query: string) => ({
		matches: query.includes("dark") && deviceDark,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
	for (const scheme of ["light", "dark"]) {
		const meta = document.createElement("meta");
		meta.name = "theme-color";
		meta.media = `(prefers-color-scheme: ${scheme})`;
		meta.content = THEME_COLORS[scheme as "light" | "dark"];
		document.head.append(meta);
	}
});

afterEach(() => {
	for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
		meta.remove();
	localStorage.clear();
});

const metaColors = () =>
	[...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map(
		(meta) => meta.content,
	);

/** Buttons that choose a theme, as Settings → Appearance will. */
function Switcher() {
	const { setTheme } = useTheme();
	return (
		<>
			<button onClick={() => setTheme("dark")}>Dark</button>
			<button onClick={() => setTheme("light")}>Light</button>
		</>
	);
}

function renderWith(defaultTheme: string) {
	return render(
		<ThemeProvider
			attribute="class"
			enableSystem
			defaultTheme={defaultTheme}
			storageKey="daybook.theme"
		>
			<ThemeColor />
			<Switcher />
		</ThemeProvider>,
	);
}

describe("ThemeColor (BR-F02-22)", () => {
	test("a chosen Dark sets every theme-color tag to the dark page colour", () => {
		renderWith("dark");
		expect(metaColors()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
	});

	test("a chosen Light sets every tag to the light page colour, on a dark device too", () => {
		deviceDark = true;
		renderWith("light");
		expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
	});

	test.each([
		[false, THEME_COLORS.light],
		[true, THEME_COLORS.dark],
	])("System on a device whose dark mode is %s uses %s", (dark, color) => {
		deviceDark = dark;
		renderWith("system");
		expect(metaColors()).toEqual([color, color]);
	});

	test("follows a change of theme", () => {
		renderWith("light");
		act(() => screen.getByRole("button", { name: "Dark" }).click());
		expect(metaColors()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark]);
		act(() => screen.getByRole("button", { name: "Light" }).click());
		expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.light]);
	});

	test("a theme other than light or dark leaves the tags alone", () => {
		render(
			<ThemeProvider
				attribute="class"
				enableSystem={false}
				defaultTheme="sepia"
				themes={["sepia"]}
			>
				<ThemeColor />
			</ThemeProvider>,
		);
		expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
	});

	test("a page without theme-color tags is fine", () => {
		for (const meta of document.querySelectorAll('meta[name="theme-color"]'))
			meta.remove();
		expect(() => renderWith("dark")).not.toThrow();
	});

	test("renders nothing, and outside a ThemeProvider leaves the tags alone", () => {
		const { container } = render(<ThemeColor />);
		expect(container).toBeEmptyDOMElement();
		expect(metaColors()).toEqual([THEME_COLORS.light, THEME_COLORS.dark]);
	});
});
