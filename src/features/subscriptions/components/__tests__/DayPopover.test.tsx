import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { gridWeeks } from "../../lib/calendar";
import { DayPopover } from "../DayPopover";
import { BUSY_DAY, CAL, entry } from "./calendar-data";

const dayOf = (items = BUSY_DAY) =>
	gridWeeks("2026-11", "monday", items, CAL)
		.flatMap((week) => week.days)
		.find((day) => day.date === "2026-11-05")!;

function setup(items = BUSY_DAY) {
	const onSelect = vi.fn();
	render(
		<DayPopover
			day={dayOf(items)}
			formats={CAL}
			onSelect={onSelect}
		/>,
	);
	return { onSelect, user: userEvent.setup() };
}

const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(screen.getByRole("button", { name: /more/ }));
	return screen.findByRole("dialog", { name: "Thu, 5 Nov" });
};

describe("DayPopover (BR-F05-38)", () => {
	// AC-F05-38
	test("the button reads how many more and their total in whole units", () => {
		setup();
		expect(
			screen.getByRole("button", { name: "+2 more · ₹20,149" }),
		).toBeVisible();
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	// AC-F05-38
	test("opens a dialog named by the day with the day's total", async () => {
		const { user } = setup();
		const dialog = await open(user);
		expect(within(dialog).getByText("Thu, 5 Nov")).toBeVisible();
		expect(within(dialog).getByText("₹20,149.00")).toBeVisible();
	});

	test("lists every item with its name, category and state, and its amount", async () => {
		const { user } = setup();
		const dialog = await open(user);
		const buttons = within(dialog).getAllByRole("button");
		expect(buttons.map((button) => button.textContent)).toEqual([
			"Sunrise ApartmentsHousing · due₹18,000.00",
			"Cult GymHealth · due₹1,500.00",
			"NetflixEntertainment · due₹649.00",
		]);
	});

	test("says to select one to open it in the panel", async () => {
		const { user } = setup();
		const dialog = await open(user);
		expect(
			within(dialog).getByText("Select one to open it in the panel."),
		).toBeVisible();
	});

	test("pressing an item selects it and closes the popover", async () => {
		const { onSelect, user } = setup();
		const dialog = await open(user);
		await user.click(within(dialog).getByRole("button", { name: /Cult Gym/ }));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(BUSY_DAY[1]);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("Escape closes it and selects nothing", async () => {
		const { onSelect, user } = setup();
		await open(user);
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("a press outside closes it and selects nothing", async () => {
		const { onSelect, user } = setup();
		await open(user);
		await user.click(document.body);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("focus returns to the button when it closes", async () => {
		const { user } = setup();
		await open(user);
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /more/ })).toHaveFocus(),
		);
	});

	test("a struck item (skipped or paused) is struck in the list and left out of the total", async () => {
		const { user } = setup([
			...BUSY_DAY,
			entry("skipped", "2026-11-05", "Gym pass", 99900),
		]);
		const dialog = await open(user);
		expect(within(dialog).getByText("Gym pass")).toHaveClass("line-through");
		expect(within(dialog).getByText("Netflix")).not.toHaveClass("line-through");
		expect(within(dialog).getByText("₹20,149.00")).toBeVisible();
	});

	test("a charge of a deleted Subscription is listed and can be pressed", async () => {
		const gone = entry("charged", "2026-11-05", "Old gym", 50000, {
			subscriptionId: null,
		});
		const { onSelect, user } = setup([...BUSY_DAY, gone]);
		const dialog = await open(user);
		await user.click(within(dialog).getByRole("button", { name: /Old gym/ }));
		expect(onSelect).toHaveBeenCalledExactlyOnceWith(gone);
	});

	test("the popover opens from the keyboard", async () => {
		const { user } = setup();
		screen.getByRole("button", { name: /more/ }).focus();
		await user.keyboard("{Enter}");
		expect(
			await screen.findByRole("dialog", { name: "Thu, 5 Nov" }),
		).toBeVisible();
	});
});
