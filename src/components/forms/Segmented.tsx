import {
	ToggleButton as AriaToggleButton,
	ToggleButtonGroup as AriaToggleButtonGroup,
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
	className?: string;
};

const sizes = {
	sm: "h-6.5 text-caption",
	md: "h-8 text-label",
};

/** A choice of two to five options that stay visible: Daily or Pace, the transaction type. One
 * is always selected, and the arrow keys move the selection. */
export function Segmented({
	options,
	value,
	onChange,
	label,
	size = "md",
	isDisabled = false,
	className,
}: SegmentedProps) {
	return (
		<AriaToggleButtonGroup
			aria-label={label}
			selectionMode="single"
			disallowEmptySelection
			selectedKeys={[value]}
			isDisabled={isDisabled}
			onSelectionChange={(keys) => {
				const [next] = keys;
				if (typeof next === "string" && next !== value) onChange(next);
			}}
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
					<AriaToggleButton
						key={id}
						id={id}
						className={cn(
							"text-ink-2 cursor-pointer rounded-lg border border-transparent px-3 font-semibold whitespace-nowrap",
							"transition-colors duration-(--dur-fast) ease-out max-md:min-h-11",
							"selected:border-line selected:bg-page selected:text-ink",
							"disabled:text-ink-3 disabled:cursor-not-allowed",
							sizes[size],
						)}
					>
						{text}
					</AriaToggleButton>
				);
			})}
		</AriaToggleButtonGroup>
	);
}
