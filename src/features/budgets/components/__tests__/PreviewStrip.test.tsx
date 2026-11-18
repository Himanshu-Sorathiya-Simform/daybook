import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import type { BudgetChange } from "@/lib/budgets/preview";
import { goldenPreview } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import { PreviewStrip, type PreviewStripProps } from "../PreviewStrip";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

// F04 section 5, a long change: shopping at 4,000.00 from November 2023, 37 months.
const LONG: BudgetChange = { scope: "from", month: "2023-11", limitMinor: 400000 };
const LONG_MONTHS = goldenPreview("shopping", LONG).months;

// Food at 1,000.00 from June: six months, September to November spending past it.
const OVER: BudgetChange = { scope: "from", month: "2026-06", limitMinor: 100000 };
const OVER_MONTHS = goldenPreview("food", OVER).months;

// Seven months with a limit that stops in May: no new limit in any of them.
const STOPPED_MONTHS = goldenPreview(
	"food",
	{ scope: "from", month: "2026-05", limitMinor: null },
	{ schedule: [{ from: "2026-01", limitMinor: 100000 }], overrides: [] },
).months;

function renderStrip(props: Partial<PreviewStripProps> = {}) {
	return render(
		<PreviewStrip
			months={LONG_MONTHS}
			highlight={null}
			formats={IN}
			{...props}
		/>,
	);
}

const num = (element: Element, attribute: string) =>
	Number.parseFloat(element.getAttribute(attribute) as string);
const part = (container: HTMLElement, month: string, name: string) =>
	container.querySelector(`[data-month="${month}"] [data-part="${name}"]`);

describe("PreviewStrip (BR-F04-26)", () => {
	test("is hidden from screen readers, the table beside it saying the same", () => {
		const { container } = renderStrip();
		expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
	});

	test("has one column per month and one dashed column for every month after", () => {
		const { container } = renderStrip();
		expect(container.querySelectorAll("[data-month]")).toHaveLength(37);
		const onward = container.querySelector('[data-part="onward"]')!;
		expect(onward).toHaveAttribute("stroke-dasharray");
		// It sits after the last month's slot.
		expect(num(onward, "x")).toBeGreaterThan((36 / 38) * 100);
	});

	test("captions the columns and the tick", () => {
		const { container } = renderStrip();
		expect(container).toHaveTextContent(
			"One column per month: spending against the new limit. Black tick: the old limit.",
		);
	});

	test("a month's spending is a bar as tall as its share of the new limit", () => {
		const { container } = renderStrip();
		// September 2026: 2,400.00 of 4,000.00 is 60%, on a track that ends at 160%.
		const spent = part(container, "2026-09", "spent")!;
		expect(num(spent, "height")).toBeCloseTo((0.6 / 1.6) * 100);
		expect(num(spent, "y")).toBeCloseTo(100 - (0.6 / 1.6) * 100);
		expect(spent).toHaveClass("fill-bar");
		expect(part(container, "2026-09", "over")).toBeNull();
	});

	test("the old limit is a tick at its share of the new one", () => {
		const { container } = renderStrip();
		// 3,000.00 of 4,000.00.
		const tick = part(container, "2026-09", "tick")!;
		expect(num(tick, "y1")).toBeCloseTo(100 - (0.75 / 1.6) * 100);
		expect(tick).toHaveClass("stroke-ink");
	});

	test("months with no old limit and no spending draw nothing", () => {
		const { container } = renderStrip();
		for (const month of ["2023-11", "2025-06"]) {
			expect(part(container, month, "tick")).toBeNull();
			expect(part(container, month, "spent")).toBeNull();
			expect(part(container, month, "over")).toBeNull();
			expect(part(container, month, "no-budget")).toBeNull();
		}
	});

	test("spending past the limit is drawn over it in the over colour", () => {
		const { container } = renderStrip({ months: OVER_MONTHS });
		// October: 6,220.00 of 1,000.00 passes the cap, so the bar fills the track.
		const spent = part(container, "2026-10", "spent")!;
		const over = part(container, "2026-10", "over")!;
		expect(num(spent, "height")).toBeCloseTo((1 / 1.6) * 100);
		expect(over).toHaveClass("fill-neg");
		expect(num(over, "y")).toBeCloseTo(0);
		expect(num(over, "height")).toBeCloseTo((1 - 1 / 1.6) * 100);
	});

	test("spending between the limit and the cap stops where it is", () => {
		const { container } = renderStrip({ months: OVER_MONTHS });
		// June to August spend nothing; no over bar there.
		expect(part(container, "2026-06", "over")).toBeNull();
	});

	test("a month with no new limit is a dashed empty column and has no tick", () => {
		const { container } = renderStrip({ months: STOPPED_MONTHS });
		const empty = part(container, "2026-06", "no-budget")!;
		expect(empty).toHaveAttribute("stroke-dasharray");
		expect(part(container, "2026-06", "tick")).toBeNull();
		expect(part(container, "2026-06", "spent")).toBeNull();
	});

	test("tints the months of the row under the pointer", () => {
		const { container } = renderStrip({
			highlight: { first: "2026-09", last: "2026-10" },
		});
		const tinted = [
			...container.querySelectorAll('[data-part="highlight"]'),
		].map((each) => each.closest("[data-month]")?.getAttribute("data-month"));
		expect(tinted).toEqual(["2026-09", "2026-10"]);
		expect(part(container, "2026-09", "highlight")).toHaveClass(
			"fill-accent-soft",
		);
	});

	test("tints nothing without a row under the pointer", () => {
		const { container } = renderStrip();
		expect(container.querySelector('[data-part="highlight"]')).toBeNull();
	});

	test("while the spending loads it draws no bars, but keeps the ticks", () => {
		const { container } = renderStrip({ isLoading: true });
		expect(container.querySelector('[data-part="spent"]')).toBeNull();
		expect(container.querySelector('[data-part="over"]')).toBeNull();
		expect(part(container, "2026-09", "tick")).not.toBeNull();
	});
});

