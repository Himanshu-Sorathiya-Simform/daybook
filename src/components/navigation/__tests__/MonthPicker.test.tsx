import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { MonthGrid } from "@/components/navigation/MonthGrid";
import { MonthPicker } from "@/components/navigation/MonthPicker";

describe("structure", () => {
	test("shows the month between a previous and a next button", () => {
		render(<MonthPicker label="October 2026" />);

		const buttons = screen.getAllByRole("button");
		expect(
			buttons.map(
				(button) => button.getAttribute("aria-label") ?? button.textContent,
			),
		).toEqual(["Previous month", "October 2026", "Next month"]);
	});

	test("shows a current month's 'to date' label as given", () => {
		render(<MonthPicker label="November 2026 · to date" />);

		expect(
			screen.getByRole("button", { name: "November 2026 · to date" }),
		).toBeVisible();
	});

	test("follows a label that changes", () => {
		const { rerender } = render(<MonthPicker label="October 2026" />);

		rerender(<MonthPicker label="September 2026" />);

		expect(screen.getByRole("button", { name: "September 2026" })).toBeVisible();
		expect(
			screen.queryByRole("button", { name: "October 2026" }),
		).not.toBeInTheDocument();
	});

	test("takes the caller's classes", () => {
		const { container } = render(
			<MonthPicker
				label="October 2026"
				className="ml-auto"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("ml-auto", "inline-flex");
	});
});

describe("moving", () => {
	test("goes to the previous and next month with the mouse", async () => {
		const user = userEvent.setup();
		const onPrev = vi.fn();
		const onNext = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				onPrev={onPrev}
				onNext={onNext}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Previous month" }));
		expect(onPrev).toHaveBeenCalledOnce();
		expect(onNext).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Next month" }));
		expect(onNext).toHaveBeenCalledOnce();
	});

	test("goes to the previous and next month with Enter and Space", async () => {
		const user = userEvent.setup();
		const onPrev = vi.fn();
		const onNext = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				onPrev={onPrev}
				onNext={onNext}
			/>,
		);

		await user.tab();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		expect(onPrev).toHaveBeenCalledTimes(2);

		await user.tab();
		await user.tab();
		await user.keyboard("{Enter}");
		expect(onNext).toHaveBeenCalledOnce();
	});

	test("does not fail when pressed without handlers", async () => {
		const user = userEvent.setup();
		render(<MonthPicker label="October 2026" />);

		await user.click(screen.getByRole("button", { name: "Previous month" }));
		await user.click(screen.getByRole("button", { name: "Next month" }));
		await user.click(screen.getByRole("button", { name: "October 2026" }));

		expect(screen.getByRole("button", { name: "October 2026" })).toBeVisible();
	});
});

describe("opening the month grid", () => {
	test("reports a press on the month, and says it opens a dialog", async () => {
		const user = userEvent.setup();
		const onOpen = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				onOpen={onOpen}
			/>,
		);

		const month = screen.getByRole("button", { name: "October 2026" });
		await user.click(month);
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(month).toHaveAttribute("aria-haspopup", "dialog");
		expect(onOpen).toHaveBeenCalledTimes(3);
	});

	test("does not open when an arrow is pressed", async () => {
		const user = userEvent.setup();
		const onOpen = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				onOpen={onOpen}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Previous month" }));

		expect(onOpen).not.toHaveBeenCalled();
	});
});

describe("keyboard", () => {
	test("Tab goes previous, month, next, in that order, and then leaves", async () => {
		const user = userEvent.setup();
		render(
			<>
				<MonthPicker label="October 2026" />
				<button>After</button>
			</>,
		);

		await user.tab();
		expect(screen.getByRole("button", { name: "Previous month" })).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "October 2026" })).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "Next month" })).toHaveFocus();
		await user.tab();
		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("shows a tooltip with the arrow's name on keyboard focus", async () => {
		const user = userEvent.setup();
		render(<MonthPicker label="October 2026" />);

		await user.tab();

		expect(await screen.findByRole("tooltip")).toHaveTextContent(
			"Previous month",
		);
	});
});

