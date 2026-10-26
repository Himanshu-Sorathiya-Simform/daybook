import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { LockedCard, type LockedCardProps } from "@/components/surfaces/LockedCard";
import { SampleHeatmap } from "@/components/surfaces/SampleHeatmap";

const feature = "See every day of spending on a calendar heat map.";

function renderCard(props: Partial<LockedCardProps> = {}) {
	return render(
		<LockedCard
			feature={feature}
			sample={<SampleHeatmap />}
			compareHref="/premium"
			{...props}
		/>,
	);
}

describe("the five parts (P4, D-119)", () => {
	test("has a heading, the feature line, the sample, the upgrade button and the compare link", () => {
		renderCard();

		expect(
			screen.getByRole("heading", {
				level: 2,
				name: "Part of Daybook Premium",
			}),
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

	test("has nothing else: one heading, one button, one link, one image", () => {
		renderCard();

		expect(screen.getAllByRole("heading")).toHaveLength(1);
		expect(screen.getAllByRole("button")).toHaveLength(1);
		expect(screen.getAllByRole("link")).toHaveLength(1);
		expect(screen.getAllByRole("img")).toHaveLength(1);
	});

	test("shows the parts in order: heading, feature, sample, then the actions", () => {
		renderCard();

		const order = [
			screen.getByRole("heading"),
			screen.getByText(feature),
			screen.getByRole("img"),
			screen.getByRole("button", { name: "Upgrade" }),
			screen.getByRole("link", { name: "Compare plans" }),
		];
		for (let i = 1; i < order.length; i++) {
			expect(
				order[i - 1]!.compareDocumentPosition(order[i]!)
					& Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		}
	});

	test("shows the sample it is given, labelled as not the user's data", () => {
		renderCard({ sample: <p>Sample chart</p> });

		expect(
			screen.getByRole("img", { name: "Sample picture, not your data" }),
		).toHaveTextContent("Sample chart");
	});

	test("shows another feature line", () => {
		renderCard({ feature: "Compare this month with last month." });

		expect(
			screen.getByText("Compare this month with last month."),
		).toBeVisible();
	});
});

describe("upgrade", () => {
	test("runs onUpgrade with the mouse, Enter and Space", async () => {
		const user = userEvent.setup();
		const onUpgrade = vi.fn();
		renderCard({ onUpgrade });

		await user.click(screen.getByRole("button", { name: "Upgrade" }));
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(onUpgrade).toHaveBeenCalledTimes(3);
	});

	test("does nothing, and does not fail, without onUpgrade", async () => {
		const user = userEvent.setup();
		renderCard();

		await user.click(screen.getByRole("button", { name: "Upgrade" }));

		expect(screen.getByRole("button", { name: "Upgrade" })).toBeVisible();
	});

	test("is not disabled while online", () => {
		renderCard();

		expect(screen.getByRole("button", { name: "Upgrade" })).not.toHaveAttribute(
			"aria-disabled",
		);
	});
});

describe("compare plans", () => {
	test("is a link to the given address and can be reached with Tab after the button", async () => {
		const user = userEvent.setup();
		renderCard({ compareHref: "/premium#compare" });

		await user.tab();
		expect(screen.getByRole("button", { name: "Upgrade" })).toHaveFocus();
		await user.tab();

		const link = screen.getByRole("link", { name: "Compare plans" });
		expect(link).toHaveFocus();
		expect(link).toHaveAttribute("href", "/premium#compare");
	});
});

describe("offline", () => {
	test("says why the button cannot be used and does not call onUpgrade", async () => {
		const user = userEvent.setup();
		const onUpgrade = vi.fn();
		renderCard({ offline: true, onUpgrade });

		const button = screen.getByRole("button", { name: "Connect to upgrade" });
		await user.click(button);
		await user.keyboard("{Enter}");

		expect(button).toHaveAttribute("aria-disabled", "true");
		expect(button).toHaveAccessibleDescription("You're offline.");
		expect(onUpgrade).not.toHaveBeenCalled();
	});

	test("replaces the Upgrade button, not adds to it", () => {
		renderCard({ offline: true });

		expect(
			screen.queryByRole("button", { name: "Upgrade" }),
		).not.toBeInTheDocument();
		expect(screen.getAllByRole("button")).toHaveLength(1);
	});

	test("keeps the button reachable with the keyboard, and the compare link works", async () => {
		const user = userEvent.setup();
		renderCard({ offline: true });

		await user.tab();
		expect(
			screen.getByRole("button", { name: "Connect to upgrade" }),
		).toHaveFocus();
		await user.tab();

		expect(screen.getByRole("link", { name: "Compare plans" })).toHaveFocus();
	});

	test("goes back to Upgrade when the connection returns", async () => {
		const user = userEvent.setup();
		const onUpgrade = vi.fn();
		const { rerender } = renderCard({ offline: true, onUpgrade });

		rerender(
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

describe("look", () => {
	test("is the one filled section: a soft card with a hairline edge", () => {
		const { container } = renderCard();

		expect(container.firstElementChild).toHaveClass(
			"bg-soft",
			"border-line",
			"rounded-card",
			"p-6",
		);
	});

	test("takes the caller's classes after its own", () => {
		const { container } = renderCard({ className: "w-96 p-4" });

		expect(container.firstElementChild).toHaveClass("w-96", "p-4");
		expect(container.firstElementChild).not.toHaveClass("p-6");
	});
});
