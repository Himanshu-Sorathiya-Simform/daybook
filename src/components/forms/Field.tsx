import type { ReactNode } from "react";
import {
	FieldError as AriaFieldError,
	Label as AriaLabel,
	Text as AriaText,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type FieldProps = {
	/** The visible label. Every Daybook field has one; a placeholder is never the label. */
	label: string;
	hint?: string | undefined;
	/** The field's error. It replaces the hint and is read out with the control. */
	error?: string | undefined;
	optional?: boolean | undefined;
	/** A running count shown at the end of the label row, for example "31 / 500". */
	counter?: string | undefined;
	/** The control. It sits inside a React Aria field, which links the label, hint and error. */
	children: ReactNode;
	className?: string;
};

/**
 * The label above a control, with the hint or error below. It goes inside a React Aria field
 * (TextField, Select, RadioGroup), and that field connects the label, the hint and the error to
 * the control, so nothing here sets an id or an `aria-` attribute.
 */
export function Field({
	label,
	hint,
	error,
	optional,
	counter,
	children,
	className,
}: FieldProps) {
	return (
		<div className={cn("flex flex-col gap-1.25", className)}>
			<div className="flex items-baseline gap-1.5">
				<AriaLabel className="text-caption text-ink font-semibold">
					{label}
				</AriaLabel>
				{optional && (
					<span className="text-caption text-ink-3">(optional)</span>
				)}
				<span className="flex-1" />
				{counter && (
					<span className="figures text-caption text-ink-3">
						{counter}
					</span>
				)}
			</div>
			{children}
			{error ?
				<AriaFieldError className="text-caption text-neg font-medium">
					{error}
				</AriaFieldError>
			: hint ?
				<AriaText
					slot="description"
					className="text-caption text-ink-3"
				>
					{hint}
				</AriaText>
			:	null}
		</div>
	);
}
