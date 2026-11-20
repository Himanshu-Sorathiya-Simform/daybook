import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { statusBox } from "../../lib/panel";
import { subscriptionItem } from "../../lib/__tests__/fixtures";
import { StatusBox } from "../StatusBox";
import { FORMATS } from "./rows";

function setup(
	item: Parameters<typeof statusBox>[0],
	actions: Parameters<typeof StatusBox>[0]["actions"],
) {
	const onAction = vi.fn();
	const box = statusBox(item, FORMATS);
	render(
		<StatusBox
			box={box}
			actions={actions}
			onAction={onAction}
		/>,
	);
	return { onAction, user: userEvent.setup() };
}

describe("StatusBox (BR-F05-40)", () => {
	test("reads the Subscription's state in one line with the date in bold", () => {
		setup(subscriptionItem("netflix"), []);
		const strong = screen.getByText("Thu, 5 Nov");
		expect(strong.tagName).toBe("STRONG");
		expect(strong.parentElement).toHaveTextContent(
			"Next charge Thu, 5 Nov, in 3 days.",
		);
	});

	test("a Subscription that is paused reads when it resumes", () => {
		setup(
			subscriptionItem("netflix", {
				status: "paused",
				nextDueOn: "2027-01-05",
			}),
			[],
		);
		expect(screen.getByText(/Paused\./)).toBeVisible();
		expect(screen.getByText("Tue, 5 Jan, 2027").tagName).toBe("STRONG");
	});

	test("shows no button when none is ready", () => {
		setup(subscriptionItem("netflix"), []);
		expect(screen.queryByRole("button")).toBeNull();
	});

	test.each([
		["skip", "Skip this one"],
		["resumeNow", "Resume now"],
		["change", "Change"],
		["resume", "Resume"],
	] as const)(
		"the %s button reads %s and runs its action",
		async (action, label) => {
			const { onAction, user } = setup(subscriptionItem("netflix"), [action]);
			await user.click(screen.getByRole("button", { name: label }));
			expect(onAction).toHaveBeenCalledExactlyOnceWith(action);
		},
	);

	test("buttons keep the order they are given", () => {
		setup(subscriptionItem("netflix", { status: "paused" }), [
			"resumeNow",
			"change",
		]);
		expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
			"Resume now",
			"Change",
		]);
	});
});
