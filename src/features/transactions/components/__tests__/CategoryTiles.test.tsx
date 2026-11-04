import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import type { CategoryKey } from "@/lib/categories";
import { categoryTiles } from "../../lib/entry";
import { GOLDEN_CATEGORIES } from "../../lib/__tests__/fixtures";
import { CategoryTiles, type CategoryTilesProps } from "../CategoryTiles";

/** The tiles of golden data's expense counts, as the dialog wires them. */
function Harness({
	initial = null,
	onChange,
	...props
}: Partial<CategoryTilesProps> & {
	initial?: CategoryKey | null;
	onChange?: (value: CategoryKey) => void;
}) {
	const [value, setValue] = useState(initial);
	const [expanded, setExpanded] = useState(false);
	const { tiles, rest } = categoryTiles(
		"expense",
		GOLDEN_CATEGORIES,
		value,
		expanded,
	);
	return (
		<CategoryTiles
			tiles={tiles}
			rest={rest}
			isExpanded={expanded}
			onExpandedChange={setExpanded}
			{...props}
			value={value}
			onChange={(next) => {
				setValue(next);
				onChange?.(next);
			}}
		/>
	);
}

const group = () => screen.getByRole("radiogroup", { name: "Category" });
const tileNames = () =>
	within(group())
		.getAllByRole("radio")
		.map((radio) => radio.closest("label")?.textContent);
const tile = (name: string) =>
	screen.getByRole("radio", { name }).closest("label") as HTMLElement;

describe("the tiles (BR-F03-75)", () => {
	// AC-F03-62
	test("is a radio group named Category, with the 7 tiles and + 8 more", () => {
		render(<Harness />);

		expect(tileNames()).toEqual([
			"Food",
			"Entertainment",
			"Housing",
			"Shopping",
			"Transportation",
			"Health",
			"Utilities",
		]);
		expect(
			screen.getByRole("button", { name: "+ 8 more categories" }),
		).toHaveTextContent("+ 8 more");
	});

	test("each tile shows its category's icon, hidden from screen readers", () => {
		render(<Harness />);

		const icon = tile("Food").querySelector("svg");
		expect(icon).toHaveAttribute("aria-hidden", "true");
		expect(icon).toHaveClass("text-(--tile)");
		expect(tile("Food").parentElement).toHaveStyle({
			"--tile": "var(--cat-food)",
		});
	});

	test("a category key with an underscore takes its own colour", () => {
		render(<Harness initial="personal_care" />);

		expect(tile("Personal care").parentElement).toHaveStyle({
			"--tile": "var(--cat-personal-care)",
		});
	});

	test("nothing is chosen at first", () => {
		render(<Harness />);

		for (const radio of screen.getAllByRole("radio"))
			expect(radio).not.toBeChecked();
	});

	test("a press chooses a tile and says which", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Harness onChange={onChange} />);

		await user.click(tile("Housing"));

		expect(onChange).toHaveBeenCalledExactlyOnceWith("housing");
		expect(screen.getByRole("radio", { name: "Housing" })).toBeChecked();
		expect(tile("Housing")).toHaveAttribute("data-selected", "true");
	});

	test("Tab lands on the chosen tile and the arrow keys move and choose", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<>
				<button type="button">Before</button>
				<Harness
					initial="housing"
					onChange={onChange}
				/>
			</>,
		);

		screen.getByRole("button", { name: "Before" }).focus();
		await user.tab();
		expect(screen.getByRole("radio", { name: "Housing" })).toHaveFocus();
		await user.keyboard("{ArrowRight}");

		expect(screen.getByRole("radio", { name: "Shopping" })).toHaveFocus();
		expect(onChange).toHaveBeenLastCalledWith("shopping");
	});

	test("the chosen category outside the 7 shows as an eighth tile, with + 7 more", () => {
		render(<Harness initial="loans" />);

		expect(tileNames().at(-1)).toBe("Loans");
		expect(screen.getByRole("radio", { name: "Loans" })).toBeChecked();
		expect(
			screen.getByRole("button", { name: "+ 7 more categories" }),
		).toBeInTheDocument();
	});
});

