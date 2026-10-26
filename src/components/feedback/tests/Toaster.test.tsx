import { act, render, screen } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, test } from "vitest";

import { Toaster } from "@/components/feedback/Toaster";
import { showToast } from "@/components/feedback/showToast";

afterEach(() => {
	act(() => {
		toast.dismiss();
	});
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
