import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";

import {
	RangeSlider,
	type RangeSliderProps,
	type SliderRange,
} from "@/components/forms/RangeSlider";

/** Amount stops in rupees, as a histogram's edges might fall (BR-F03-60). */
const EDGES = [0, 100, 500, 1_000, 5_000, 10_000, 100_000];
const rupees = (stop: number) => `₹${EDGES[stop]!.toLocaleString("en-IN")}`;

type Options = Partial<RangeSliderProps> & { committed?: boolean };

/** The Amount slider over seven stops. The caller commits what the slider reports, as the
 * filter's URL would, unless `committed` is false. */
function renderSlider({ committed = true, ...props }: Options = {}) {
	const user = userEvent.setup();
	const onChange = vi.fn();
	const onChangeEnd = vi.fn();
	function Harness() {
		const [value, setValue] = useState<SliderRange>(props.value ?? [0, 6]);
		return (
			<RangeSlider
				label="Amount"
				thumbLabels={["Minimum amount", "Maximum amount"]}
				stops={EDGES.length}
				valueText={rupees}
				onChange={onChange}
				{...props}
				value={value}
				onChangeEnd={(next) => {
					onChangeEnd(next);
					if (committed) setValue(next);
				}}
			/>
		);
	}
	const view = render(<Harness />);
	return { ...view, user, onChange, onChangeEnd };
}

// Each thumb is named by its own label and the slider's: "Minimum amount Amount".
const low = () => screen.getByRole("slider", { name: /^Minimum amount/ });
const high = () => screen.getByRole("slider", { name: /^Maximum amount/ });
const fill = () =>
	screen
		.getByRole("group", { name: "Amount" })
		.querySelector<HTMLElement>(".bg-accent")!;

/** jsdom lays nothing out, so the track is given a 600px width for presses on it. */
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
	return track;
}

describe("showing a range", () => {
	test("is a group named by its label, with two named thumbs", () => {
		renderSlider();

		expect(screen.getByRole("group", { name: "Amount" })).toBeInTheDocument();
		expect(low()).toBeInTheDocument();
		expect(high()).toBeInTheDocument();
	});

	// AC-F03-66
	test("each thumb's value is its stop, read out as what the stop means", () => {
		renderSlider({ value: [1, 4] });

		expect(low()).toHaveValue("1");
		expect(low()).toHaveAttribute("aria-valuetext", "₹100");
		expect(high()).toHaveValue("4");
		expect(high()).toHaveAttribute("aria-valuetext", "₹5,000");
	});

	test("each thumb can go only as far as the other", () => {
		renderSlider({ value: [1, 4] });

		expect(low()).toHaveAttribute("min", "0");
		expect(low()).toHaveAttribute("max", "4");
		expect(high()).toHaveAttribute("min", "1");
		expect(high()).toHaveAttribute("max", "6");
	});

	test("fills the track between the thumbs", () => {
		renderSlider({ value: [3, 6] });
		expect(fill().style.left).toBe("50%");
		expect(fill().style.right).toBe("0%");
		cleanup();

		renderSlider({ value: [0, 3] });
		expect(fill().style.left).toBe("0%");
		expect(fill().style.right).toBe("50%");
	});

	test("places each thumb at its stop along the track", () => {
		renderSlider({ value: [3, 6] });

		expect(low().closest<HTMLElement>("[data-rac]")!.style.left).toBe("50%");
		expect(high().closest<HTMLElement>("[data-rac]")!.style.left).toBe("100%");
	});

	test("gives each thumb a 44px touch area on phones", () => {
		renderSlider();

		expect(low().closest("[data-rac]")).toHaveClass("max-md:after:-inset-3");
	});

	test("puts the caller's classes on the root, after its own", () => {
		renderSlider({ className: "mt-1" });

		expect(screen.getByRole("group", { name: "Amount" })).toHaveClass(
			"flex",
			"mt-1",
		);
	});
});

