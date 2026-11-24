import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { type RowArrows, useRowArrows } from "../useRowArrows";

const IDS = ["a", "b", "c", "d"];

function Rows({
	ids = IDS,
	selected = null,
	onSelect,
	mode,
	selectionOf,
	keyOf = (id: string) => id,
	noHolder = false,
}: {
	ids?: string[];
	selected?: string | null;
	onSelect: (value: string) => void;
	mode?: RowArrows;
	selectionOf?: (id: string) => string;
	keyOf?: (id: string) => string;
	/** Never gives the hook its holder, as before the ref callback has committed. */
	noHolder?: boolean;
}) {
	const [holder, setHolder] = useState<HTMLDivElement | null>(null);
	useRowArrows({
		holder: noHolder ? null : holder,
		ids: ids.map(keyOf),
		selected,
		onSelect,
		...(mode === undefined ? {} : { mode }),
		...(selectionOf === undefined ? {} : { selectionOf }),
	});
	return (
		<>
			<input aria-label="Search" />
			<div ref={setHolder}>
				{ids.map((id) => (
					<div
						key={id}
						role="row"
						tabIndex={-1}
						data-key={keyOf(id)}
					>
						Row {id}
						<button type="button">Menu {id}</button>
					</div>
				))}
			</div>
		</>
	);
}

const row = (id: string) =>
	screen
		.getByText(`Row ${id}`, { exact: false })
		.closest("[role=row]") as HTMLElement;

function setup(props: Partial<Parameters<typeof Rows>[0]> = {}) {
	const onSelect = vi.fn();
	render(
		<Rows
			onSelect={onSelect}
			{...props}
		/>,
	);
	return { onSelect, user: userEvent.setup() };
}

describe("useRowArrows (BR-F04-32, BR-F05-45)", () => {
	test("Down with nothing focused or selected selects the first row and focuses it", async () => {
		const { onSelect, user } = setup();
		await user.keyboard("{ArrowDown}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("a");
		expect(row("a")).toHaveFocus();
	});

	test("Down again moves on from the focused row", async () => {
		const { onSelect, user } = setup();
		await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}");
		expect(onSelect.mock.calls.map(([value]) => value)).toEqual(["a", "b", "c"]);
		expect(row("c")).toHaveFocus();
	});

	test("Down at the last row stays on it", async () => {
		const { onSelect, user } = setup();
		row("d").focus();
		await user.keyboard("{ArrowDown}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("d");
		expect(row("d")).toHaveFocus();
	});

	test("Up moves back a row", async () => {
		const { onSelect, user } = setup();
		row("c").focus();
		await user.keyboard("{ArrowUp}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("b");
		expect(row("b")).toHaveFocus();
	});

	test("Up from the first row is left to React Aria and selects nothing", async () => {
		const { onSelect, user } = setup();
		row("a").focus();
		await user.keyboard("{ArrowUp}");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("starts from the selected row when focus is elsewhere", async () => {
		const { onSelect, user } = setup({ selected: "b" });
		await user.keyboard("{ArrowDown}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("c");
		expect(row("c")).toHaveFocus();
	});

	test("Up with a selection and no focus goes to the row before it", async () => {
		const { onSelect, user } = setup({ selected: "c" });
		await user.keyboard("{ArrowUp}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("b");
	});

	test("a button inside a row counts as that row", async () => {
		const { onSelect, user } = setup();
		screen.getByRole("button", { name: "Menu b" }).focus();
		await user.keyboard("{ArrowDown}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("c");
	});

	test("in the focus mode it only moves focus", async () => {
		const { onSelect, user } = setup({ mode: "focus" });
		await user.keyboard("{ArrowDown}{ArrowDown}");
		expect(onSelect).not.toHaveBeenCalled();
		expect(row("b")).toHaveFocus();
	});

	test("in the off mode it does nothing", async () => {
		const { onSelect, user } = setup({ mode: "off" });
		await user.keyboard("{ArrowDown}");
		expect(onSelect).not.toHaveBeenCalled();
		expect(document.body).toHaveFocus();
	});

	test("with no rows it does nothing", async () => {
		const { onSelect, user } = setup({ ids: [] });
		await user.keyboard("{ArrowDown}{ArrowUp}");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("a text field keeps its own arrow keys", async () => {
		const { onSelect, user } = setup();
		await user.click(screen.getByRole("textbox", { name: "Search" }));
		await user.keyboard("{ArrowDown}{ArrowUp}");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("without its holder yet, a text field keeps its arrow keys and nothing is stopped", async () => {
		const { onSelect, user } = setup({ noHolder: true });
		const search = screen.getByRole("textbox", { name: "Search" });
		await user.click(search);
		const stopped: boolean[] = [];
		search.addEventListener("keydown", (event) =>
			stopped.push(event.defaultPrevented),
		);
		await user.keyboard("{ArrowDown}{ArrowUp}");
		expect(onSelect).not.toHaveBeenCalled();
		expect(stopped).toEqual([false, false]);
	});

	test("selects what selectionOf makes of the row id, as Budgets select a category", async () => {
		const { onSelect, user } = setup({
			keyOf: (id) => `budget:${id}`,
			selectionOf: (id) => id.slice(id.indexOf(":") + 1),
		});
		await user.keyboard("{ArrowDown}{ArrowDown}");
		expect(onSelect.mock.calls.map(([value]) => value)).toEqual(["a", "b"]);
		expect(row("b")).toHaveFocus();
	});

	test("selectionOf also finds the selected row", async () => {
		const { onSelect, user } = setup({
			keyOf: (id) => `budget:${id}`,
			selectionOf: (id) => id.slice(id.indexOf(":") + 1),
			selected: "c",
		});
		await user.keyboard("{ArrowDown}");
		expect(onSelect).toHaveBeenCalledExactlyOnceWith("d");
	});

	test("an id with punctuation is still found to focus", async () => {
		const { onSelect, user } = setup({ keyOf: (id) => `0192:${id}"x` });
		await user.keyboard("{ArrowDown}");
		expect(onSelect).toHaveBeenCalledWith('0192:a"x');
		expect(row("a")).toHaveFocus();
	});
});
