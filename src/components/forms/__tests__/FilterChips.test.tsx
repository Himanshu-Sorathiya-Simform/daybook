import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	FilterChips,
	type FilterChip,
	type FilterChipsProps,
} from "@/components/forms/FilterChips";

// Check B's drill-down (flow 7.7): last month, Food, ₹1,000 to ₹2,500, and a search.
const CHIPS: FilterChip[] = [
	{ id: "date", label: "Last month" },
	{ id: "category:food", label: "Food" },
	{ id: "amount", label: "₹1,000 to ₹2,500" },
	{ id: "q", label: "“swiggy”" },
];

function renderChips(props: Partial<FilterChipsProps> = {}) {
	const user = userEvent.setup();
	const onRemove = vi.fn();
	const onClearAll = vi.fn();
	const view = render(
		<>
			<button type="button">Before</button>
			<FilterChips
				label="Active filters"
				chips={CHIPS}
				onRemove={onRemove}
				onClearAll={onClearAll}
				{...props}
			/>
			<button type="button">After</button>
		</>,
	);
	return { ...view, user, onRemove, onClearAll };
}

const group = () => screen.getByRole("grid", { name: "Active filters" });
const chip = (name: string) => screen.getByRole("row", { name });
const remove = (label: string) =>
	screen.getByRole("button", { name: `Remove ${label}` });

/** Keeps the chips in state, as the page does through the URL. */
function Host({ start = CHIPS }: { start?: FilterChip[] }) {
	const [chips, setChips] = useState(start);
	return (
		<>
			<button type="button">Before</button>
			<FilterChips
				label="Active filters"
				chips={chips}
				onRemove={(id) => setChips((all) => all.filter((c) => c.id !== id))}
				onClearAll={() => setChips([])}
			/>
		</>
	);
}

describe("showing", () => {
	test("shows each chip in order, in a group named by the label", () => {
		renderChips();

		expect(
			within(group())
				.getAllByRole("row")
				.map((row) => row.textContent),
		).toEqual(["Last month", "Food", "₹1,000 to ₹2,500", "“swiggy”"]);
	});

	test("shows Clear all after the chips", () => {
		const { container } = renderChips();

		const root = container.querySelector(".flex-wrap")!;
		expect(root.lastElementChild).toBe(
			screen.getByRole("button", { name: "Clear all" }),
		);
	});

	test("shows nothing at all while no filter is on", () => {
		const { container } = renderChips({ chips: [] });

		expect(screen.queryByRole("grid")).toBeNull();
		expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
		expect(container.querySelector(".flex-wrap")).toBeNull();
	});

	test("shows a single chip with Clear all", () => {
		renderChips({ chips: [{ id: "date", label: "Last month" }] });

		expect(within(group()).getAllByRole("row")).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Clear all" })).toBeVisible();
	});

	test("keeps a long label whole and lets the chips wrap", () => {
		const label = "From a very long payee name ".repeat(4).trim();
		renderChips({ chips: [{ id: "q", label }] });

		expect(chip(label)).toHaveTextContent(label);
		expect(chip(label).parentElement).toHaveClass("flex-wrap");
	});

	test("follows chips that change", () => {
		const { rerender, onRemove, onClearAll } = renderChips();

		rerender(
			<FilterChips
				label="Active filters"
				chips={[{ id: "type:income", label: "Income" }]}
				onRemove={onRemove}
				onClearAll={onClearAll}
			/>,
		);

		expect(
			within(group())
				.getAllByRole("row")
				.map((row) => row.textContent),
		).toEqual(["Income"]);
	});

	test("chips are 44px tall on phones", () => {
		renderChips();

		expect(chip("Food")).toHaveClass("h-7", "max-md:h-11");
		expect(screen.getByRole("button", { name: "Clear all" })).toHaveClass(
			"max-md:min-h-11",
		);
	});

	test("takes the caller's classes on the root", () => {
		const { container } = renderChips({ className: "mt-2" });

		expect(container.querySelector(".mt-2")).toHaveClass("flex", "flex-wrap");
	});
});