describe("the keyboard", () => {
	test("Arrow Right moves the focused thumb one stop, previewed and committed", async () => {
		const { user, onChange, onChangeEnd } = renderSlider();

		await user.tab();
		expect(low()).toHaveFocus();
		await user.keyboard("{ArrowRight}");

		expect(onChange).toHaveBeenCalledExactlyOnceWith([1, 6]);
		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([1, 6]);
		expect(low()).toHaveAttribute("aria-valuetext", "₹100");
	});

	test("Arrow Left on the upper thumb moves it down one stop", async () => {
		const { user, onChangeEnd } = renderSlider();

		await user.tab();
		await user.tab();
		expect(high()).toHaveFocus();
		await user.keyboard("{ArrowLeft}");

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([0, 5]);
	});

	test("Arrow Up and Down move a thumb too", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [2, 4] });

		low().focus();
		await user.keyboard("{ArrowUp}");
		expect(onChangeEnd).toHaveBeenLastCalledWith([3, 4]);
		await user.keyboard("{ArrowDown}");
		expect(onChangeEnd).toHaveBeenLastCalledWith([2, 4]);
	});

	test("Home moves the lower thumb to the first stop", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [3, 5] });

		low().focus();
		await user.keyboard("{Home}");

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([0, 5]);
	});

	test("End moves the upper thumb to the last stop", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [3, 5] });

		high().focus();
		await user.keyboard("{End}");

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([3, 6]);
	});

	// AC-F03-66
	test("End on the lower thumb stops a stop short of the upper one", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [0, 5] });

		low().focus();
		await user.keyboard("{End}");

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([4, 5]);
		expect(low()).toHaveValue("4");
	});

	test("Home on the upper thumb stops a stop short of the lower one", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [2, 6] });

		high().focus();
		await user.keyboard("{Home}");

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([2, 3]);
	});

	test("a thumb next to the other does not move into it, and reports nothing", async () => {
		const { user, onChange, onChangeEnd } = renderSlider({ value: [3, 4] });

		low().focus();
		await user.keyboard("{ArrowRight}");
		high().focus();
		await user.keyboard("{ArrowLeft}");

		expect(onChange).not.toHaveBeenCalled();
		expect(onChangeEnd).not.toHaveBeenCalled();
		expect(low()).toHaveValue("3");
		expect(high()).toHaveValue("4");
	});

	test("a thumb at the end of the track reports nothing when pushed further", async () => {
		const { user, onChangeEnd } = renderSlider();

		low().focus();
		await user.keyboard("{ArrowLeft}{Home}");
		high().focus();
		await user.keyboard("{ArrowRight}{End}");

		expect(onChangeEnd).not.toHaveBeenCalled();
	});

	test("with two stops neither thumb can move", async () => {
		const { user, onChangeEnd } = renderSlider({ stops: 2, value: [0, 1] });

		low().focus();
		await user.keyboard("{ArrowRight}{End}");
		high().focus();
		await user.keyboard("{ArrowLeft}{Home}");

		expect(onChangeEnd).not.toHaveBeenCalled();
	});

	test("Tab moves from the lower thumb to the upper, then out", async () => {
		renderSlider();
		const user = userEvent.setup();

		await user.tab();
		expect(low()).toHaveFocus();
		await user.tab();
		expect(high()).toHaveFocus();
		await user.tab();
		expect(document.body).toHaveFocus();
	});
});

describe("pressing the track", () => {
	test("moves the nearer thumb to the stop under the press and commits on release", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [1, 5] });
		const track = sizeTrack();

		await user.pointer({
			keys: "[MouseLeft]",
			target: track,
			coords: { clientX: 410, clientY: 14 },
		});

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([1, 4]);
	});

	test("a press near the start moves the lower thumb", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [2, 5] });
		const track = sizeTrack();

		await user.pointer({
			keys: "[MouseLeft]",
			target: track,
			coords: { clientX: 5, clientY: 14 },
		});

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([0, 5]);
	});
});

describe("dragging a thumb", () => {
	const thumb = (input: HTMLElement) => input.closest<HTMLElement>("[data-rac]")!;
	// React Aria measures a drag by the page position.
	const at = (x: number) => ({ clientX: x, pageX: x, clientY: 14, pageY: 14 });

	test("previews each stop while dragging and commits once, on release", async () => {
		const { user, onChange, onChangeEnd } = renderSlider({ value: [0, 6] });
		sizeTrack();

		await user.pointer([
			{ keys: "[MouseLeft>]", target: thumb(low()), coords: at(0) },
			{ coords: at(100) },
			{ coords: at(200) },
		]);
		expect(onChange).toHaveBeenLastCalledWith([2, 6]);
		expect(onChangeEnd).not.toHaveBeenCalled();
		expect(low()).toHaveValue("2");
		await user.pointer({ keys: "[/MouseLeft]" });

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([2, 6]);
	});

	test("a thumb dragged past the other stops a stop short of it", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [0, 3] });
		sizeTrack();

		await user.pointer([
			{ keys: "[MouseLeft>]", target: thumb(low()), coords: at(0) },
			{ coords: at(550) },
			{ keys: "[/MouseLeft]" },
		]);

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([2, 3]);
		expect(low()).toHaveValue("2");
		expect(high()).toHaveValue("3");
	});

	test("the upper thumb dragged below the lower stops a stop above it", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [3, 6] });
		sizeTrack();

		await user.pointer([
			{
				keys: "[MouseLeft>]",
				target: thumb(high()),
				coords: at(600),
			},
			{ coords: at(10) },
			{ keys: "[/MouseLeft]" },
		]);

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([3, 4]);
	});

	test("a drag that ends where it began commits nothing", async () => {
		const { user, onChangeEnd } = renderSlider({ value: [2, 6] });
		sizeTrack();

		await user.pointer([
			{ keys: "[MouseLeft>]", target: thumb(low()), coords: at(200) },
			{ coords: at(300) },
			{ coords: at(200) },
			{ keys: "[/MouseLeft]" },
		]);

		expect(onChangeEnd).not.toHaveBeenCalled();
	});
});

