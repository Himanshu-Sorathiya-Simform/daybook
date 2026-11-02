"use client";

import { useId } from "react";

import { Segmented } from "@/components/forms/Segmented";
import type { WeekStart } from "@/lib/geo";
import { cn } from "@/lib/cn";
import { ONBOARDING_TEXT } from "../lib/messages";
import { WEEK_START_OPTIONS } from "../lib/options";

export type WeekStartFieldProps = {
	value: WeekStart;
	onChange: (weekStart: WeekStart) => void;
	error?: string | undefined;
	isDisabled?: boolean;
};

/** "Week starts on" (F02 section 6): Monday, Sunday or Saturday, with its helper text, or its
 * message when the server refused it, read with the choice. */
export function WeekStartField({
	value,
	onChange,
	error,
	isDisabled = false,
}: Readonly<WeekStartFieldProps>) {
	const hintId = useId();
	return (
		<div className="flex flex-col gap-1.25">
			<span
				aria-hidden="true"
				className="text-caption text-ink font-semibold"
			>
				Week starts on
			</span>
			<Segmented
				label="Week starts on"
				options={WEEK_START_OPTIONS}
				value={value}
				isDisabled={isDisabled}
				aria-describedby={hintId}
				className="self-start"
				onChange={(weekStart) => onChange(weekStart as WeekStart)}
			/>
			<p
				id={hintId}
				className={cn(
					"text-caption",
					error ? "text-neg font-medium" : "text-ink-3",
				)}
			>
				{error ?? ONBOARDING_TEXT.weekStartHint}
			</p>
		</div>
	);
}
