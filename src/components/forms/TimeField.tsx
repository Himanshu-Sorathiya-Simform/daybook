"use client";

import { parseTime } from "@internationalized/date";
import {
	TimeField as AriaTimeField,
	type TimeFieldProps as AriaTimeFieldProps,
	type TimeValue as AriaTimeValue,
} from "react-aria-components";

import { DateInputBox } from "@/components/forms/DateInputBox";
import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";

export type TimeFieldProps = Omit<
	AriaTimeFieldProps<AriaTimeValue>,
	| "children"
	| "className"
	| "style"
	| "value"
	| "defaultValue"
	| "onChange"
	| "minValue"
	| "maxValue"
	| "placeholderValue"
	| "granularity"
	| "hourCycle"
	| "isInvalid"
	| "validate"
>
	& Omit<FieldProps, "children" | "className" | "counter"> & {
		/** The time, `HH:mm` on a 24-hour clock, or none. */
		value: string | null;
		/** Called with `HH:mm` once every part is filled, and with null once every part is
		 * cleared. While only some parts are empty it keeps the last complete time. */
		onChange: (value: string | null) => void;
		/** Classes for the root element, which holds the label, the box and the message. */
		className?: string;
	};

/**
 * A typed time to the minute, in the hour cycle of the locale React Aria is given, which is the
 * profile's (BR-F02-19): "11:50 pm" for en-IN, "23:50" for de-DE. Each part takes digits, or the
 * arrow keys to step it. The caller checks the time, such as one later than now on today
 * (BR-F03-09), and passes `error`, which marks it invalid and is read out.
 */
export function TimeField({
	label,
	hint,
	error,
	optional,
	value,
	onChange,
	className,
	...rest
}: Readonly<TimeFieldProps>) {
	return (
		<AriaTimeField
			{...rest}
			value={value === null ? null : parseTime(value)}
			onChange={(time) =>
				onChange(time === null ? null : time.toString().slice(0, 5))
			}
			isInvalid={Boolean(error)}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional }}>
				<DateInputBox />
			</Field>
		</AriaTimeField>
	);
}
