import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import {
	ConflictView,
	type ConflictViewProps,
	type ConflictViewText,
} from "../ConflictView";

const TEXT: ConflictViewText = {
	title: "This item changed on another device",
	intro: "Choose which version to keep.",
	deleteIntro: "It changed after you chose to delete it.",
	mine: "Yours",
	theirs: "Saved now",
	differs: "Differs",
	keepMine: "Keep mine",
	keepTheirs: "Keep theirs",
	deleteAnyway: "Delete anyway",
	keepIt: "Keep it",
};

const ROWS: ConflictViewProps["rows"] = [
	{
		key: "amount",
		label: "Amount",
		differs: true,
		mine: "₹2,900.00",
		theirs: "₹3,100.00",
	},
	{
		key: "payee",
		label: "Payee",
		differs: false,
		mine: "BigBasket",
		theirs: "BigBasket",
	},
];

function renderView(props: Partial<ConflictViewProps> = {}) {
	const handlers = {
		onOpenChange: vi.fn(),
		onKeepMine: vi.fn(),
		onKeepTheirs: vi.fn(),
	};
	render(
		<ConflictView
			text={TEXT}
			rowHeading="Field"
			isOpen
			rows={ROWS}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

const dialog = () =>
	screen.getByRole("dialog", { name: "This item changed on another device" });

describe("ConflictView", () => {
	test("is a dialog with its title and intro, and nothing when closed", () => {
		renderView();
		expect(
			within(dialog()).getByText("Choose which version to keep."),
		).toBeVisible();
	});

	test("shows nothing while closed", () => {
		renderView({ isOpen: false });
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("lays both versions out under the three headings", () => {
		renderView();
		const table = within(dialog()).getByRole("table");
		expect(
			within(table)
				.getAllByRole("columnheader")
				.map((each) => each.textContent),
		).toEqual(["Field", "Yours", "Saved now"]);
		const rows = within(table).getAllByRole("row").slice(1);
		expect(rows).toHaveLength(2);
		expect(
			within(rows[0]!)
				.getAllByRole("cell")
				.map((each) => each.textContent),
		).toEqual(["₹2,900.00", "₹3,100.00"]);
	});

	test("marks a row that differs with the word, a tint and data-differs; others stay plain", () => {
		renderView();
		const [differing, same] = within(dialog()).getAllByRole("row").slice(1);
		expect(within(differing!).getByText("Differs")).toBeVisible();
		expect(differing).toHaveAttribute("data-differs", "true");
		expect(differing).toHaveClass("bg-accent-soft");
		expect(within(same!).queryByText("Differs")).toBeNull();
		expect(same).not.toHaveAttribute("data-differs");
		expect(same).not.toHaveClass("bg-accent-soft");
	});

	test("Keep mine and Keep theirs each report their press", async () => {
		const { user, onKeepMine, onKeepTheirs } = renderView();
		await user.click(
			within(dialog()).getByRole("button", { name: "Keep theirs" }),
		);
		expect(onKeepTheirs).toHaveBeenCalledTimes(1);
		expect(onKeepMine).not.toHaveBeenCalled();
		await user.click(
			within(dialog()).getByRole("button", { name: "Keep mine" }),
		);
		expect(onKeepMine).toHaveBeenCalledTimes(1);
	});

	test("a delete reads its own intro, Delete anyway and Keep it", () => {
		renderView({ isDelete: true });
		expect(
			within(dialog()).getByText("It changed after you chose to delete it."),
		).toBeVisible();
		expect(
			within(dialog()).queryByText("Choose which version to keep."),
		).toBeNull();
		expect(
			within(dialog()).queryByRole("button", { name: "Keep mine" }),
		).toBeNull();
		expect(
			within(dialog()).getByRole("button", { name: "Delete anyway" }),
		).toBeVisible();
		expect(
			within(dialog()).getByRole("button", { name: "Keep it" }),
		).toBeVisible();
	});

	test("a delete heads the user's column with deletedMine when the text has one", () => {
		renderView({
			isDelete: true,
			text: { ...TEXT, deletedMine: "As you deleted it" },
		});
		expect(
			within(dialog())
				.getAllByRole("columnheader")
				.map((each) => each.textContent),
		).toEqual(["Field", "As you deleted it", "Saved now"]);
	});

	test("deletedMine is ignored when it is not a delete", () => {
		renderView({ text: { ...TEXT, deletedMine: "As you deleted it" } });
		expect(within(dialog()).getAllByRole("columnheader")[1]).toHaveTextContent(
			"Yours",
		);
	});

	test("says what Keep mine saves when it is given a line", () => {
		renderView({ keepMineLine: "Keep mine saves the note." });
		expect(
			within(dialog()).getByText("Keep mine saves the note."),
		).toBeVisible();
	});

	test("without a line there is no caption", () => {
		renderView();
		expect(within(dialog()).queryByText(/saves/)).toBeNull();
	});

	test("while pending, Keep theirs is disabled and Keep mine shows it is working", () => {
		renderView({ isPending: true });
		expect(
			within(dialog()).getByRole("button", { name: "Keep theirs" }),
		).toHaveAttribute("aria-disabled", "true");
		expect(
			within(dialog()).getByRole("button", { name: /Keep mine/ }),
		).toHaveAttribute("aria-disabled", "true");
	});

	test("tabular figures only when asked, and the first column's width is the caller's", () => {
		renderView({ figures: true, rowColumnClassName: "w-[26%]" });
		const table = within(dialog()).getByRole("table");
		expect(table).toHaveClass("figures");
		expect(within(table).getAllByRole("columnheader")[0]).toHaveClass("w-[26%]");
	});

	test("by default the table has no figures class and the first column is 30%", () => {
		renderView();
		const table = within(dialog()).getByRole("table");
		expect(table).not.toHaveClass("figures");
		expect(within(table).getAllByRole("columnheader")[0]).toHaveClass("w-[30%]");
	});

	test("takes the caller's className on the panel", () => {
		renderView({ className: "custom-class" });
		expect(dialog().parentElement).toHaveClass("custom-class");
	});
});
