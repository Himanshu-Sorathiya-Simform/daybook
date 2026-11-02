import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

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
