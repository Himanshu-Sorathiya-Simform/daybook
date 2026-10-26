import { Check } from "lucide-react";
import {
	CheckboxButton as AriaCheckboxButton,
	CheckboxField as AriaCheckboxField,
	SwitchButton as AriaSwitchButton,
	SwitchField as AriaSwitchField,
	Text as AriaText,
	type SwitchFieldProps as AriaSwitchFieldProps,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type ChoiceProps = Omit<
	AriaSwitchFieldProps,
	"children" | "className" | "style" | "render" | "isInvalid" | "validate"
> & {
	/** A checkbox is one of several options; a switch turns a setting on or off at once. */
	type?: "checkbox" | "switch";
	label: string;
	/** A line under the label. It is read out with the control. */
	description?: string;
	/** A facet count at the end of the row, so empty options show before the user picks. */
	count?: number;
	/** Classes for the root element. */
	className?: string;
};

const row =
	"flex min-h-8 cursor-pointer items-center gap-2.5 text-label text-ink max-md:min-h-11 disabled:cursor-not-allowed disabled:text-ink-3";

/** A checkbox or a switch with a label. Press it, or Space on the keyboard, to toggle. */
export function Choice({
	type = "checkbox",
	label,
	description,
	count,
	className,
	...rest
}: ChoiceProps) {
	const text = (
		<>
			<span className="flex-1">{label}</span>
			{count !== undefined && " "}
			{count !== undefined && (
				<span className="figures text-caption text-ink-2">{count}</span>
			)}
		</>
	);
	const note = description && (
		<AriaText
			slot="description"
			className={cn(
				"text-caption text-ink-2",
				type === "switch" ? "ms-11.5" : "ms-7",
			)}
		>
			{description}
		</AriaText>
	);

	if (type === "switch") {
		return (
			<AriaSwitchField
				{...rest}
				className={cn("flex flex-col", className)}
			>
				<AriaSwitchButton className={row}>
					{({ isSelected, isDisabled, isFocusVisible }) => (
						<>
							<span
								className={cn(
									"flex h-5.5 w-9 shrink-0 items-center rounded-full border-[1.5px] px-0.5 transition-colors duration-(--dur-fast) ease-out",
									isSelected ?
										"border-accent bg-accent"
									:	"border-edge bg-page",
									isDisabled && "border-dashed",
									isFocusVisible && "focus-ring",
								)}
							>
								<span
									className={cn(
										"size-3.75 rounded-full transition-transform duration-(--dur-fast) ease-out",
										isSelected ?
											"bg-on-accent translate-x-3.5"
										:	"bg-edge",
									)}
								/>
							</span>
							{text}
						</>
					)}
				</AriaSwitchButton>
				{note}
			</AriaSwitchField>
		);
	}

	return (
		<AriaCheckboxField
			{...rest}
			className={cn("flex flex-col", className)}
		>
			<AriaCheckboxButton className={row}>
				{({ isSelected, isDisabled, isFocusVisible }) => (
					<>
						<span
							className={cn(
								"rounded-kbd flex size-4.5 shrink-0 items-center justify-center border-[1.5px] transition-colors duration-(--dur-fast) ease-out",
								isSelected ?
									"border-accent bg-accent"
								:	"border-edge bg-page",
								isDisabled && "border-dashed",
								isFocusVisible && "focus-ring",
							)}
						>
							{isSelected && (
								<Check
									aria-hidden="true"
									strokeWidth={3}
									className="text-on-accent size-3"
								/>
							)}
						</span>
						{text}
					</>
				)}
			</AriaCheckboxButton>
			{note}
		</AriaCheckboxField>
	);
}
