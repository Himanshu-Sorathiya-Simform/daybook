"use client";

import {
	DateInput as AriaDateInput,
	DateSegment as AriaDateSegment,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type DateInputBoxProps = {
	className?: string;
};

/**
 * The box of a DateField or TimeField: its parts (day, month and year, or hour, minute and am
 * or pm) in the locale's order, each focusable and typed into, with the separators between
 * them. It looks like a TextInput's box. An empty part shows its placeholder in the third ink.
 */
export function DateInputBox({ className }: Readonly<DateInputBoxProps>) {
	return (
		<AriaDateInput
			className={cn(
				"rounded-control border-edge bg-page text-body text-ink flex min-h-10.5 items-center border px-3 max-md:min-h-11 pointer-coarse:text-base",
				"focus-within:focus-ring",
				"invalid:border-neg disabled:bg-soft disabled:text-ink-3 disabled:cursor-not-allowed",
				className,
			)}
		>
			{(segment) => (
				<AriaDateSegment
					segment={segment}
					className={cn(
						"figures rounded-sm px-0.5 outline-none",
						"type-literal:px-0 placeholder:text-ink-3",
						"focused:bg-accent focused:text-on-accent",
					)}
				/>
			)}
		</AriaDateInput>
	);
}
