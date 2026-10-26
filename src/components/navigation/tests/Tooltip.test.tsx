import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button as AriaButton } from "react-aria-components";
import { describe, expect, test } from "vitest";

import { Tooltip } from "@/components/navigation/Tooltip";

function renderTooltip(props: { isDisabled?: boolean } = {}) {
	return render(
		<Tooltip
			text="Synced just now"
			delay={0}
			closeDelay={0}
			{...props}
		>
			<AriaButton>Sync</AriaButton>
		</Tooltip>,
	);
}

describe("default", () => {
	test("is hidden until the trigger is hovered or focused", () => {
		renderTooltip();

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("opens on hover and closes when the pointer leaves", async () => {
		const user = userEvent.setup();
		renderTooltip();

		// React Aria counts a hover only after it has seen the pointer move, so move it first.
		await user.pointer({ target: document.body });
		await user.hover(screen.getByRole("button", { name: "Sync" }));
		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Synced just now",
		);

		await user.unhover(screen.getByRole("button", { name: "Sync" }));
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});

	test("opens on keyboard focus, describes the trigger, and closes on Escape", async () => {
		const user = userEvent.setup();
		renderTooltip();

		await user.tab();

		expect(await screen.findByRole("tooltip")).toBeVisible();
		expect(
			screen.getByRole("button", { name: "Sync" }),
		).toHaveAccessibleDescription("Synced just now");

		await user.keyboard("{Escape}");
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});

describe("disabled", () => {
	test("never opens", async () => {
		const user = userEvent.setup();
		renderTooltip({ isDisabled: true });

		await user.tab();
		await user.hover(screen.getByRole("button", { name: "Sync" }));

		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
	});
});
