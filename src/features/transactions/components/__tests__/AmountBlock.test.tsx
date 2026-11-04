import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	AMOUNT_COMMIT_MS,
	AmountBlock,
	type AmountBlockProps,
} from "../AmountBlock";
import type { FilterLocale } from "../../lib/filter-labels";
import type { AmountBounds } from "../../lib/quick-ranges";

const IN: FilterLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

/** Check B's histogram (F03 section 5): 380.00, 640.00, 2,300.00 and 2,900.00. */
const CHECK_B = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
};

type Options = Partial<AmountBlockProps> & { committed?: boolean };

/** The block over bounds that, like the URL, take what it commits, unless `committed` is
 * false. */
function renderBlock({ committed = true, ...props }: Options = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	let setBounds: (bounds: AmountBounds) => void = () => {};
	function Harness() {
		const [bounds, set] = useState<AmountBounds>(props.bounds ?? {});
		setBounds = set;
		return (
			<AmountBlock
				histogram={CHECK_B}
				isLoading={false}
				count={4}
				locale={IN}
				{...props}
				bounds={bounds}
				onChange={(next) => {
					onChange(next);
					if (committed) set(next);
				}}
			/>
		);
	}
	const view = render(<Harness />);
	return { ...view, user, onChange, setBounds: (b: AmountBounds) => setBounds(b) };
}

const bars = () =>
	Array.from(screen.getByTestId("amountBars").children) as HTMLElement[];
const lit = () => bars().map((bar) => bar.classList.contains("bg-accent"));
const low = () => screen.getByRole("slider", { name: /^Minimum amount/ });
const high = () => screen.getByRole("slider", { name: /^Maximum amount/ });
const min = () => screen.getByRole("textbox", { name: "Min" });
const max = () => screen.getByRole("textbox", { name: "Max" });
const pause = () =>
	new Promise((resolve) => setTimeout(resolve, AMOUNT_COMMIT_MS + 50));

describe("the heading", () => {
	test("reads Amount and the filter's count", () => {
		renderBlock();

		expect(screen.getByText("Amount")).toBeInTheDocument();
		expect(screen.getByText("4 Transactions")).toBeInTheDocument();
	});

	test("reads one Transaction in the singular", () => {
		renderBlock({ count: 1 });

		expect(screen.getByText("1 Transaction")).toBeInTheDocument();
	});

	test("leaves out the count until there is one", () => {
		renderBlock({ count: undefined });

		expect(screen.queryByText(/Transactions?$/)).toBeNull();
	});
});

