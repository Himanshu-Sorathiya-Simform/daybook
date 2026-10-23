import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
	return (
		<html
			lang="en"
			className={hankenGrotesk.variable}
		>
			<body>{children}</body>
		</html>
	);
}
