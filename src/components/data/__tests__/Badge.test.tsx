import { render, screen } from "@testing-library/react";
import { Cloud, Lock } from "lucide-react";
import { describe, expect, test } from "vitest";

import { Badge, type BadgeProps } from "@/components/data/Badge";

describe("tones", () => {
	test.each([
		["neutral", "Simulated", ["bg-soft", "text-ink-2", "border-transparent"]],
		[
			"pending",
			"Pending sync",
			["border-dashed", "border-edge", "text-pending", "bg-transparent"],
		],
		["error", "Not saved", ["bg-neg-soft", "text-neg", "font-bold"]],
		["outline", "Auto", ["border-line-strong", "bg-transparent", "text-ink-2"]],
		["premium", "Premium", ["bg-accent-soft", "text-accent"]],
	] as [NonNullable<BadgeProps["tone"]>, string, string[]][])(
		"a %s badge saying %s has its own look",
		(tone, text, classes) => {
			render(<Badge tone={tone}>{text}</Badge>);

			expect(screen.getByText(text)).toBeVisible();
			expect(screen.getByText(text)).toHaveClass(...classes);
		},
	);

	test("is neutral by default", () => {
		render(<Badge>Simulated</Badge>);

		expect(screen.getByText("Simulated")).toHaveClass("bg-soft", "text-ink-2");
	});

	test("only a pending badge has a dashed edge, which marks it without colour", () => {
		render(
			<>
				<Badge tone="pending">Pending sync</Badge>
				<Badge tone="neutral">Simulated</Badge>
				<Badge tone="error">Not saved</Badge>
				<Badge tone="premium">Premium</Badge>
				<Badge tone="outline">Auto</Badge>
			</>,
		);

		expect(screen.getByText("Pending sync")).toHaveClass("border-dashed");
		for (const text of ["Simulated", "Not saved", "Premium", "Auto"]) {
			expect(screen.getByText(text)).not.toHaveClass("border-dashed");
		}
	});

	test("an error badge is bold, so it stands out beyond its colour", () => {
		render(
			<>
				<Badge tone="error">Not saved</Badge>
				<Badge>Simulated</Badge>
			</>,
		);

		expect(screen.getByText("Not saved")).toHaveClass("font-bold");
		expect(screen.getByText("Simulated")).not.toHaveClass("font-bold");
	});
});

describe("icon", () => {
	test("shows a decorative icon before the text", () => {
		render(<Badge icon={Cloud}>Offline</Badge>);

		const badge = screen.getByText("Offline");
		const icon = badge.querySelector("svg");
		expect(icon).toHaveAttribute("aria-hidden", "true");
		expect(badge.firstElementChild).toBe(icon);
	});

	test("has no icon unless one is given", () => {
		render(<Badge>Offline</Badge>);

		expect(screen.getByText("Offline").querySelector("svg")).toBeNull();
	});

	test("works with any tone", () => {
		render(
			<Badge
				tone="premium"
				icon={Lock}
			>
				Premium
			</Badge>,
		);

		expect(screen.getByText("Premium").querySelector("svg")).toBeInTheDocument();
	});

	test("the icon does not become part of the badge's text", () => {
		render(<Badge icon={Cloud}>Offline</Badge>);

		expect(screen.getByText("Offline")).toHaveTextContent(/^Offline$/);
	});
});

describe("content and look", () => {
	test("shows rich content", () => {
		render(
			<Badge>
				<strong>2</strong> new
			</Badge>,
		);

		expect(screen.getByText("2")).toBeVisible();
	});

	test("is a small pill that never wraps", () => {
		render(<Badge>Pending sync</Badge>);

		expect(screen.getByText("Pending sync")).toHaveClass(
			"inline-flex",
			"rounded-chip",
			"text-small",
			"whitespace-nowrap",
		);
	});

	test("is plain text, with no role", () => {
		render(<Badge>Simulated</Badge>);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	test("takes the caller's classes", () => {
		render(<Badge className="ml-2">Auto</Badge>);

		expect(screen.getByText("Auto")).toHaveClass("ml-2", "rounded-chip");
	});
});
