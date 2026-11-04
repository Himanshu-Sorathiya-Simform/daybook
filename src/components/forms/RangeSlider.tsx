"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
	Slider as AriaSlider,
	SliderThumb as AriaSliderThumb,
	SliderTrack as AriaSliderTrack,
} from "react-aria-components";

import { cn } from "@/lib/cn";

/** The two thumbs' places, as stop indexes from 0: `[low, high]`, low always below high. */
export type SliderRange = readonly [number, number];

export type RangeSliderProps = {
	/** The slider's accessible name, "Amount". */
	label: string;
	/** Each thumb's accessible name, `["Minimum amount", "Maximum amount"]`. */
	thumbLabels: readonly [string, string];
	/** How many stops the thumbs move between, at least 2; the stops are 0 to `stops - 1`. */
	stops: number;
	value: SliderRange;
	/** Called on every move while a thumb is dragged or stepped, for a live preview. */
	onChange?: (value: SliderRange) => void;
	/** Called when a thumb is released, or after each key press, with a range that differs from
	 * `value`: the place to commit. */
	onChangeEnd: (value: SliderRange) => void;
	/** What a stop means, read out as a thumb's value: "₹1,000.00" rather than "4". */
	valueText: (stop: number) => string;
	isDisabled?: boolean;
	className?: string;
};

/**
 * Two thumbs on one track that stop only on given places, such as a histogram's edges, with
 * the part between them filled. The thumbs never meet: one pushed into the other stops a stop
 * short of it, so the range always spans at least one step. Arrow keys move the focused thumb by one stop, Home and End to its furthest stop, and
 * a press on the track moves the nearer thumb. Each thumb is a native range input inside, read
 * out with its own name and `valueText`. On phones each thumb's touch area is 44px.
 */
export function RangeSlider({
	label,
	thumbLabels,
	stops,
	value,
	onChange,
	onChangeEnd,
	valueText,
	isDisabled = false,
	className,
}: Readonly<RangeSliderProps>) {
	const [draft, setDraft] = useState<SliderRange>(value);
	const [given, setGiven] = useState(value);
	// The thumbs follow a new value while rendering, React's pattern for state that follows a
	// prop; between a move and its commit they show the draft.
	if (value[0] !== given[0] || value[1] !== given[1]) {
		setGiven(value);
		setDraft(value);
	}

	const same = (a: SliderRange, b: SliderRange) => a[0] === b[0] && a[1] === b[1];
	/** React Aria lets the thumbs meet; the one that moved stops a stop short instead. */
	const apart = (next: number[]): SliderRange => {
		const [low, high] = next as [number, number];
		if (low < high) return [low, high];
		return low === draft[0] ? [low, low + 1] : [high - 1, high];
	};

	return (
		<AriaSlider<number[]>
			aria-label={label}
			minValue={0}
			maxValue={stops - 1}
			step={1}
			value={[...draft]}
			onChange={(next) => {
				const range = apart(next);
				if (same(range, draft)) return;
				setDraft(range);
				onChange?.(range);
			}}
			onChangeEnd={(next) => {
				const range = apart(next);
				if (!same(range, value)) onChangeEnd(range);
			}}
			isDisabled={isDisabled}
			className={cn("flex h-7 w-full items-center", className)}
		>
			<AriaSliderTrack className="relative h-7 w-full cursor-pointer disabled:cursor-not-allowed">
				{({ state }) => (
					<>
						<div className="bg-track absolute inset-x-0 top-3 h-1 rounded-full" />
						<div
							className="bg-accent absolute top-3 h-1 rounded-full disabled:opacity-40"
							style={{
								left: `${state.getThumbPercent(0) * 100}%`,
								right: `${(1 - state.getThumbPercent(1)) * 100}%`,
							}}
						/>
						{thumbLabels.map((name, index) => (
							<Thumb
								key={name}
								index={index}
								name={name}
								text={valueText(draft[index as 0 | 1])}
							/>
						))}
					</>
				)}
			</AriaSliderTrack>
		</AriaSlider>
	);
}

/** One thumb: a circle on the track over a native range input, which is what is focused and
 * read out. */
function Thumb({
	index,
	name,
	text,
}: Readonly<{ index: number; name: string; text: string }>) {
	const input = useRef<HTMLInputElement>(null);
	// React Aria reads a thumb's value through its number format, which would say the stop's
	// index, and offers no way to say it otherwise. React rewrites that attribute only when the
	// stop changes, and `text` changes with it, so this runs after each of those writes.
	useLayoutEffect(() => {
		input.current!.setAttribute("aria-valuetext", text);
	}, [text]);

	return (
		<AriaSliderThumb
			index={index}
			aria-label={name}
			inputRef={input}
			className={cn(
				"border-accent bg-page top-3.5 size-5 cursor-grab rounded-full border-2 shadow-sm",
				"dragging:cursor-grabbing focus-visible:focus-ring",
				"disabled:border-edge disabled:cursor-not-allowed disabled:border-dashed",
				"after:absolute after:-inset-1 after:content-[''] max-md:after:-inset-3",
			)}
		/>
	);
}