describe("the ends of the range", () => {
	test("next is disabled on the current month but keeps focus, and ignores every press", async () => {
		const user = userEvent.setup();
		const onNext = vi.fn();
		render(
			<MonthPicker
				label="November 2026 · to date"
				canNext={false}
				onNext={onNext}
			/>,
		);
		const next = screen.getByRole("button", { name: "Next month" });

		await user.tab();
		await user.tab();
		await user.tab();
		expect(next).toHaveFocus();
		expect(next).toHaveAttribute("aria-disabled", "true");

		await user.keyboard("{Enter}");
		await user.keyboard(" ");
		await user.click(next);
		expect(onNext).not.toHaveBeenCalled();
	});

	test("previous is disabled on the first month in the same way", async () => {
		const user = userEvent.setup();
		const onPrev = vi.fn();
		render(
			<MonthPicker
				label="January 2025"
				canPrev={false}
				onPrev={onPrev}
			/>,
		);
		const prev = screen.getByRole("button", { name: "Previous month" });

		await user.tab();
		expect(prev).toHaveFocus();
		expect(prev).toHaveAttribute("aria-disabled", "true");
		await user.click(prev);

		expect(onPrev).not.toHaveBeenCalled();
	});

	test("the other arrow and the month still work when one is disabled", async () => {
		const user = userEvent.setup();
		const onPrev = vi.fn();
		const onOpen = vi.fn();
		render(
			<MonthPicker
				label="November 2026 · to date"
				canNext={false}
				onPrev={onPrev}
				onOpen={onOpen}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Previous month" }));
		await user.click(
			screen.getByRole("button", { name: "November 2026 · to date" }),
		);

		expect(onPrev).toHaveBeenCalledOnce();
		expect(onOpen).toHaveBeenCalledOnce();
	});

	test("both arrows can be disabled, for a single month of data", () => {
		render(
			<MonthPicker
				label="October 2026"
				canPrev={false}
				canNext={false}
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Previous month" }),
		).toHaveAttribute("aria-disabled", "true");
		expect(screen.getByRole("button", { name: "Next month" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
	});

	test("an arrow keeps keyboard focus when it becomes disabled while focused", async () => {
		const user = userEvent.setup();
		const { rerender } = render(<MonthPicker label="October 2026" />);
		await user.tab();
		await user.tab();
		await user.tab();

		rerender(
			<MonthPicker
				label="November 2026 · to date"
				canNext={false}
			/>,
		);

		expect(screen.getByRole("button", { name: "Next month" })).toHaveFocus();
	});

	test("an arrow works again when it is enabled", async () => {
		const user = userEvent.setup();
		const onNext = vi.fn();
		const { rerender } = render(
			<MonthPicker
				label="November 2026 · to date"
				canNext={false}
				onNext={onNext}
			/>,
		);

		rerender(
			<MonthPicker
				label="October 2026"
				onNext={onNext}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Next month" }));

		expect(onNext).toHaveBeenCalledOnce();
	});

	test("shows a disabled arrow with a dashed outline, not by fading", () => {
		render(
			<MonthPicker
				label="November 2026 · to date"
				canNext={false}
			/>,
		);

		expect(screen.getByRole("button", { name: "Next month" })).toHaveClass(
			"aria-disabled:border-dashed",
			"aria-disabled:text-ink-3",
		);
	});
});

describe("look", () => {
	test("the month button is 36px, 44px on phones, with a hover fill", () => {
		render(<MonthPicker label="October 2026" />);

		expect(screen.getByRole("button", { name: "October 2026" })).toHaveClass(
			"h-9",
			"max-md:min-h-11",
			"hover:bg-soft",
			"font-semibold",
		);
	});
});

describe("the month grid in a popover", () => {
	const monthButton = () =>
		screen.getByRole("button", { name: "October 2026", hidden: true });

	test("without a grid, the month opens nothing itself", async () => {
		const user = userEvent.setup();
		render(<MonthPicker label="October 2026" />);
		await user.click(monthButton());
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(monthButton()).not.toHaveAttribute("aria-expanded");
	});

	test("the month opens the grid in a dialog named Choose a month, and says it is open", async () => {
		const user = userEvent.setup();
		render(
			<MonthPicker
				label="October 2026"
				grid={<button type="button">March</button>}
			/>,
		);
		expect(monthButton()).toHaveAttribute("aria-expanded", "false");
		await user.click(monthButton());
		const dialog = await screen.findByRole("dialog", { name: "Choose a month" });
		expect(dialog).toContainElement(
			screen.getByRole("button", { name: "March" }),
		);
		expect(monthButton()).toHaveAttribute("aria-expanded", "true");
		expect(monthButton()).toHaveAttribute("aria-haspopup", "dialog");
	});

	test("Enter and Space open it too", async () => {
		const user = userEvent.setup();
		render(
			<MonthPicker
				label="October 2026"
				grid={<button type="button">March</button>}
			/>,
		);
		await user.tab();
		await user.tab();
		await user.keyboard("{Enter}");
		expect(await screen.findByRole("dialog")).toBeVisible();
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		await waitFor(() => expect(monthButton()).toHaveFocus());
		await user.keyboard(" ");
		expect(await screen.findByRole("dialog")).toBeVisible();
	});

	test("still reports the press", async () => {
		const user = userEvent.setup();
		const onOpen = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				onOpen={onOpen}
				grid={<button type="button">March</button>}
			/>,
		);
		await user.click(monthButton());
		expect(onOpen).toHaveBeenCalledOnce();
	});

	test("takes another name", async () => {
		const user = userEvent.setup();
		render(
			<MonthPicker
				label="October 2026"
				gridLabel="Months with Budgets"
				grid={<span>grid</span>}
			/>,
		);
		await user.click(monthButton());
		expect(
			await screen.findByRole("dialog", { name: "Months with Budgets" }),
		).toBeVisible();
	});

	test("focus moves into the popover, and Escape closes it and puts focus back on the month", async () => {
		const user = userEvent.setup();
		render(
			<MonthPicker
				label="October 2026"
				grid={<button type="button">March</button>}
			/>,
		);
		await user.click(monthButton());
		const dialog = await screen.findByRole("dialog");
		await waitFor(() =>
			expect(dialog).toContainElement(document.activeElement as HTMLElement),
		);
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		await waitFor(() => expect(monthButton()).toHaveFocus());
	});

	test("a press outside closes it", async () => {
		const user = userEvent.setup();
		render(
			<>
				<MonthPicker
					label="October 2026"
					grid={<button type="button">March</button>}
				/>
				<p>Outside</p>
			</>,
		);
		await user.click(monthButton());
		await screen.findByRole("dialog");
		await user.click(document.body);
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	test("a grid given as a function gets close, for a choice that closes the popover", async () => {
		const user = userEvent.setup();
		const onPick = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				grid={(close) => (
					<button
						type="button"
						onClick={() => {
							onPick();
							close();
						}}
					>
						March
					</button>
				)}
			/>,
		);
		await user.click(monthButton());
		await user.click(await screen.findByRole("button", { name: "March" }));
		expect(onPick).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
	});

	test("a page can open and close it itself", async () => {
		const user = userEvent.setup();
		const changes: boolean[] = [];
		function Page() {
			const [open, setOpen] = useState(false);
			return (
				<>
					<MonthPicker
						label="October 2026"
						grid={<span>grid</span>}
						isGridOpen={open}
						onGridOpenChange={(next) => {
							changes.push(next);
							setOpen(next);
						}}
					/>
					<button
						type="button"
						onClick={() => setOpen(!open)}
					>
						Toggle
					</button>
				</>
			);
		}
		render(<Page />);
		await user.click(screen.getByRole("button", { name: "Toggle" }));
		expect(await screen.findByRole("dialog")).toBeVisible();
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		expect(changes).toEqual([false]);
		await user.click(monthButton());
		expect(await screen.findByRole("dialog")).toBeVisible();
		expect(changes).toEqual([false, true]);
	});

	test("an open grid that the page keeps closed stays closed", async () => {
		const user = userEvent.setup();
		const onGridOpenChange = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				grid={<span>grid</span>}
				isGridOpen={false}
				onGridOpenChange={onGridOpenChange}
			/>,
		);
		await user.click(monthButton());
		expect(onGridOpenChange).toHaveBeenCalledWith(true);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	test("the month is tinted while its popover is open", () => {
		render(
			<MonthPicker
				label="October 2026"
				grid={<span>grid</span>}
			/>,
		);
		expect(monthButton()).toHaveClass("aria-expanded:bg-accent-soft");
	});

	test("the arrows still move the month with a grid", async () => {
		const user = userEvent.setup();
		const onPrev = vi.fn();
		render(
			<MonthPicker
				label="October 2026"
				onPrev={onPrev}
				grid={<span>grid</span>}
			/>,
		);
		await user.click(screen.getByRole("button", { name: "Previous month" }));
		expect(onPrev).toHaveBeenCalledOnce();
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});

describe("with the month grid inside (BR-F04-14)", () => {
	function Page({ onPick }: { onPick: (month: string) => void }) {
		return (
			<MonthPicker
				label="October 2026"
				grid={(close) => (
					<MonthGrid
						value="2026-10"
						range={{ first: "2023-11", last: "2027-11" }}
						current="2026-11"
						dateLocale="en-IN"
						autoFocus
						onChange={(month) => {
							onPick(month);
							close();
						}}
					/>
				)}
			/>
		);
	}

	test("opening it puts focus on the chosen month", async () => {
		const user = userEvent.setup();
		render(<Page onPick={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "October 2026" }));
		await waitFor(() =>
			expect(
				screen.getByRole("option", { name: "October 2026" }),
			).toHaveFocus(),
		);
	});

	test("choosing a month closes it, with focus back on the month button", async () => {
		const user = userEvent.setup();
		const onPick = vi.fn();
		render(<Page onPick={onPick} />);
		await user.click(screen.getByRole("button", { name: "October 2026" }));
		await user.click(await screen.findByRole("option", { name: "March 2026" }));
		expect(onPick).toHaveBeenCalledWith("2026-03");
		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: "October 2026" }),
			).toHaveFocus(),
		);
	});

	test("Tab stays inside the open popover", async () => {
		const user = userEvent.setup();
		render(<Page onPick={vi.fn()} />);
		await user.click(screen.getByRole("button", { name: "October 2026" }));
		const dialog = await screen.findByRole("dialog");
		for (let i = 0; i < 5; i++) {
			await user.tab();
			expect(dialog).toContainElement(document.activeElement as HTMLElement);
		}
	});
});

describe("stretched, as on a phone (BR-F04-14)", () => {
	test("fills its row, the month taking the room between the arrows, outlined", () => {
		const { container } = render(
			<MonthPicker
				label="November 2026 · to date"
				stretch
			/>,
		);
		expect(container.firstElementChild).toHaveClass("flex", "w-full");
		expect(container.firstElementChild).not.toHaveClass("inline-flex");
		expect(
			screen.getByRole("button", { name: "November 2026 · to date" }),
		).toHaveClass("flex-1", "border", "border-edge", "min-w-0", "truncate");
	});

	test("its arrows are 44px", () => {
		render(
			<MonthPicker
				label="October 2026"
				stretch
			/>,
		);
		expect(screen.getByRole("button", { name: "Previous month" })).toHaveClass(
			"size-11",
		);
		expect(screen.getByRole("button", { name: "Next month" })).toHaveClass(
			"size-11",
		);
	});

	test("stretched for phones only, it does so below 768px and sits inline above", () => {
		const { container } = render(
			<MonthPicker
				label="October 2026"
				stretch="phone"
			/>,
		);
		expect(container.firstElementChild).toHaveClass(
			"inline-flex",
			"max-md:flex",
			"max-md:w-full",
		);
		expect(container.firstElementChild).not.toHaveClass("w-full");
		const month = screen.getByRole("button", { name: "October 2026" });
		expect(month).toHaveClass(
			"max-md:flex-1",
			"max-md:border",
			"max-md:border-edge",
		);
		expect(month).not.toHaveClass("flex-1", "border");
		expect(screen.getByRole("button", { name: "Previous month" })).toHaveClass(
			"size-9",
			"max-md:size-11",
		);
	});

	test("not stretched, it sits inline with 36px arrows and no outline on the month", () => {
		render(<MonthPicker label="October 2026" />);
		expect(screen.getByRole("button", { name: "Previous month" })).toHaveClass(
			"size-9",
		);
		expect(screen.getByRole("button", { name: "October 2026" })).not.toHaveClass(
			"border",
			"flex-1",
		);
	});
});
