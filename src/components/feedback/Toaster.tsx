import { Toaster as SonnerToaster } from "sonner";

/**
 * The place toasts appear. Mount it once, in the app shell. It sits at the bottom centre, and on
 * phones above the bottom bar. The look of each toast is `Toast`, not Sonner's own style.
 */
export function Toaster() {
	return (
		<SonnerToaster
			position="bottom-center"
			theme="light"
			duration={5000}
			mobileOffset={{ bottom: "calc(var(--bottom-bar-height) + 12px)" }}
		/>
	);
}
