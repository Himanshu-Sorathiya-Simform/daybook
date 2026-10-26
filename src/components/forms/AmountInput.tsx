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
	"children" | "className" | "style" | "isInvalid" | "inputMode"
>
	& Omit<FieldProps, "children" | "className"> & {
		currency: CurrencyCode;
		/** The profile's number format, for example `de-DE-u-nu-latn`; it picks the currency sign. */
		numberLocale: string;
		/** Classes for the root element, which holds the label, the box and the message. */
		className?: string;
	};

/**
 * The large amount box of the entry dialog. It shows the currency sign and takes the amount as
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
	className,
	...rest
}: AmountInputProps) {
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
						"rounded-control border-edge bg-page focus-within:focus-ring flex h-14 items-center gap-1.5 border px-3.5",
						"invalid:border-neg disabled:bg-soft",
					)}
				>
					<span
						aria-hidden="true"
						className="figures text-heading text-ink-2 font-medium"
					>
						{currencySymbol(currency, numberLocale)}
					</span>
					<AriaInput className="figures text-figure text-ink disabled:text-ink-3 min-w-0 flex-1 bg-transparent outline-none disabled:cursor-not-allowed" />
				</AriaGroup>
			</Field>
		</AriaTextField>
	);
}
