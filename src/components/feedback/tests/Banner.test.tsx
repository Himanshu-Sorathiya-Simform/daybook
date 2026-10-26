import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Banner } from "@/components/feedback/Banner";

describe("default", () => {
	test("is a polite status with an optional meta text", () => {
		render(
			<Banner
				kind="offline"
				meta="as of 14:05"
			>
				{"You're offline. Showing what was saved on this device."}
			</Banner>,
		);

		expect(screen.getByRole("status")).toHaveTextContent(
			"You're offline. Showing what was saved on this device.",
		);
		expect(screen.getByText("as of 14:05")).toBeVisible();
	});

	test("runs the action when it is pressed", async () => {
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

		await user.click(screen.getByRole("button", { name: "Reload" }));

		expect(onAction).toHaveBeenCalledOnce();
	});

	test("has no button when there is no action", () => {
		render(<Banner>Plain note</Banner>);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});
});

describe("error", () => {
	test("is announced at once as an alert", () => {
		render(
			<Banner
				kind="error"
				action="Update card"
			>
				Your last Premium payment failed.
			</Banner>,
		);

		expect(screen.getByRole("alert")).toHaveTextContent(
			"Your last Premium payment failed.",
		);
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});
