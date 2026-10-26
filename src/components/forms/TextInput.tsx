import type { LucideIcon } from "lucide-react";
import {
	Group as AriaGroup,
	Input as AriaInput,
	TextArea as AriaTextArea,
	TextField as AriaTextField,
	type TextFieldProps as AriaTextFieldProps,
} from "react-aria-components";

import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";

export type TextInputProps = Omit<
	AriaTextFieldProps,
	"children" | "className" | "style" | "isInvalid" | "validate"
>
	& Omit<FieldProps, "children" | "className"> & {
		placeholder?: string;
		/** A lucide icon shown before the text, as the component: `icon={Search}`. */
		icon?: LucideIcon;
		/** A multi-line box that the user can stretch up and down. */
		multiline?: boolean;
		/** The starting height of a multi-line box, in lines. */
		rows?: number;
		/** Classes for the root element, which holds the label, the box and the message. */
		className?: string;
	};

/** A labelled single-line or multi-line text box. `error` marks it invalid and is read out. */
export function TextInput({
	label,
	hint,
	error,
	optional,
	counter,
	placeholder,
	icon: Icon,
	multiline = false,
	rows = 3,
	className,
	...rest
}: TextInputProps) {
	return (
		<AriaTextField
			{...rest}
			isInvalid={Boolean(error)}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional, counter }}>
				<AriaGroup
					className={cn(
						"rounded-control border-edge bg-page focus-within:focus-ring flex gap-2.25 border px-3",
						multiline ? "items-start py-2.5" : (
							"min-h-10.5 items-center max-md:min-h-11"
						),
						"invalid:border-neg disabled:bg-soft",
					)}
				>
					{Icon && <Icon className="text-ink-3 size-3.75 shrink-0" />}
					{multiline ?
						<AriaTextArea
							rows={rows}
							{...(placeholder ? { placeholder } : {})}
							className="text-body text-ink placeholder:text-ink-3 disabled:text-ink-3 min-w-0 flex-1 resize-y bg-transparent outline-none disabled:cursor-not-allowed"
						/>
					:	<AriaInput
							{...(placeholder ? { placeholder } : {})}
							className="text-body text-ink placeholder:text-ink-3 disabled:text-ink-3 min-w-0 flex-1 self-stretch bg-transparent outline-none disabled:cursor-not-allowed"
						/>
					}
				</AriaGroup>
			</Field>
		</AriaTextField>
	);
}