describe("remove buttons", () => {
	test.each(CHIPS.map((c) => c.label))('are named "Remove %s"', (label) => {
		renderChips();

		expect(remove(label)).toBeInTheDocument();
	});

	test("hide their icon from screen readers", () => {
		renderChips();

		expect(remove("Food").querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("a press removes that chip's filter, once, and no other", async () => {
		const { user, onRemove, onClearAll } = renderChips();

		await user.click(remove("Food"));

		expect(onRemove).toHaveBeenCalledExactlyOnceWith("category:food");
		expect(onClearAll).not.toHaveBeenCalled();
	});

	test.each(CHIPS)("each chip removes its own id: $id", async ({ id, label }) => {
		const { user, onRemove } = renderChips();

		await user.click(remove(label));

		expect(onRemove).toHaveBeenCalledExactlyOnceWith(id);
	});

	test("a press on the chip itself removes nothing", async () => {
		const { user, onRemove } = renderChips();

		await user.click(within(chip("Food")).getByText("Food"));

		expect(onRemove).not.toHaveBeenCalled();
	});

	test("the chip goes once the parent drops it", async () => {
		const user = userEvent.setup();
		render(<Host />);

		await user.click(remove("Food"));

		expect(screen.queryByRole("row", { name: "Food" })).toBeNull();
		expect(within(group()).getAllByRole("row")).toHaveLength(3);
	});
});

describe("keyboard", () => {
	test("Tab reaches the chips once, on the first chip, then its remove button, then Clear all", async () => {
		const { user } = renderChips();
		screen.getByRole("button", { name: "Before" }).focus();

		await user.tab();
		expect(chip("Last month")).toHaveFocus();

		await user.tab();
		expect(remove("Last month")).toHaveFocus();

		await user.tab();
		expect(screen.getByRole("button", { name: "Clear all" })).toHaveFocus();

		await user.tab();
		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("the arrows move between chips", async () => {
		const { user } = renderChips();
		chip("Last month").focus();

		await user.keyboard("{ArrowRight}{ArrowRight}");
		expect(chip("₹1,000 to ₹2,500")).toHaveFocus();

		await user.keyboard("{ArrowLeft}");
		expect(chip("Food")).toHaveFocus();
	});

	test.each(["{Delete}", "{Backspace}"])(
		"%s removes the focused chip's filter",
		async (key) => {
			const { user, onRemove } = renderChips();
			chip("Last month").focus();
			await user.keyboard("{ArrowRight}");

			await user.keyboard(key);

			expect(onRemove).toHaveBeenCalledExactlyOnceWith("category:food");
		},
	);

	test("after a removal, focus stays among the chips", async () => {
		const user = userEvent.setup();
		render(<Host />);
		chip("Last month").focus();
		await user.keyboard("{ArrowRight}{Delete}");

		await waitFor(() =>
			expect(group()).toContainElement(document.activeElement as HTMLElement),
		);
		expect(screen.queryByRole("row", { name: "Food" })).toBeNull();
	});

	test("Delete on the last chip left removes it and the whole row goes", async () => {
		const user = userEvent.setup();
		render(<Host start={[{ id: "date", label: "Last month" }]} />);
		chip("Last month").focus();

		await user.keyboard("{Delete}");

		expect(screen.queryByRole("grid")).toBeNull();
		expect(screen.queryByRole("button", { name: "Clear all" })).toBeNull();
	});

	test("only the focused chip's remove button is a Tab stop, and Enter on it removes that filter", async () => {
		const { user, onRemove } = renderChips();
		chip("Last month").focus();
		await user.keyboard("{ArrowRight}");

		await user.tab();
		expect(remove("Food")).toHaveFocus();
		await user.keyboard("{Enter}");

		expect(onRemove).toHaveBeenCalledExactlyOnceWith("category:food");
		await user.tab();
		expect(screen.getByRole("button", { name: "Clear all" })).toHaveFocus();
	});
});

describe("Clear all", () => {
	test("clears every filter, once, and removes none one by one", async () => {
		const { user, onRemove, onClearAll } = renderChips();

		await user.click(screen.getByRole("button", { name: "Clear all" }));

		expect(onClearAll).toHaveBeenCalledOnce();
		expect(onRemove).not.toHaveBeenCalled();
	});

	test.each(["{Enter}", " "])(
		"%j on Clear all clears every filter",
		async (key) => {
			const { user, onClearAll } = renderChips();
			screen.getByRole("button", { name: "Clear all" }).focus();

			await user.keyboard(key);

			expect(onClearAll).toHaveBeenCalledOnce();
		},
	);

	test("the row goes once the parent clears the chips", async () => {
		const user = userEvent.setup();
		render(<Host />);

		await user.click(screen.getByRole("button", { name: "Clear all" }));

		expect(screen.queryByRole("grid")).toBeNull();
	});

	test("is in the accent colour, so it reads as an action", () => {
		renderChips();

		expect(screen.getByRole("button", { name: "Clear all" })).toHaveClass(
			"text-accent",
		);
	});
});