describe("previewing and committing", () => {
	test("works without a preview handler", async () => {
		const user = userEvent.setup();
		const onChangeEnd = vi.fn();
		render(
			<RangeSlider
				label="Amount"
				thumbLabels={["Minimum amount", "Maximum amount"]}
				stops={7}
				value={[0, 6]}
				valueText={rupees}
				onChangeEnd={onChangeEnd}
			/>,
		);

		low().focus();
		await user.keyboard("{ArrowRight}");

		expect(onChangeEnd).toHaveBeenCalledExactlyOnceWith([1, 6]);
	});

	test("shows the moved thumb even before the caller commits it", async () => {
		const { user } = renderSlider({ committed: false });

		low().focus();
		await user.keyboard("{ArrowRight}{ArrowRight}");

		expect(low()).toHaveValue("2");
		expect(low()).toHaveAttribute("aria-valuetext", "₹500");
	});

	// AC-F03-66
	test("a range the caller already holds is not committed again", async () => {
		const { user, onChangeEnd } = renderSlider({
			committed: false,
			value: [0, 6],
		});

		low().focus();
		await user.keyboard("{ArrowRight}{ArrowLeft}");

		expect(onChangeEnd).toHaveBeenCalledTimes(1);
		expect(onChangeEnd).toHaveBeenCalledWith([1, 6]);
	});

	test("a new value from the caller moves the thumbs", () => {
		const props = {
			label: "Amount",
			thumbLabels: ["Minimum amount", "Maximum amount"] as const,
			stops: 7,
			valueText: rupees,
			onChangeEnd: () => {},
		};
		const { rerender } = render(
			<RangeSlider
				{...props}
				value={[0, 6]}
			/>,
		);
		rerender(
			<RangeSlider
				{...props}
				value={[2, 3]}
			/>,
		);

		expect(low()).toHaveValue("2");
		expect(high()).toHaveValue("3");
	});

	test("a caller's new value replaces a draft it did not commit", async () => {
		const user = userEvent.setup();
		const props = {
			label: "Amount",
			thumbLabels: ["Minimum amount", "Maximum amount"] as const,
			stops: 7,
			valueText: rupees,
			onChangeEnd: () => {},
		};
		const { rerender } = render(
			<RangeSlider
				{...props}
				value={[0, 6]}
			/>,
		);
		low().focus();
		await user.keyboard("{ArrowRight}{ArrowRight}");
		rerender(
			<RangeSlider
				{...props}
				value={[0, 3]}
			/>,
		);

		expect(low()).toHaveValue("0");
		expect(high()).toHaveValue("3");
	});

	test("reads the new stop's meaning after a move", async () => {
		const { user } = renderSlider();

		high().focus();
		await user.keyboard("{ArrowLeft}{ArrowLeft}");

		expect(high()).toHaveAttribute("aria-valuetext", "₹5,000");
	});
});

describe("disabled", () => {
	test("its thumbs cannot be focused or moved", async () => {
		const { user, onChangeEnd } = renderSlider({ isDisabled: true });

		await user.tab();
		expect(low()).not.toHaveFocus();
		expect(low()).toBeDisabled();
		expect(high()).toBeDisabled();
		await user.keyboard("{ArrowRight}");

		expect(onChangeEnd).not.toHaveBeenCalled();
	});

	test("marks its thumbs with a dashed outline, not colour alone", () => {
		renderSlider({ isDisabled: true });

		const thumb = low().closest("[data-rac]")!;
		expect(thumb).toHaveAttribute("data-disabled", "true");
		expect(thumb).toHaveClass("disabled:border-dashed");
	});
});
