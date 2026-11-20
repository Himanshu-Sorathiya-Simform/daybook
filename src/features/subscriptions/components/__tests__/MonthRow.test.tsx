import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { monthCells, monthWindow } from "../../lib/calendar";
import { MonthRow, type MonthRowProps } from "../MonthRow";
import { CAL } from "./calendar-data";

const ROWS = [
	{ month: "2026-10", chargedMinor: 2014800, expectedMinor: 0 },
	{ month: "2026-11", chargedMinor: 1800000, expectedMinor: 214900 },
	{ month: "2026-12", chargedMinor: 0, expectedMinor: 2014900 },
];

function setup(
	props: Partial<MonthRowProps> & {
		count?: number;
		rows?: typeof ROWS | undefined;
		selected?: string;
	} = {},
) {
	const { count = 8, selected = "2026-11", ...rest } = props;
	const rows = "rows" in props ? props.rows : ROWS;
	const handlers = {
		onEarlier: vi.fn(),
		onLater: vi.fn(),
		onPick: vi.fn(),
	};
	render(
		<MonthRow
			cells={monthCells(
				monthWindow("2026-11", 0, count),
				rows,
				{ current: "2026-11", selected },
				CAL,
			)}
			isLoading={false}
			canEarlier
			canLater
			{...handlers}
			{...rest}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

const options = () => screen.getAllByRole("option");
/** What the eye reads of a month: its parts that are not hidden from screen readers. */
const seen = (option: HTMLElement) =>
	[...option.querySelectorAll("[aria-hidden]")]
		.map((part) => part.textContent)
		.join("");

describe("MonthRow (BR-F05-38)", () => {
	// AC-F05-38
	test("shows 8 months from August 2026, each named by what it holds", () => {
		setup();
		const names = options().map((option) => option.textContent);
		expect(names).toHaveLength(8);
		expect(
			screen.getByRole("option", { name: "October 2026, charged ₹20,148.00" }),
		).toBeVisible();
		expect(
			screen.getByRole("option", {
				name: "November 2026, charged ₹18,000.00 of ₹20,149.00",
			}),
		).toBeVisible();
		expect(
			screen.getByRole("option", {
				name: "December 2026, expected ₹20,149.00",
			}),
		).toBeVisible();
		expect(screen.getByRole("option", { name: /^August 2026/ })).toBeVisible();
		expect(screen.getByRole("option", { name: /^March 2027/ })).toBeVisible();
	});

	// AC-F05-38
	test.each([
		[4, "October 2026", "January 2027"],
		[5, "October 2026", "February 2027"],
		[6, "September 2026", "February 2027"],
		[7, "September 2026", "March 2027"],
		[8, "August 2026", "March 2027"],
	])("with room for %i months it shows them, %s to %s", (count, first, last) => {
		setup({ count });
		expect(options()).toHaveLength(count);
		expect(options()[0]).toHaveAccessibleName(new RegExp(`^${first}`));
		expect(options().at(-1)).toHaveAccessibleName(new RegExp(`^${last}`));
	});

	test("is a list box named Month", () => {
		setup();
		expect(screen.getByRole("listbox", { name: "Month" })).toBeVisible();
	});

	test("shows the short names, and the year only when it differs", () => {
		setup();
		const text = options().map(seen);
		expect(text).toContain("Oct₹20,148");
		expect(text).toContain("Nov₹20,149");
		expect(text).toContain("Jan 2027₹0");
	});

	test("writes each figure in whole units", () => {
		setup();
		const nov = screen.getByRole("option", { name: /^November 2026/ });
		expect(nov).toHaveTextContent("₹20,149");
		expect(
			screen.getByRole("option", { name: /^January 2027/ }),
		).toHaveTextContent("₹0");
	});

	test("the chosen month is selected, the others not", () => {
		setup({ selected: "2026-12" });
		expect(
			screen.getByRole("option", { name: /^December 2026/ }),
		).toHaveAttribute("aria-selected", "true");
		expect(
			screen.getByRole("option", { name: /^November 2026/ }),
		).toHaveAttribute("aria-selected", "false");
	});

	test("pressing a month picks it", async () => {
		const { onPick, user } = setup();
		await user.click(screen.getByRole("option", { name: /^December 2026/ }));
		expect(onPick).toHaveBeenCalledExactlyOnceWith("2026-12");
	});

	test("pressing the chosen month picks it again and never clears", async () => {
		const { onPick, user } = setup();
		await user.click(screen.getByRole("option", { name: /^November 2026/ }));
		expect(onPick).toHaveBeenCalledExactlyOnceWith("2026-11");
	});

	test("the arrow keys move along the row and Enter picks", async () => {
		const { onPick, user } = setup();
		screen.getByRole("option", { name: /^November 2026/ }).focus();
		await user.keyboard("{ArrowRight}{Enter}");
		expect(onPick).toHaveBeenCalledExactlyOnceWith("2026-12");
	});

	test("Escape is left to the page and picks nothing", async () => {
		const { onPick, user } = setup();
		screen.getByRole("option", { name: /^November 2026/ }).focus();
		await user.keyboard("{Escape}");
		expect(onPick).not.toHaveBeenCalled();
	});

	test("past months carry a check mark, later ones and the current one do not", () => {
		setup();
		const checked = options()
			.filter((option) => option.querySelector("svg"))
			.map((option) => option.getAttribute("aria-label") ?? seen(option));
		expect(checked).toEqual(
			["Aug", "Sep", "Oct"].map((name) => expect.stringContaining(name)),
		);
		expect(
			screen
				.getByRole("option", { name: /^November 2026/ })
				.querySelector("svg"),
		).toBeNull();
		expect(
			screen
				.getByRole("option", { name: /^December 2026/ })
				.querySelector("svg"),
		).toBeNull();
	});

	const track = (name: RegExp) =>
		screen
			.getByRole("option", { name })
			.querySelector<HTMLElement>("span.bg-track");
	const fill = (name: RegExp) =>
		track(name)?.firstElementChild as HTMLElement | null;

	test("the current month alone has a bar", () => {
		setup();
		expect(track(/^November 2026/)).not.toBeNull();
		expect(track(/^October 2026/)).toBeNull();
		expect(track(/^December 2026/)).toBeNull();
	});

	test("the charged share fills the track and the rest is left as the track", () => {
		setup();
		// 1,800,000 of 2,014,900 is 89.3%.
		expect(fill(/^November 2026/)!.style.width).toBe("89.3%");
		expect(track(/^November 2026/)!.children).toHaveLength(1);
	});

	test("the fill is the bar's colour over the track's", () => {
		setup();
		expect(fill(/^November 2026/)).toHaveClass("bg-bar");
		expect(track(/^November 2026/)).toHaveClass("bg-track");
	});

	test("a selected month has a darker track, so it shows against the selection's tint", () => {
		setup();
		expect(track(/^November 2026/)).toHaveClass(
			"group-selected:bg-line-strong/40",
		);
		expect(screen.getByRole("option", { name: /^November 2026/ })).toHaveClass(
			"group",
		);
	});

	test("with nothing to come the fill is the whole track", () => {
		setup({
			rows: [{ month: "2026-11", chargedMinor: 100, expectedMinor: 0 }],
		});
		expect(fill(/^November 2026/)!.style.width).toBe("100%");
	});

	test("with nothing charged yet the fill is empty", () => {
		setup({
			rows: [{ month: "2026-11", chargedMinor: 0, expectedMinor: 100 }],
		});
		expect(fill(/^November 2026/)!.style.width).toBe("0%");
	});

	test("a month with nothing charged or expected has an empty track", () => {
		setup({
			rows: [{ month: "2026-11", chargedMinor: 0, expectedMinor: 0 }],
		});
		expect(fill(/^November 2026/)!.style.width).toBe("0%");
	});

	test("the bar says nothing to a screen reader; the month's name does", () => {
		setup();
		expect(track(/^November 2026/)).toHaveAttribute("aria-hidden", "true");
	});

	test("the current month is outlined and bold", () => {
		setup();
		expect(screen.getByRole("option", { name: /^November 2026/ })).toHaveClass(
			"border-ink",
		);
	});

	test("past months have the soft fill", () => {
		setup();
		expect(screen.getByRole("option", { name: /^October 2026/ })).toHaveClass(
			"bg-soft",
		);
	});

	test("while the figures load each month holds the place with a bar, and none shows", () => {
		setup({ isLoading: true });
		const nov = screen.getByRole("option", { name: /^November 2026/ });
		expect(seen(nov)).toBe("Nov");
		expect(nov.querySelector(".bg-track.h-\\[0\\.7em\\]")).not.toBeNull();
	});

	test("with no figures every month shows a dash and is named by the month", () => {
		setup({ rows: undefined });
		expect(options().every((option) => seen(option).endsWith("—"))).toBe(true);
		expect(screen.getByRole("option", { name: "October 2026" })).toBeVisible();
		expect(screen.getByRole("option", { name: "November 2026" })).toBeVisible();
	});

	test("Earlier months and Later months call back", async () => {
		const { onEarlier, onLater, user } = setup();
		await user.click(screen.getByRole("button", { name: "Earlier months" }));
		await user.click(screen.getByRole("button", { name: "Later months" }));
		expect(onEarlier).toHaveBeenCalledOnce();
		expect(onLater).toHaveBeenCalledOnce();
	});

	test("an arrow at the reach is disabled and does nothing", async () => {
		const { onEarlier, onLater, user } = setup({
			canEarlier: false,
			canLater: false,
		});
		const earlier = screen.getByRole("button", { name: "Earlier months" });
		const later = screen.getByRole("button", { name: "Later months" });
		expect(earlier).toHaveAttribute("aria-disabled", "true");
		expect(later).toHaveAttribute("aria-disabled", "true");
		await user.click(earlier);
		await user.click(later);
		expect(onEarlier).not.toHaveBeenCalled();
		expect(onLater).not.toHaveBeenCalled();
	});

	test("one arrow disabled leaves the other working", async () => {
		const { onLater, user } = setup({ canEarlier: false });
		expect(
			screen.getByRole("button", { name: "Later months" }),
		).not.toHaveAttribute("aria-disabled", "true");
		await user.click(screen.getByRole("button", { name: "Later months" }));
		expect(onLater).toHaveBeenCalledOnce();
	});

	test("the grid has a column for each month it is given", () => {
		setup({ count: 5 });
		expect(screen.getByRole("listbox").style.gridTemplateColumns).toBe(
			"repeat(5, minmax(0, 1fr))",
		);
	});
});
