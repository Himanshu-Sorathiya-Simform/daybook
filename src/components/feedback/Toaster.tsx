"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster } from "sonner";

/**
 * The place toasts appear. Mount it once, in the app shell. It sits at the bottom centre, and on
 * phones above the bottom bar. The look of each toast is `Toast`, not Sonner's own style; the
 * theme it is given follows the one the user chose (BR-F02-22), light until the page knows it.
 */
export function Toaster() {
	const { resolvedTheme } = useTheme();
	return (
		<SonnerToaster
			position="bottom-center"
			theme={resolvedTheme === "dark" ? "dark" : "light"}
			duration={5000}
			mobileOffset={{ bottom: "calc(var(--bottom-bar-height) + 12px)" }}
		/>
	);
}
