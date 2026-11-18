import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	type CategoryKey,
	EXPENSE_CATEGORIES,
	INCOME_CATEGORIES,
} from "@/lib/categories";
import { CategoryTiles, type CategoryTilesProps } from "../CategoryTiles";

/** The 7 tiles Transactions' entry dialog shows for golden data's expense counts. */
const TOP: CategoryKey[] = [
	"food",
	"entertainment",
	"housing",
	"shopping",
	"transportation",
	"health",
	"utilities",
];
const REST = EXPENSE_CATEGORIES.filter((key) => !TOP.includes(key));

/** The tiles shown: the 7, then the rest when expanded, or a chosen one of the rest. */
function tilesOf(chosen: CategoryKey | null, expanded: boolean) {
	if (expanded) return { tiles: [...TOP, ...REST], rest: REST.length };
	const extra = chosen !== null && REST.includes(chosen as never) ? [chosen] : [];
	return { tiles: [...TOP, ...extra], rest: REST.length - extra.length };
}

/** The tiles as Transactions' entry dialog wires them. */
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
	const { tiles, rest } = tilesOf(value, expanded);
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

	test("focus stays where it was unless asked for", () => {
		render(<Harness />);

		expect(
			screen
				.getAllByRole("radio")
				.some((tile) => tile === document.activeElement),
		).toBe(false);
	});

	test("autoFocus puts focus on the first tile when it opens", () => {
		render(<Harness autoFocus />);

		expect(screen.getAllByRole("radio")[0]).toHaveFocus();
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
		render(
			<CategoryTiles
				tiles={INCOME_CATEGORIES}
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

describe("captions (BR-F04-19)", () => {
	test("a caption shows under its tile's label and is read with it; tiles without one have none", () => {
		render(
			<CategoryTiles
				tiles={["health", "housing"]}
				captions={{ health: "₹1,500.00 in Sept" }}
				value={null}
				onChange={vi.fn()}
			/>,
		);

		expect(
			screen.getByRole("radio", { name: "Health, ₹1,500.00 in Sept" }),
		).toBeInTheDocument();
		expect(screen.getByRole("radio", { name: "Housing" })).toBeInTheDocument();
		expect(screen.getByText("₹1,500.00 in Sept", { exact: false })).toHaveClass(
			"text-small",
			"text-ink-2",
		);
	});

	test("without + N more's props there is no button, and a choice still works", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<CategoryTiles
				tiles={["health", "housing"]}
				value={null}
				onChange={onChange}
			/>,
		);

		expect(screen.queryByRole("button")).toBeNull();
		await user.click(tile("Housing"));
		expect(onChange).toHaveBeenCalledExactlyOnceWith("housing");
	});

	test("a tile is at least as tall as before and grows with a caption", () => {
		render(<Harness />);
		expect(tile("Food")).toHaveClass("min-h-14.5");
	});
});

describe("className", () => {
	test("goes on the root, after its own classes", () => {
		const { container } = render(<Harness className="mt-2" />);

		expect(container.firstElementChild).toHaveClass("flex", "mt-2");
	});
});