describe("the histogram (BR-F03-60)", () => {
	test("draws a bar per bucket, hidden from screen readers", () => {
		renderBlock();

		expect(bars()).toHaveLength(10);
		expect(screen.getByTestId("amountBars")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("sizes each bar by its count against the tallest", () => {
		renderBlock({ histogram: { edges: [1, 2, 3, 4], counts: [2, 1, 0] } });

		expect(bars().map((bar) => bar.style.height)).toEqual(["100%", "50%", "0%"]);
		expect(bars()[2]).toHaveClass("min-h-0.5");
	});

	test("without bounds every bar is highlighted", () => {
		renderBlock();

		expect(lit().every(Boolean)).toBe(true);
	});

	test("highlights only the bars between the thumbs", () => {
		renderBlock({ bounds: { minMinor: 40000, maxMinor: 79999 } });

		expect(lit()).toEqual([
			false,
			true,
			true,
			true,
			false,
			false,
			false,
			false,
			false,
			false,
		]);
	});

	test("names the first and last edge under the slider", () => {
		renderBlock();

		const axis = low().closest("[role=group]")!.nextElementSibling!;
		expect(axis).toHaveAttribute("aria-hidden", "true");
		expect(axis).toHaveTextContent("₹315₹3,150");
	});

	test("while it loads shows a placeholder shaped like the bars, track, edges and quick ranges", () => {
		renderBlock({ histogram: undefined, isLoading: true });

		const loading = screen.getByTestId("amountLoading");
		const [bars, track, axis] = Array.from(loading.children);
		expect(bars!.children).toHaveLength(12);
		expect(bars).toHaveClass("h-13");
		expect(track).toHaveClass("h-7");
		expect(axis!.children).toHaveLength(2);
		const chips = screen
			.getByRole("textbox", { name: "Max" })
			.closest(".grid")!.nextElementSibling!;
		expect(chips.children).toHaveLength(3);
		expect(chips.firstElementChild).toHaveClass("h-10", "rounded-full");
	});

	test("while it loads shows no slider", () => {
		renderBlock({ histogram: undefined, isLoading: true });

		expect(screen.queryByTestId("amountBars")).toBeNull();
		expect(screen.queryByRole("slider")).toBeNull();
		expect(min()).toBeInTheDocument();
	});

	test("offline, or not asked for, it shows no bars and no placeholder, only the fields", () => {
		const { container } = renderBlock({ histogram: undefined });

		expect(screen.queryByTestId("amountBars")).toBeNull();
		expect(container.querySelector("[aria-hidden=true].bg-track")).toBeNull();
		expect(max()).toBeInTheDocument();
	});

	test("with no rows it shows no bars, slider or quick ranges", () => {
		renderBlock({ histogram: { edges: [], counts: [] } });

		expect(screen.queryByTestId("amountBars")).toBeNull();
		expect(screen.queryByRole("slider")).toBeNull();
		expect(screen.queryByRole("radiogroup")).toBeNull();
	});
});

/** jsdom lays nothing out, so the track is given a 600px width for the pointer. */
function sizeTrack() {
	const track = low().closest("[data-rac]")!.parentElement as HTMLElement;
	track.getBoundingClientRect = () =>
		({
			left: 0,
			right: 600,
			width: 600,
			top: 0,
			bottom: 28,
			height: 28,
		}) as DOMRect;
}
// React Aria measures a drag by the page position.
const at = (x: number) => ({ clientX: x, pageX: x, clientY: 14, pageY: 14 });

describe("the slider (BR-F03-39, D-539)", () => {
	test("a thumb dragged with the mouse commits its edge when released", async () => {
		const { user, onChange } = renderBlock();
		sizeTrack();

		await user.pointer([
			{
				keys: "[MouseLeft>]",
				target: low().closest<HTMLElement>("[data-rac]")!,
				coords: at(0),
			},
			{ coords: at(130) },
			{ keys: "[/MouseLeft]" },
		]);

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ minMinor: 50000 });
		expect(screen.getByRole("textbox", { name: "Min" })).toHaveValue("500.00");
	});

	test("a press on the track moves the nearer thumb and commits", async () => {
		const { user, onChange } = renderBlock();
		sizeTrack();

		await user.pointer({
			keys: "[MouseLeft]",
			target: low().closest("[data-rac]")!.parentElement!,
			coords: at(545),
		});

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ maxMinor: 249999 });
	});

	test("its thumbs sit on the edges of the bounds and read them as money", () => {
		renderBlock({ bounds: { minMinor: 40000, maxMinor: 79999 } });

		expect(low()).toHaveValue("1");
		expect(low()).toHaveAttribute("aria-valuetext", "₹400");
		expect(high()).toHaveValue("4");
		expect(high()).toHaveAttribute("aria-valuetext", "₹800");
	});

	test("the lower thumb moved commits its edge as min", async () => {
		const { user, onChange } = renderBlock();

		low().focus();
		await user.keyboard("{ArrowRight}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ minMinor: 40000 });
	});

	test("the upper thumb moved commits 1 minor unit below its edge as max", async () => {
		const { user, onChange } = renderBlock();

		high().focus();
		await user.keyboard("{ArrowLeft}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ maxMinor: 249999 });
	});

	test("a thumb moved back to its end drops that bound", async () => {
		const { user, onChange } = renderBlock({ bounds: { minMinor: 40000 } });

		low().focus();
		await user.keyboard("{Home}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith({});
	});

	test("shows a move the caller has not committed in the bars", async () => {
		const { user } = renderBlock({ committed: false });

		low().focus();
		await user.keyboard("{ArrowRight}{ArrowRight}");

		expect(lit().slice(0, 3)).toEqual([false, false, true]);
	});

	test("bounds set from elsewhere move the thumbs and the bars", () => {
		const { setBounds } = renderBlock();

		act(() => setBounds({ minMinor: 200000 }));

		expect(low()).toHaveValue("8");
		expect(lit()).toEqual([...Array(8).fill(false), true, true]);
	});

	test("bounds set from elsewhere drop a move not yet committed", async () => {
		const { user, setBounds } = renderBlock({ committed: false });

		low().focus();
		await user.keyboard("{ArrowRight}{ArrowRight}");
		act(() => setBounds({ maxMinor: 79999 }));

		expect(low()).toHaveValue("0");
		expect(lit().slice(0, 5)).toEqual([true, true, true, true, false]);
	});
});

describe("Min and Max (BR-F03-39, BR-F03-04)", () => {
	test("show the committed bounds in the user's format, Any when open", () => {
		renderBlock({ bounds: { minMinor: 10000000 } });

		expect(min()).toHaveValue("1,00,000.00");
		expect(max()).toHaveValue("");
		expect(max()).toHaveAttribute("placeholder", "Any");
	});

	test("commit 300 ms after typing stops, not at each key", async () => {
		const { user, onChange } = renderBlock();

		await user.type(min(), "1,000");
		expect(onChange).not.toHaveBeenCalled();
		await waitFor(() => expect(onChange).toHaveBeenCalled());

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ minMinor: 100000 });
	});

	test("a Max commits with the Min kept", async () => {
		const { user, onChange } = renderBlock({ bounds: { minMinor: 40000 } });

		await user.type(max(), "799.99");
		await waitFor(() => expect(onChange).toHaveBeenCalled());

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			minMinor: 40000,
			maxMinor: 79999,
		});
	});

	test("an emptied field drops its bound", async () => {
		const { user, onChange } = renderBlock({
			bounds: { minMinor: 40000, maxMinor: 79999 },
		});

		await user.clear(min());
		await waitFor(() => expect(onChange).toHaveBeenCalled());

		expect(onChange).toHaveBeenCalledExactlyOnceWith({ maxMinor: 79999 });
	});

	test("an amount that does not read gives the entry field's message and commits nothing", async () => {
		const { user, onChange } = renderBlock();

		await user.type(min(), "12a");
		await pause();

		expect(onChange).not.toHaveBeenCalled();
		expect(
			screen.getByText("Enter a number, like 1,240.50."),
		).toBeInTheDocument();
		expect(min()).toHaveAttribute("aria-invalid", "true");
	});

	test("too many decimals and zero give their messages", async () => {
		const { user, onChange } = renderBlock();

		await user.type(min(), "1.234");
		await user.type(max(), "0");
		await pause();

		expect(onChange).not.toHaveBeenCalled();
		expect(
			screen.getByText("Use at most 2 decimal places."),
		).toBeInTheDocument();
		expect(screen.getByText("Enter an amount above zero.")).toBeInTheDocument();
	});

	// D-543
	// AC-F03-68
	test("a Min above Max says so under Min and commits nothing", async () => {
		const { user, onChange } = renderBlock({ bounds: { maxMinor: 79999 } });

		await user.type(min(), "900");
		await pause();

		expect(onChange).not.toHaveBeenCalled();
		expect(
			screen.getByText("Choose a Min at or below Max."),
		).toBeInTheDocument();
	});

	test("a Min equal to Max is a range of one amount", async () => {
		const { user, onChange } = renderBlock();

		await user.type(min(), "649");
		await user.type(max(), "649");
		await waitFor(() => expect(onChange).toHaveBeenCalled());

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			minMinor: 64900,
			maxMinor: 64900,
		});
	});

	test("typing again clears the field's message", async () => {
		const { user } = renderBlock();

		await user.type(min(), "12a");
		await pause();
		await user.type(min(), "{Backspace}");

		expect(screen.queryByText("Enter a number, like 1,240.50.")).toBeNull();
	});

	test("the same bounds as the committed ones commit nothing", async () => {
		const { user, onChange } = renderBlock({ bounds: { minMinor: 40000 } });

		await user.clear(min());
		await user.type(min(), "400");
		await pause();

		expect(onChange).not.toHaveBeenCalled();
	});

	test("bounds set from elsewhere replace the typed text and its message", async () => {
		const { user, setBounds } = renderBlock();

		await user.type(min(), "12a");
		await pause();
		act(() => setBounds({ minMinor: 250000 }));

		await waitFor(() => expect(min()).toHaveValue("2,500.00"));
		expect(screen.queryByText("Enter a number, like 1,240.50.")).toBeNull();
	});

	test("read in the profile's number format", async () => {
		const { user, onChange } = renderBlock({
			locale: { ...IN, numberLocale: "de-DE-u-nu-latn", currency: "EUR" },
			bounds: { minMinor: 124050 },
		});

		expect(min()).toHaveValue("1.240,50");
		await user.type(max(), "2.000,5");
		await waitFor(() => expect(onChange).toHaveBeenCalled());

		expect(onChange).toHaveBeenCalledExactlyOnceWith({
			minMinor: 124050,
			maxMinor: 200050,
		});
	});
});