describe("the month names under the columns", () => {
	test("up to 14 months, each is the month's first letter", () => {
		const { container } = renderStrip({ months: STOPPED_MONTHS });
		const names = [...container.querySelectorAll(".text-axis span")].map(
			(each) => each.textContent,
		);
		// May to November, then the arrow for every month after.
		expect(names).toEqual(["M", "J", "J", "A", "S", "O", "N", "→"]);
	});

	test("with more, the year shows at the start and each January", () => {
		const { container } = renderStrip();
		const names = [...container.querySelectorAll(".text-axis span")].map(
			(each) => each.textContent,
		);
		expect(names).toHaveLength(38);
		expect(names.filter(Boolean)).toEqual(["’23", "’24", "’25", "’26", "→"]);
		expect(names[0]).toBe("’23");
		// November 2023 is first, so January 2024 is the third column.
		expect(names[2]).toBe("’24");
	});

	test("a strip of 15 months already shows years instead of letters", () => {
		const months = LONG_MONTHS.slice(-15);
		const { container } = renderStrip({ months });
		const names = [...container.querySelectorAll(".text-axis span")].map(
			(each) => each.textContent,
		);
		expect(names[0]).toBe("’25");
	});

	test("14 months still show letters", () => {
		const { container } = renderStrip({ months: LONG_MONTHS.slice(-14) });
		expect(container.querySelector(".text-axis span")).toHaveTextContent(
			/^[A-Z]$/,
		);
	});
});

describe("a crowded strip", () => {
	test("more than 24 months narrow the gaps so the bars stay wide", () => {
		const wide = renderStrip({ months: LONG_MONTHS.slice(-24) });
		const crowded = renderStrip({ months: LONG_MONTHS.slice(-25) });
		const sizeOf = (view: ReturnType<typeof renderStrip>, count: number) =>
			num(
				view.container.querySelector(
					`[data-month="2026-09"] [data-part="spent"]`,
				)!,
				"width",
			) * count;
		// A bar fills 75% of its slot up to 24 months, and 90% past it.
		expect(sizeOf(wide, 25)).toBeCloseTo(75, 0);
		expect(sizeOf(crowded, 26)).toBeCloseTo(90, 0);
	});
});

describe("PreviewStrip's root", () => {
	test("takes a className", () => {
		const { container } = renderStrip({ className: "extra" });
		expect(container.firstElementChild).toHaveClass("extra");
	});
});