describe("+ N more and Show fewer (D-550)", () => {
	test("+ 8 more adds the rest after the tiles shown, and says it is expanded", async () => {
		const user = userEvent.setup();
		render(<Harness />);

		const more = screen.getByRole("button", { name: "+ 8 more categories" });
		expect(more).toHaveAttribute("aria-expanded", "false");
		await user.click(more);

		expect(tileNames()).toEqual([
			"Food",
			"Entertainment",
			"Housing",
			"Shopping",
			"Transportation",
			"Health",
			"Utilities",
			"Education",
			"Travel",
			"Insurance",
			"Personal care",
			"Gifts and donations",
			"Fees and taxes",
			"Loans",
			"Other",
		]);
		const fewer = screen.getByRole("button", { name: "Show fewer" });
		expect(fewer).toHaveAttribute("aria-expanded", "true");
	});

	// D-550
	test("choosing among the opened tiles leaves every tile where it is", async () => {
		const user = userEvent.setup();
		render(<Harness />);

		await user.click(
			screen.getByRole("button", { name: "+ 8 more categories" }),
		);
		const before = tileNames();
		await user.click(tile("Travel"));

		expect(tileNames()).toEqual(before);
		expect(tileNames()[8]).toBe("Travel");
		expect(screen.getByRole("radio", { name: "Travel" })).toBeChecked();
	});

	test("Show fewer goes back to the 7, keeping a chosen extra tile", async () => {
		const user = userEvent.setup();
		render(<Harness />);

		await user.click(
			screen.getByRole("button", { name: "+ 8 more categories" }),
		);
		await user.click(tile("Travel"));
		await user.click(screen.getByRole("button", { name: "Show fewer" }));

		expect(tileNames()).toEqual([
			"Food",
			"Entertainment",
			"Housing",
			"Shopping",
			"Transportation",
			"Health",
			"Utilities",
			"Travel",
		]);
		expect(screen.getByRole("radio", { name: "Travel" })).toBeChecked();
	});

	test("Enter and Space press the button", async () => {
		const user = userEvent.setup();
		render(<Harness />);

		screen.getByRole("button", { name: "+ 8 more categories" }).focus();
		await user.keyboard("{Enter}");
		expect(screen.getByRole("button", { name: "Show fewer" })).toHaveFocus();
		await user.keyboard(" ");

		expect(
			screen.getByRole("button", { name: "+ 8 more categories" }),
		).toHaveFocus();
	});

	test("with nothing left out there is no button", () => {
		const { tiles } = categoryTiles("income", GOLDEN_CATEGORIES, null, false);
		render(
			<CategoryTiles
				tiles={tiles}
				rest={0}
				isExpanded={false}
				onExpandedChange={vi.fn()}
				value={null}
				onChange={vi.fn()}
			/>,
		);

		expect(screen.getAllByRole("radio")).toHaveLength(5);
		expect(screen.queryByRole("button")).toBeNull();
	});
});

describe("hint and error (BR-F03-45, F03 section 8)", () => {
	test("the payee's hint describes the group", () => {
		render(<Harness hint="From your last Swiggy Transaction" />);

		expect(group()).toHaveAccessibleDescription(
			"From your last Swiggy Transaction",
		);
	});

	test("an error replaces the hint and marks the group invalid", () => {
		render(
			<Harness
				hint="From your last Swiggy Transaction"
				error="Choose a category."
			/>,
		);

		expect(group()).toHaveAttribute("aria-invalid", "true");
		expect(group()).toHaveAccessibleDescription("Choose a category.");
		expect(screen.queryByText("From your last Swiggy Transaction")).toBeNull();
	});
});

describe("a hint that comes later (BR-F03-45)", () => {
	test("is linked when it appears and unlinked when it goes", () => {
		const { rerender } = render(<Harness />);
		expect(group()).not.toHaveAttribute("aria-describedby");

		rerender(<Harness hint="From your last Swiggy Transaction" />);
		expect(group()).toHaveAccessibleDescription(
			"From your last Swiggy Transaction",
		);

		rerender(<Harness />);
		expect(group()).not.toHaveAttribute("aria-describedby");
		expect(screen.queryByText(/From your last/)).toBeNull();
	});
});

describe("disabled", () => {
	test("takes no choice and no expanding", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<Harness
				isDisabled
				onChange={onChange}
			/>,
		);

		await user.click(tile("Food"));
		const more = screen.getByRole("button", { name: "+ 8 more categories" });
		await user.click(more);

		expect(onChange).not.toHaveBeenCalled();
		expect(screen.getByRole("radio", { name: "Food" })).toBeDisabled();
		expect(more).toBeDisabled();
		expect(tileNames()).toHaveLength(7);
	});
});

describe("className", () => {
	test("goes on the root, after its own classes", () => {
		const { container } = render(<Harness className="mt-2" />);

		expect(container.firstElementChild).toHaveClass("flex", "mt-2");
	});
});
