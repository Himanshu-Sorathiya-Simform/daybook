import {
	RadioButton as AriaRadioButton,
	RadioField as AriaRadioField,
	RadioGroup as AriaRadioGroup,
	Text as AriaText,
	type RadioGroupProps as AriaRadioGroupProps,
} from "react-aria-components";

import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";

export type ChoiceGroupOption = {
	value: string;
	label: string;
	/** A line under the label. It is read out with the option. */
	description?: string;
	/** A facet count at the end of the row. */
	count?: number;
	isDisabled?: boolean;
};

export type ChoiceGroupProps = Omit<
	AriaRadioGroupProps,
	| "children"
	| "className"
	| "style"
	| "isInvalid"
	| "validate"
	| "value"
	| "defaultValue"
	| "onChange"
>
	& Omit<FieldProps, "children" | "className"> & {
		options: ChoiceGroupOption[];
		/** The chosen option's value, or `null` when nothing is chosen yet. */
		value: string | null;
		onChange: (value: string) => void;
		/** Classes for the root element, which holds the label, the options and the message. */
		className?: string;
	};

/** A set of radio buttons: one choice from a short list that should stay visible. The arrow
 * keys move between the options and choose them. */
export function ChoiceGroup({
	label,
	hint,
	error,
	optional,
	counter,
	options,
	className,
	...rest
}: ChoiceGroupProps) {
	return (
		<AriaRadioGroup
			{...rest}
			isInvalid={Boolean(error)}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional, counter }}>
				<div
					className={cn(
						"flex",
						rest.orientation === "horizontal" ?
							"flex-row gap-4"
						:	"flex-col gap-1",
					)}
				>
					{options.map((option) => (
						<AriaRadioField
							key={option.value}
							value={option.value}
							isDisabled={option.isDisabled ?? false}
							className="flex flex-col"
						>
							<AriaRadioButton className="text-label text-ink disabled:text-ink-3 flex min-h-8 cursor-pointer items-center gap-2.5 disabled:cursor-not-allowed max-md:min-h-11">
								{({ isSelected, isDisabled, isFocusVisible }) => (
									<>
										<span
											className={cn(
												"bg-page flex size-4.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-(--dur-fast) ease-out",
												isSelected ? "border-accent" : (
													"border-edge"
												),
												isDisabled && "border-dashed",
												isFocusVisible && "focus-ring",
											)}
										>
											{isSelected && (
												<span className="bg-accent size-2 rounded-full" />
											)}
										</span>
										<span className="flex-1">
											{option.label}
										</span>
										{option.count !== undefined && (
											<span className="figures text-caption text-ink-2">
												{option.count}
											</span>
										)}
									</>
								)}
							</AriaRadioButton>
							{option.description && (
								<AriaText
									slot="description"
									className="text-caption text-ink-2 ms-7"
								>
									{option.description}
								</AriaText>
							)}
						</AriaRadioField>
					))}
				</div>
			</Field>
		</AriaRadioGroup>
	);
}
