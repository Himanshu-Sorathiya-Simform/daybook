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
 * Every part is at least 24 by 24 px, the smallest target WCAG 2.2 allows.
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
						// Each part is a target of at least 24 by 24 px (WCAG 2.5.8); the separators are not.
						"figures inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm px-0.5 outline-none",
						"type-literal:min-h-0 type-literal:min-w-0 type-literal:px-0 placeholder:text-ink-3",
						"focused:bg-accent focused:text-on-accent",
					)}
				/>
			)}
		</AriaDateInput>
	);
}
