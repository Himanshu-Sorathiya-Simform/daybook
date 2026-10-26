import {
	RadioButton as AriaRadioButton,
	RadioField as AriaRadioField,
	RadioGroup as AriaRadioGroup,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type SegmentedOption = string | { value: string; label: string };

export type SegmentedProps = {
	options: SegmentedOption[];
	value: string;
	onChange: (value: string) => void;
	/** The group's accessible name. It is a radio group, so it always needs one. */
	label: string;
	size?: "sm" | "md";
	isDisabled?: boolean;
	/** Submits the chosen value with a form under this name. */
	name?: string;
	className?: string;
};

const sizes = {
	sm: "h-6.5 text-caption",
	md: "h-8 text-label",
};

/**
 * A choice of two to five options that stay visible: Daily or Pace, the transaction type. It is a
 * radio group, so one option is always chosen, Tab lands on the chosen one, and the arrow keys
 * move and choose.
 */
export function Segmented({
	options,
	value,
	onChange,
	label,
	size = "md",
	isDisabled = false,
	name,
	className,
}: Readonly<SegmentedProps>) {
	return (
		<AriaRadioGroup
			aria-label={label}
			orientation="horizontal"
			value={value}
			onChange={onChange}
			isDisabled={isDisabled}
			{...(name ? { name } : {})}
			className={cn(
				"rounded-control bg-soft inline-flex gap-0.5 p-0.5",
				className,
			)}
		>
			{options.map((option) => {
				const { value: id, label: text } =
					typeof option === "string" ?
						{ value: option, label: option }
					:	option;
				return (
					<AriaRadioField
						key={id}
						value={id}

						className="flex"
					>
						<AriaRadioButton
							className={cn(
								"text-ink-2 inline-flex cursor-pointer items-center rounded-lg border border-transparent px-3 font-semibold whitespace-nowrap",
								"transition-colors duration-(--dur-fast) ease-out max-md:min-h-11",
								"selected:border-line selected:bg-page selected:text-ink",
								"focus-visible:focus-ring",
								"disabled:text-ink-3 disabled:cursor-not-allowed",
								sizes[size],
							)}
						>
							{text}
						</AriaRadioButton>
					</AriaRadioField>
				);
			})}
		</AriaRadioGroup>
	);
}
