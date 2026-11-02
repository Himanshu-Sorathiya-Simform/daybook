import { act, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, useTheme } from "next-themes";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Toaster } from "@/components/feedback/Toaster";
import { showToast } from "@/components/feedback/showToast";

afterEach(() => {
	act(() => {
		toast.dismiss();
	});
	localStorage.clear();
	vi.restoreAllMocks();
});

describe("Toaster", () => {
	test("is a polite live region named for notifications", () => {
		render(<Toaster />);

		const region = screen.getByRole("region", { name: /Notifications/ });
		expect(region).toHaveAttribute("aria-live", "polite");
		expect(region).toHaveAttribute("aria-atomic", "false");
	});

	test("shows nothing until a toast is shown", () => {
		render(<Toaster />);

		expect(document.querySelector("[data-sonner-toast]")).toBeNull();
	});

	test("shows a toast in the bottom centre", async () => {
		render(<Toaster />);

		act(() => {
			showToast("Demo data added.");
		});

		expect(await screen.findByText("Demo data added.")).toBeVisible();
		const list = document.querySelector("[data-sonner-toaster]");
		expect(list).toHaveAttribute("data-y-position", "bottom");
		expect(list).toHaveAttribute("data-x-position", "center");
	});

	test("draws our toast, not Sonner's own style", async () => {
		render(<Toaster />);

		act(() => {
			showToast("Demo data added.");
		});
		await screen.findByText("Demo data added.");

		expect(document.querySelector("[data-sonner-toast]")).toHaveAttribute(
			"data-styled",
			"false",
		);
		expect(screen.getByText("Demo data added.").parentElement).toHaveClass(
			"bg-ink",
			"text-page",
		);
	});

	test("shows several toasts at once", async () => {
		render(<Toaster />);

		act(() => {
			showToast("One");
			showToast("Two");
			showToast("Three");
		});

		expect(await screen.findByText("One")).toBeInTheDocument();
		expect(screen.getByText("Two")).toBeInTheDocument();
		expect(screen.getByText("Three")).toBeInTheDocument();
		expect(document.querySelectorAll("[data-sonner-toast]")).toHaveLength(3);
	});

	test("leaves a toast's button reachable with the keyboard", async () => {
		render(<Toaster />);

		act(() => {
			showToast("Deleted.", { action: "Undo" });
		});

		expect(await screen.findByRole("button", { name: "Undo" })).toBeVisible();
	});
});

/** The device's scheme for next-themes' `system`; jsdom has no `matchMedia`. */
function device(dark: boolean) {
	window.matchMedia = vi.fn((query: string) => ({
		matches: query.includes("dark") && dark,
		media: query,
		onchange: null,
		addListener: vi.fn(),
		removeListener: vi.fn(),
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		dispatchEvent: vi.fn(),
	})) as unknown as typeof window.matchMedia;
}

/** Buttons that set the theme, as Settings will. */
function ThemePicker() {
	const { setTheme } = useTheme();
	return (
		<>
			<button
				type="button"
				onClick={() => setTheme("dark")}
			>
				Dark
			</button>
			<button
				type="button"
				onClick={() => setTheme("light")}
			>
				Light
			</button>
		</>
	);
}

async function toasterTheme() {
	act(() => {
		showToast("Saved.");
	});
	await screen.findByText("Saved.");
	return document
		.querySelector("[data-sonner-toaster]")
		?.getAttribute("data-sonner-theme");
}

function renderThemed(defaultTheme: string) {
	render(
		<ThemeProvider
			attribute="class"
			defaultTheme={defaultTheme}
			enableSystem
		>
			<ThemePicker />
			<Toaster />
		</ThemeProvider>,
	);
}

// BR-F02-22: the toasts follow the theme the user chose, not only the device's.
describe("Toaster theme", () => {
	test("is light without a theme provider", async () => {
		render(<Toaster />);
		expect(await toasterTheme()).toBe("light");
	});

	test.each([
		["light", false, "light"],
		["dark", false, "dark"],
		["light", true, "light"],
		["dark", true, "dark"],
		["system", false, "light"],
		["system", true, "dark"],
	])("theme %s on a device with dark=%s is %s", async (theme, dark, expected) => {
		device(dark);
		renderThemed(theme);
		expect(await toasterTheme()).toBe(expected);
	});

	test("follows a change of theme while it is open", async () => {
		device(false);
		renderThemed("light");
		expect(await toasterTheme()).toBe("light");
		act(() => screen.getByRole("button", { name: "Dark" }).click());
		await waitFor(() =>
			expect(
				document
					.querySelector("[data-sonner-toaster]")
					?.getAttribute("data-sonner-theme"),
			).toBe("dark"),
		);
		act(() => screen.getByRole("button", { name: "Light" }).click());
		await waitFor(() =>
			expect(
				document
					.querySelector("[data-sonner-toaster]")
					?.getAttribute("data-sonner-theme"),
			).toBe("light"),
		);
	});
});
