"use client";

import {
	Group as AriaGroup,
	Input as AriaInput,
	TextField as AriaTextField,
	type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";

import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";
import { currencyExponent, currencySymbol, type CurrencyCode } from "@/lib/currency";

export type AmountInputProps = Omit<
	AriaTextFieldProps,
	"children" | "className" | "style" | "isInvalid" | "validate" | "inputMode"
>
	& Omit<FieldProps, "children" | "className"> & {
		currency: CurrencyCode;
		/** The profile's number format, for example `de-DE-u-nu-latn`; it picks the currency sign. */
		numberLocale: string;
		/** The entry dialog's large box, or the smaller one of a filter's Min and Max. */
		size?: "md" | "lg";
		/** Shown while the box is empty, "Any". */
		placeholder?: string;
		/** Classes for the root element, which holds the label, the box and the message. */
		className?: string;
	};

/**
 * An amount box: the large one of the entry dialog, or a smaller one for a filter. It shows the currency sign and takes the amount as
 * typed, in the user's own format, as text: the value in and out is a string. Turning it into
 * minor units is not its job (BR-F03-04). The phone keyboard is the decimal pad, or the number
 * pad for a currency with no decimals.
 */
export function AmountInput({
	label,
	hint,
	error,
	optional,
	counter,
	currency,
	numberLocale,
	size = "lg",
	placeholder,
	className,
	...rest
}: Readonly<AmountInputProps>) {
	const large = size === "lg";
	return (
		<AriaTextField
			{...rest}
			isInvalid={Boolean(error)}
			inputMode={currencyExponent(currency) === 0 ? "numeric" : "decimal"}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional, counter }}>
				<AriaGroup
					className={cn(
						"rounded-control border-edge bg-page focus-within:focus-ring flex items-center gap-1.5 border",
						large ? "h-14 px-3.5" : "h-9.5 px-2.5 max-md:h-11",
						"invalid:border-neg disabled:bg-soft",
					)}
				>
					<span
						aria-hidden="true"
						className={cn(
							"figures text-ink-2 font-medium",
							large ? "text-heading" : "text-body",
						)}
					>
						{currencySymbol(currency, numberLocale)}
					</span>
					<AriaInput
						{...(placeholder ? { placeholder } : {})}
						className={cn(
							"figures text-ink placeholder:text-ink-3 disabled:text-ink-3 min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed",
							large ? "text-figure" : (
								"text-body pointer-coarse:text-base"
							),
						)}
					/>
				</AriaGroup>
			</Field>
		</AriaTextField>
	);
}
