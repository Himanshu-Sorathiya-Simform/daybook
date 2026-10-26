import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Banner } from "@/components/feedback/Banner";

describe("kinds", () => {
	test.each([
		["offline", "status", "bg-soft"],
		["update", "status", "bg-accent-soft"],
		["error", "alert", "bg-neg-soft"],
		["info", "status", "bg-soft"],
	] as const)("%s is announced as %s on a %s background", (kind, role, tone) => {
		render(<Banner kind={kind}>Message</Banner>);

		expect(screen.getByRole(role)).toHaveClass(tone);
		expect(screen.getByRole(role)).toHaveTextContent("Message");
	});

	test("is an info banner by default", () => {
		render(<Banner>Message</Banner>);

		expect(screen.getByRole("status")).toHaveClass("bg-soft");
	});

	test.each(["offline", "update", "error", "info"] as const)(
		"%s has a decorative icon, so the message never relies on colour",
		(kind) => {
			render(<Banner kind={kind}>Message</Banner>);

			const icon = screen
				.getByRole(kind === "error" ? "alert" : "status")
				.querySelector("svg");
			expect(icon).toHaveAttribute("aria-hidden", "true");
		},
	);

	test("shows the icon of an error in the negative colour, and the others in the text colour", () => {
		const { rerender } = render(<Banner kind="error">Message</Banner>);
		expect(screen.getByRole("alert").querySelector("svg")).toHaveClass(
			"text-neg",
		);

		rerender(<Banner kind="offline">Message</Banner>);
		expect(screen.getByRole("status").querySelector("svg")).not.toHaveClass(
			"text-neg",
		);
	});

	test("gives each kind its own icon", () => {
		const kinds = ["offline", "update", "error", "info"] as const;
		const icons = kinds.map((kind) => {
			const { container, unmount } = render(
				<Banner kind={kind}>Message</Banner>,
			);
			const name = container
				.querySelector("svg")!
				.getAttribute("class")!
				.match(/lucide-[\w-]+/)![0];
			unmount();
			return name;
		});

		expect(new Set(icons).size).toBe(4);
	});

	test("is announced as an alert only for an error", () => {
		const { rerender } = render(<Banner kind="update">Message</Banner>);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();

		rerender(<Banner kind="error">Message</Banner>);
		expect(screen.getByRole("alert")).toBeVisible();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});

describe("content", () => {
	test("shows rich content", () => {
		render(
			<Banner>
				Payment failed. <a href="/billing">See billing</a>
			</Banner>,
		);

		expect(screen.getByRole("link", { name: "See billing" })).toBeVisible();
	});

	test("shows the meta text after the message", () => {
		render(
			<Banner
				kind="offline"
				meta="as of 14:05"
			>
				You&apos;re offline.
			</Banner>,
		);

		const meta = screen.getByText("as of 14:05");
		expect(meta).toHaveClass("figures", "text-ink-2");
		expect(
			screen.getByText("You're offline.").compareDocumentPosition(meta)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	test("has no meta text unless given", () => {
		render(<Banner>Message</Banner>);

		expect(screen.getByRole("status").children).toHaveLength(2);
	});

	test("shows a long message without hiding the action", () => {
		render(
			<Banner
				action="Reload"
				onAction={() => {}}
			>
				{"A very long message ".repeat(30)}
			</Banner>,
		);

		expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
	});
});

describe("action", () => {
	test("is a small secondary button that runs onAction with the mouse, Enter and Space", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(
			<Banner
				kind="update"
				action="Reload"
				onAction={onAction}
			>
				Update available
			</Banner>,
		);

		const button = screen.getByRole("button", { name: "Reload" });
		await user.click(button);
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onAction).toHaveBeenCalledTimes(3);
		expect(button).toHaveClass("h-8", "bg-page");
	});

	test("is the only focusable thing, and Tab reaches it", async () => {
		const user = userEvent.setup();
		render(
			<Banner
				action="Reload"
				onAction={() => {}}
			>
				Update available
			</Banner>,
		);

		await user.tab();

		expect(screen.getByRole("button", { name: "Reload" })).toHaveFocus();
	});

	test("does not fail when pressed without onAction", async () => {
		const user = userEvent.setup();
		render(<Banner action="Reload">Update available</Banner>);

		await user.click(screen.getByRole("button", { name: "Reload" }));

		expect(screen.getByRole("button", { name: "Reload" })).toBeVisible();
	});

	test("is absent unless a label is given", () => {
		render(<Banner onAction={() => {}}>Message</Banner>);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("comes after the meta text", () => {
		render(
			<Banner
				meta="as of 14:05"
				action="Reload"
			>
				Message
			</Banner>,
		);

		expect(
			screen
				.getByText("as of 14:05")
				.compareDocumentPosition(
					screen.getByRole("button", { name: "Reload" }),
				) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});
});

describe("look", () => {
	test("is a full-width row at least 40px tall with a hairline underneath, narrower padding on phones", () => {
		render(<Banner>Message</Banner>);

		expect(screen.getByRole("status")).toHaveClass(
			"flex",
			"min-h-10",
			"border-b",
			"border-line",
			"px-6",
			"max-md:px-4",
		);
	});

	test("takes the caller's classes after its own", () => {
		render(<Banner className="sticky px-2">Message</Banner>);

		expect(screen.getByRole("status")).toHaveClass("px-2", "sticky");
		expect(screen.getByRole("status")).not.toHaveClass("px-6");
	});
});

describe("stacking", () => {
	test("two banners are announced separately", () => {
		render(
			<>
				<Banner kind="offline">Offline</Banner>
				<Banner kind="error">Payment failed</Banner>
			</>,
		);

		expect(screen.getByRole("status")).toHaveTextContent("Offline");
		expect(screen.getByRole("alert")).toHaveTextContent("Payment failed");
	});
});
