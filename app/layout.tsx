import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

// A variable font, so no weight list. latin-ext carries the rupee sign (U+20B9).
const hankenGrotesk = Hanken_Grotesk({
	subsets: ["latin", "latin-ext"],
	variable: "--font-hanken",
	display: "swap",
});

export const metadata: Metadata = {
	title: "Daybook",
	description: "Personal finance and investment dashboard",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
	// Reading the request headers makes every page render per request (BR-P2-35), which the
	// proxy's per-response nonce needs; Next.js nonces its own scripts from them. The theme
	// script and every `Script` will read `x-nonce` from here when they arrive.
	await headers();
	return (
		<html
			lang="en"
			className={hankenGrotesk.variable}
		>
			<body>{children}</body>
		</html>
	);
}
