import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "next-themes";

import { AppProviders } from "@/components/app/AppProviders";
import { ThemeColor } from "@/components/app/ThemeColor";
import { THEME_COLORS, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

// A variable font, so no weight list. latin-ext carries the rupee sign (U+20B9).
const hankenGrotesk = Hanken_Grotesk({
	subsets: ["latin", "latin-ext"],
	variable: "--font-hanken",
	display: "swap",
});

export const metadata: Metadata = {
	title: { default: "Daybook", template: "%s · Daybook" },
	description: "Personal finance and investment dashboard",
};

// The device's scheme decides the browser chrome until the page runs; `ThemeColor` then
// follows the chosen theme (BR-F02-22).
export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
		{ media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
	],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
	// Reading the request headers makes every page render per request (BR-P2-35), which the
	// proxy's per-response nonce needs; Next.js nonces its own scripts from them, and the theme
	// script gets the same nonce, so the CSP lets it run before first paint (BR-F02-21).
	const nonce = (await headers()).get("x-nonce") ?? undefined;
	return (
		// next-themes sets the `dark` class before React hydrates, so the server's markup differs.
		<html
			lang="en"
			className={hankenGrotesk.variable}
			suppressHydrationWarning
		>
			<body>
				<ThemeProvider
					attribute="class"
					defaultTheme="system"
					enableSystem
					disableTransitionOnChange
					storageKey={THEME_STORAGE_KEY}
					{...(nonce ? { nonce } : {})}
				>
					<ThemeColor />
					<AppProviders>{children}</AppProviders>
				</ThemeProvider>
			</body>
		</html>
	);
}
