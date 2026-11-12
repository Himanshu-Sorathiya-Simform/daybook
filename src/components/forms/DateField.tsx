"use client";

import { parseDate } from "@internationalized/date";
import {
	DateField as AriaDateField,
	type DateFieldProps as AriaDateFieldProps,
	type DateValue as AriaDateValue,
} from "react-aria-components";

import { DateInputBox } from "@/components/forms/DateInputBox";
import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";

export type DateFieldProps = Omit<
	AriaDateFieldProps<AriaDateValue>,
	| "children"
	| "className"
	| "style"
	| "value"
	| "defaultValue"
	| "onChange"
	| "minValue"
	| "maxValue"
	| "placeholderValue"
	| "isInvalid"
	| "validate"
>
	& Omit<FieldProps, "children" | "className" | "counter"> & {
		/** The day, `YYYY-MM-DD`, or none. */
		value: string | null;
		/** Called with the day once every part is filled, and with null once every part is
		 * cleared. While only some parts are empty it keeps the last complete day. */
		onChange: (value: string | null) => void;
		/** Classes for the root element, which holds the label, the box and the message. */
		className?: string;
	};

/**
 * A typed date, From or To of a custom range: day, month and year in the locale's order
 * (BR-F02-19). Each part takes digits, or the arrow keys to step it; Backspace clears a part.
 * The caller checks the date and passes `error`, which marks it invalid and is read out.
 */
export function DateField({
	label,
	hint,
	error,
	optional,
	value,
	onChange,
	className,
	...rest
}: Readonly<DateFieldProps>) {
	return (
		<AriaDateField
			{...rest}
			value={value === null ? null : parseDate(value)}
			onChange={(date) => onChange(date === null ? null : date.toString())}
			isInvalid={Boolean(error)}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional }}>
				<DateInputBox />
			</Field>
		</AriaDateField>
	);
}
