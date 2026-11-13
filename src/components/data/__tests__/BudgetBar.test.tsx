import { render } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { BudgetBar } from "@/components/data/BudgetBar";

/** The bar's parts, by their `data-part`. */
function parts(container: HTMLElement) {
	const bar = container.firstElementChild as HTMLElement;
	const part = (name: string) =>
		bar.querySelector<HTMLElement>(`[data-part="${name}"]`);
	return {
		bar,
		fill: part("fill"),
		over: part("over"),
		limit: part("limit"),
		today: part("today"),
	};
}

const percent = (value: string | undefined) => Number.parseFloat(value ?? "");

describe("hidden from screen readers", () => {
	test("the bar says nothing, so the text beside it carries every figure and the state", () => {
		const { container } = render(<BudgetBar utilizationTenths={1244} />);
		expect(parts(container).bar).toHaveAttribute("aria-hidden", "true");
		expect(parts(container).bar).toHaveTextContent("");
	});
});

describe("the fill and the limit (BR-F04-16)", () => {
	test("the limit tick sits at 62.5% of the track, whatever the spending", () => {
		for (const tenths of [0, 500, 1000, 2148]) {
			const { container, unmount } = render(
				<BudgetBar utilizationTenths={tenths} />,
			);
			expect(parts(container).limit?.style.left).toBe("62.5%");
			unmount();
		}
	});

	test("nothing spent draws an empty track", () => {
		const { container } = render(<BudgetBar utilizationTenths={0} />);
		expect(parts(container).fill).toBeNull();
		expect(parts(container).over).toBeNull();
	});

	// F04 section 5: November food, 8.4%.
	test("8.4% fills 8.4% of the way to the tick", () => {
		const { container } = render(<BudgetBar utilizationTenths={84} />);
		expect(percent(parts(container).fill?.style.width)).toBeCloseTo(5.25, 10);
		expect(parts(container).over).toBeNull();
	});

	// F04 section 5: September shopping, exactly 80.0%.
	test("80.0% fills four fifths of the way", () => {
		const { container } = render(<BudgetBar utilizationTenths={800} />);
		expect(parts(container).fill?.style.width).toBe("50%");
	});

	// F04 section 5: October shopping, exactly 100.0%, At limit.
	test("exactly at the limit fills to the tick with nothing over, still rounded at its end", () => {
		const { container } = render(<BudgetBar utilizationTenths={1000} />);
		const { fill, over } = parts(container);
		expect(fill?.style.width).toBe("62.5%");
		expect(fill).not.toHaveClass("rounded-r-none");
		expect(over).toBeNull();
	});

	test("one tenth over the limit already shows over it", () => {
		const { container } = render(<BudgetBar utilizationTenths={1001} />);
		expect(percent(parts(container).over?.style.width)).toBeCloseTo(0.0625, 10);
	});

	// F04 section 5: October food, 124.4%.
	test("124.4% fills to the tick, then draws the 24.4% over it in the over colour", () => {
		const { container } = render(<BudgetBar utilizationTenths={1244} />);
		const { fill, over } = parts(container);
		expect(fill?.style.width).toBe("62.5%");
		expect(fill).toHaveClass("rounded-r-none");
		expect(over).toHaveClass("bg-neg", "rounded-r-full");
		expect(over?.style.left).toBe("62.5%");
		expect(percent(over?.style.width)).toBeCloseTo(15.25, 10);
	});

	test("exactly 160% reaches the end of the track", () => {
		const { container } = render(<BudgetBar utilizationTenths={1600} />);
		expect(parts(container).over?.style.width).toBe("37.5%");
	});

	// F04 section 5: October entertainment, 214.8%.
	test("past 160% the bar stops at the end of the track", () => {
		const { container } = render(<BudgetBar utilizationTenths={2148} />);
		expect(parts(container).over?.style.width).toBe("37.5%");
	});

	test("a huge utilization still stops at the end", () => {
		const { container } = render(<BudgetBar utilizationTenths={9_999_999} />);
		expect(parts(container).fill?.style.width).toBe("62.5%");
		expect(parts(container).over?.style.width).toBe("37.5%");
	});

	// BR-F04-08: refunds above expenses.
	test("a negative utilization draws an empty track", () => {
		const { container } = render(<BudgetBar utilizationTenths={-120} />);
		expect(parts(container).fill).toBeNull();
		expect(parts(container).over).toBeNull();
		expect(parts(container).limit).not.toBeNull();
	});

	test("the fill, the over part and the tick take their colours", () => {
		const { container } = render(<BudgetBar utilizationTenths={1244} />);
		const { bar, fill, limit } = parts(container);
		expect(bar).toHaveClass("bg-track");
		expect(fill).toHaveClass("bg-bar");
		expect(limit).toHaveClass("bg-ink");
	});
});

describe("today's marker", () => {
	test("is drawn only when given, for the current month", () => {
		const { container } = render(<BudgetBar utilizationTenths={84} />);
		expect(parts(container).today).toBeNull();
	});

	// F04 section 5: day 2 of 30 in November.
	test("day 2 of 30 sits at that share of the way to the limit", () => {
		const { container } = render(
			<BudgetBar
				utilizationTenths={84}
				todayShare={2 / 30}
			/>,
		);
		const { today } = parts(container);
		expect(today).toHaveClass("bg-accent");
		expect(percent(today?.style.left)).toBeCloseTo((2 / 30) * 62.5, 10);
	});

	test.each([
		[0, "0%"],
		[1, "62.5%"],
		[1.5, "62.5%"],
		[-0.5, "0%"],
	])("a share of %s sits at %s, never outside the month", (share, left) => {
		const { container } = render(
			<BudgetBar
				utilizationTenths={84}
				todayShare={share}
			/>,
		);
		expect(parts(container).today?.style.left).toBe(left);
	});
});

describe("look", () => {
	test("8px by default, for a Budget row", () => {
		const { container } = render(<BudgetBar utilizationTenths={500} />);
		expect(parts(container).bar).toHaveClass("h-2", "rounded-full", "w-full");
	});

	test("12px for the overview", () => {
		const { container } = render(
			<BudgetBar
				utilizationTenths={500}
				size="lg"
			/>,
		);
		expect(parts(container).bar).toHaveClass("h-3");
		expect(parts(container).bar).not.toHaveClass("h-2");
	});

	test("takes the caller's classes, which win", () => {
		const { container } = render(
			<BudgetBar
				utilizationTenths={500}
				className="mt-3 h-4"
			/>,
		);
		expect(parts(container).bar).toHaveClass("mt-3", "h-4", "bg-track");
		expect(parts(container).bar).not.toHaveClass("h-2");
	});
});
