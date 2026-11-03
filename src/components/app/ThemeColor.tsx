"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { THEME_COLORS } from "@/lib/theme";

/**
 * Keeps `<meta name="theme-color">` on the active theme (BR-F02-22). The root layout's two
 * tags follow the device's scheme before the page runs; once it does, both take the colour of
 * the theme the user chose, which may differ from the device's.
 */
export function ThemeColor() {
	const { resolvedTheme } = useTheme();
	useEffect(() => {
		if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
		for (const meta of document.querySelectorAll<HTMLMetaElement>(
			'meta[name="theme-color"]',
		)) {
			meta.content = THEME_COLORS[resolvedTheme];
		}
	}, [resolvedTheme]);
	return null;
}
