import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { LockedCard } from "@/components/surfaces/LockedCard";
import { SampleHeatmap } from "@/components/surfaces/SampleHeatmap";

const feature = "See every day of spending on a calendar heat map.";

describe("default", () => {
	test("has exactly the five parts", () => {
		render(
			<LockedCard
				feature={feature}
				sample={<SampleHeatmap />}
				compareHref="/premium"
			/>,
		);

		expect(
			screen.getByRole("heading", { name: "Part of Daybook Premium" }),
		).toBeVisible();
		expect(screen.getByText(feature)).toBeVisible();
		expect(
			screen.getByRole("img", { name: "Sample picture, not your data" }),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Upgrade" })).toBeVisible();
		expect(screen.getByRole("link", { name: "Compare plans" })).toHaveAttribute(
			"href",
			"/premium",
		);
	});

	test("calls onUpgrade when the button is pressed", async () => {
		const user = userEvent.setup();
		const onUpgrade = vi.fn();
		render(
			<LockedCard
				feature={feature}
				sample={<SampleHeatmap />}
				compareHref="/premium"
				onUpgrade={onUpgrade}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Upgrade" }));

		expect(onUpgrade).toHaveBeenCalledOnce();
	});
});

describe("offline", () => {
	test("says why the button cannot be used and does not call onUpgrade", async () => {
		const user = userEvent.setup();
		const onUpgrade = vi.fn();
		render(
			<LockedCard
				offline
				feature={feature}
				sample={<SampleHeatmap />}
				compareHref="/premium"
				onUpgrade={onUpgrade}
			/>,
		);

		const button = screen.getByRole("button", { name: "Connect to upgrade" });
		await user.click(button);

		expect(button).toHaveAttribute("aria-disabled", "true");
		expect(button).toHaveAccessibleDescription("You're offline.");
		expect(onUpgrade).not.toHaveBeenCalled();
	});
});

describe("SampleHeatmap", () => {
	test("is 35 static cells and carries no user data", () => {
		const { container } = render(<SampleHeatmap />);

		expect(container.firstElementChild?.children).toHaveLength(35);
		expect(container).not.toHaveTextContent(/\d/);
	});
});
