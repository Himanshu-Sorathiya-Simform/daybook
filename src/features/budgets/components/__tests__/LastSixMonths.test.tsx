import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import { historyAnswer } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import { LastSixMonths, type LastSixMonthsProps } from "../LastSixMonths";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

// F04 section 5: food to November, June to August with no limit and nothing spent.
const FOOD = historyAnswer("food", "2026-11").months;

function renderChart(props: Partial<LastSixMonthsProps> = {}) {
	const view = render(
		<LastSixMonths
			months={FOOD}
			month="2026-11"
			formats={IN}
			{...props}
		/>,
	);
	return { ...view, user: userEvent.setup() };
}

const chart = () => screen.getByRole("img");
const partsOf = (month: string, part: string) =>
	chart().querySelectorAll(`[data-month="${month}"] [data-part="${part}"]`);
const share = (element: Element, attribute: string) =>
	Number.parseFloat(element.getAttribute(attribute) as string);

describe("LastSixMonths (BR-F04-30)", () => {
	test("is a section named Last 6 months", () => {
		renderChart();
		expect(screen.getByRole("region", { name: "Last 6 months" })).toBeVisible();
		expect(
			screen.getByRole("heading", { level: 3, name: "Last 6 months" }),
		).toBeVisible();
	});

	test("the chart reads each month's figures as text", () => {
		renderChart();
		expect(chart()).toHaveAccessibleName(
			"Spent by month: Jun 2026 ₹0.00, no limit; Jul 2026 ₹0.00, no limit; Aug 2026 ₹0.00, no limit; Sept 2026 ₹5,050.00 of ₹6,000.00; Oct 2026 ₹6,220.00 of ₹5,000.00; Nov 2026 ₹420.00 of ₹5,000.00",
		);
	});

	test("the month names under it, the viewed month bold", () => {
		const { container } = renderChart({ month: "2026-10" });
		const names = container.querySelector('[aria-hidden="true"]') as HTMLElement;
		expect(Array.from(names.children, (each) => each.textContent)).toEqual([
			"Jun",
			"Jul",
			"Aug",
			"Sept",
			"Oct",
			"Nov",
		]);
		expect(within(names).getByText("Oct")).toHaveClass("font-bold", "text-ink");
		expect(within(names).getByText("Nov")).not.toHaveClass("font-bold");
	});

	test("a month with no spending draws no bar, and one with no limit no line", () => {
		renderChart();
		expect(partsOf("2026-06", "spent")).toHaveLength(0);
		expect(partsOf("2026-06", "limit")).toHaveLength(0);
		expect(partsOf("2026-06", "over")).toHaveLength(0);
	});

	test("within its limit: one bar and a dashed line at the limit", () => {
		renderChart();
		expect(partsOf("2026-09", "spent")).toHaveLength(1);
		expect(partsOf("2026-09", "over")).toHaveLength(0);
		const [line] = partsOf("2026-09", "limit");
		expect(line).toHaveAttribute("stroke-dasharray", "4 3");
		expect(line).toHaveClass("stroke-ink");
	});

	test("over its limit: the bar stops at the line and the rest is in the over colour", () => {
		renderChart();
		// The tallest figure, October's 6,220.00, with 12% headroom, is the chart's top.
		const top = 622000 * 1.12;
		const [within] = partsOf("2026-10", "spent");
		const [over] = partsOf("2026-10", "over");
		const [line] = partsOf("2026-10", "limit");
		expect(share(within as Element, "height")).toBeCloseTo((500000 / top) * 100);
		expect(share(within as Element, "y")).toBeCloseTo((1 - 500000 / top) * 100);
		expect(over).toHaveClass("fill-neg");
		expect(share(over as Element, "height")).toBeCloseTo((122000 / top) * 100);
		expect(share(over as Element, "y")).toBeCloseTo((1 - 622000 / top) * 100);
		expect(share(line as Element, "y1")).toBeCloseTo((1 - 500000 / top) * 100);
		expect(share(line as Element, "y2")).toBeCloseTo((1 - 500000 / top) * 100);
	});

	test("each month has its slot: bars are 60% of it, centred, and lines 80%", () => {
		renderChart();
		const [bar] = partsOf("2026-11", "spent");
		const [line] = partsOf("2026-11", "limit");
		expect(share(bar as Element, "x")).toBeCloseTo((5.2 / 6) * 100);
		expect(share(bar as Element, "width")).toBeCloseTo((0.6 / 6) * 100);
		expect(share(line as Element, "x1")).toBeCloseTo((5.1 / 6) * 100);
		expect(share(line as Element, "x2")).toBeCloseTo((5.9 / 6) * 100);
	});

	test("the viewed month's bar is full colour, the others lighter", () => {
		renderChart({ month: "2026-10" });
		expect(partsOf("2026-10", "spent")[0]).not.toHaveClass("opacity-55");
		expect(partsOf("2026-09", "spent")[0]).toHaveClass("fill-bar", "opacity-55");
	});

	test("refunds above spending draw no bar", () => {
		renderChart({
			months: [{ month: "2026-10", limitMinor: 100000, spentMinor: -5000 }],
			month: "2026-10",
		});
		expect(partsOf("2026-10", "spent")).toHaveLength(0);
		expect(partsOf("2026-10", "over")).toHaveLength(0);
	});

	test("the caption shows when any month has a limit", () => {
		renderChart();
		expect(
			screen.getByText(
				"Dashed line: the limit in force that month. Red: spent above it.",
			),
		).toBeVisible();
	});

	test("no caption when no month has a limit: health, with no Budget record", () => {
		renderChart({ months: historyAnswer("health", "2026-10").months });
		expect(screen.queryByText(/^Dashed line/)).not.toBeInTheDocument();
	});

	test("an empty history draws nothing and does not fail", () => {
		renderChart({ months: [] });
		expect(chart().querySelectorAll("rect, line")).toHaveLength(0);
	});

	test("View as table shows Month, Limit, Spent and Used, and View as chart goes back", async () => {
		const { user } = renderChart({ month: "2026-10" });
		await user.click(screen.getByRole("button", { name: "View as table" }));
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
		const table = screen.getByRole("table");
		expect(
			within(table)
				.getAllByRole("columnheader")
				.map((each) => each.textContent),
		).toEqual(["Month", "Limit", "Spent", "Used"]);
		const rows = within(table).getAllByRole("row").slice(1);
		expect(rows.map((row) => row.textContent)).toEqual([
			"Jun 2026No Budget₹0.00—",
			"Jul 2026No Budget₹0.00—",
			"Aug 2026No Budget₹0.00—",
			"Sept 2026₹6,000.00₹5,050.0084.2%",
			"Oct 2026₹5,000.00₹6,220.00124.4%",
			"Nov 2026₹5,000.00₹420.008.4%",
		]);
		expect(rows[4]).toHaveClass("font-bold");
		expect(rows[3]).not.toHaveClass("font-bold");
		// A month's name is a row heading, which takes the row's weight, not a heading's bold.
		expect(
			within(rows[3] as HTMLElement).getByRole("rowheader", {
				name: "Sept 2026",
			}),
		).toHaveClass("[font-weight:inherit]");
		expect(
			within(rows[4] as HTMLElement).getByRole("rowheader", {
				name: "Oct 2026",
			}),
		).toBeVisible();
		await user.click(screen.getByRole("button", { name: "View as chart" }));
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
		expect(chart()).toBeVisible();
	});

	describe("while the months load (D-571)", () => {
		test("the heading, the switch and the month names show, with skeleton bars placed like the real ones", () => {
			renderChart({ months: undefined, month: "2026-10" });
			const region = screen.getByRole("region", { name: "Last 6 months" });
			expect(region).toHaveAttribute("aria-busy", "true");
			expect(screen.queryByRole("img")).not.toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "View as table" }),
			).toBeVisible();
			const names = region.querySelector(
				'[aria-hidden="true"].flex',
			) as HTMLElement;
			expect(Array.from(names.children, (each) => each.textContent)).toEqual([
				"May",
				"Jun",
				"Jul",
				"Aug",
				"Sept",
				"Oct",
			]);
			expect(within(names).getByText("Oct")).toHaveClass("font-bold");
			const bars = Array.from(
				region.querySelectorAll<HTMLElement>('[data-part="skeleton-bar"]'),
			);
			expect(bars).toHaveLength(6);
			expect(Number.parseFloat(bars[5]?.style.left as string)).toBeCloseTo(
				(5.2 / 6) * 100,
			);
			expect(Number.parseFloat(bars[5]?.style.width as string)).toBeCloseTo(
				(0.6 / 6) * 100,
			);
			expect(bars[0]?.style.height).toBe("35%");
			expect(region.querySelector('[data-part="skeleton-chart"]')).toHaveClass(
				"h-23",
				"border-b",
			);
		});

		test("the caption holds its place only when limits are expected", () => {
			const { rerender } = renderChart({ months: undefined });
			expect(screen.queryByText(/^Dashed line/)).not.toBeInTheDocument();
			rerender(
				<LastSixMonths
					months={undefined}
					month="2026-11"
					expectsLimits
					formats={IN}
				/>,
			);
			expect(screen.getByText(/^Dashed line/)).toBeVisible();
		});

		test("once loaded, the caption follows the months, not the expectation", () => {
			renderChart({
				months: historyAnswer("health", "2026-10").months,
				expectsLimits: true,
			});
			expect(screen.queryByText(/^Dashed line/)).not.toBeInTheDocument();
		});

		test("as a table: each month's row with skeleton cells", async () => {
			const { user } = renderChart({ months: undefined, month: "2026-10" });
			await user.click(screen.getByRole("button", { name: "View as table" }));
			const rows = within(screen.getByRole("table"))
				.getAllByRole("row")
				.slice(1);
			expect(rows.map((row) => row.textContent)).toEqual([
				"May 2026",
				"Jun 2026",
				"Jul 2026",
				"Aug 2026",
				"Sept 2026",
				"Oct 2026",
			]);
			expect(rows[5]).toHaveClass("font-bold");
			expect(
				within(rows[0] as HTMLElement)
					.getAllByRole("cell")
					.map((cell) => cell.querySelector(".bg-track") !== null),
			).toEqual([true, true, true]);
		});
	});

	test("takes the caller's classes", () => {
		renderChart({ className: "mt-2" });
		expect(screen.getByRole("region", { name: "Last 6 months" })).toHaveClass(
			"flex",
			"mt-2",
		);
	});
});