describe("quick ranges (BR-F03-74)", () => {
	// AC-F03-59
	test("offers check B's four ranges under their names", () => {
		renderBlock();

		const group = screen.getByRole("radiogroup", { name: "Quick ranges" });
		expect(
			within(group)
				.getAllByRole("radio")
				.map((each) => each.textContent),
		).toEqual([
			"Under ₹400",
			"₹400 to ₹800",
			"₹800 to ₹2,500",
			"₹2,500 and over",
		]);
	});

	test.each([
		["Under ₹400", { maxMinor: 39999 }],
		["₹400 to ₹800", { minMinor: 40000, maxMinor: 79999 }],
		["₹800 to ₹2,500", { minMinor: 80000, maxMinor: 249999 }],
		["₹2,500 and over", { minMinor: 250000 }],
	])("%s commits its bounds at once", async (name, bounds) => {
		const { user, onChange } = renderBlock();

		await user.click(screen.getByRole("radio", { name }));

		expect(onChange).toHaveBeenCalledExactlyOnceWith(bounds);
	});

	test("marks the range the bounds equal", () => {
		renderBlock({ bounds: { minMinor: 80000, maxMinor: 249999 } });

		expect(screen.getByRole("radio", { name: "₹800 to ₹2,500" })).toBeChecked();
		expect(screen.getByRole("radio", { name: "Under ₹400" })).not.toBeChecked();
	});

	test("marks none when the bounds are no quick range", () => {
		renderBlock({ bounds: { minMinor: 50000 } });

		expect(
			screen
				.getAllByRole("radio")
				.filter((each) => (each as HTMLInputElement).checked),
		).toHaveLength(0);
	});

	test("a chosen range moves the thumbs and fills Min and Max", async () => {
		const { user } = renderBlock();

		await user.click(screen.getByRole("radio", { name: "₹400 to ₹800" }));

		expect(low()).toHaveValue("1");
		expect(high()).toHaveValue("4");
		expect(min()).toHaveValue("400.00");
		expect(max()).toHaveValue("799.99");
	});

	test("none show with fewer than 4 rows", () => {
		renderBlock({
			histogram: { edges: [31500, 40000, 50000, 63000], counts: [1, 1, 1] },
		});

		expect(
			screen.queryByRole("radiogroup", { name: "Quick ranges" }),
		).toBeNull();
	});
});
