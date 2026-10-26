import { Check, ChevronDown } from "lucide-react";
import {
	Button as AriaButton,
	ListBox as AriaListBox,
	ListBoxItem as AriaListBoxItem,
	Popover as AriaPopover,
	Select as AriaSelect,
	SelectValue as AriaSelectValue,
	type SelectProps as AriaSelectProps,
} from "react-aria-components";

import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";

export type SelectOption = { value: string | number; label: string };

type Item = { id: string | number; label: string };

export type SelectProps = Omit<
	AriaSelectProps<Item>,
	| "children"
	| "className"
	| "style"
	| "items"
	| "selectionMode"
	| "isInvalid"
	| "validate"
	| "value"
	| "defaultValue"
	| "onChange"
	| "selectedKey"
	| "defaultSelectedKey"
	| "onSelectionChange"
>
	& Omit<FieldProps, "children" | "className"> & {
		/** Plain strings and numbers are used as both the value and the label. */
		options: Array<SelectOption | string | number>;
		value: string | number;
		onChange: (value: string | number) => void;
		/** `md` is 44px, for forms; `sm` is 36px, for toolbars and inside pickers. */
		size?: "sm" | "md";
		/** Classes for the root element, which holds the label, the trigger and the message. */
		className?: string;
	};

function toItem(option: SelectOption | string | number): Item {
	return typeof option === "object" ?
			{ id: option.value, label: option.label }
		:	{ id: option, label: String(option) };
}

const sizes = {
	sm: "h-9 text-caption font-medium",
	md: "h-11 text-body",
};

/**
 * A single-choice dropdown. Use it for six or more options, or when space is tight; use
 * Segmented for two to five options that should stay visible. Never a native `<select>`. The
 * list opens in a popover that React Aria places in the page's top layer, so a scrolling dialog
 * body never clips it, and it flips above the trigger when there is no room below.
 */
export function Select({
	label,
	hint,
	error,
	optional,
	counter,
	options,
	value,
	onChange,
	size = "md",
	className,
	...rest
}: Readonly<SelectProps>) {
	return (
		<AriaSelect
			{...rest}
			value={value}
			onChange={(key) => {
				if (key !== null) onChange(key as string | number);
			}}
			isInvalid={Boolean(error)}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional, counter }}>
				<AriaButton
					className={cn(
						"group/trigger rounded-control bg-page text-ink flex w-full min-w-0 cursor-pointer items-center gap-2 border pr-2.5 pl-3 text-left",
						"transition-colors duration-(--dur-fast) ease-out max-md:min-h-11",
						error ? "border-neg" : (
							"border-edge aria-expanded:border-accent"
						),
						"disabled:bg-soft disabled:text-ink-3 disabled:cursor-not-allowed",
						sizes[size],
					)}
				>
					<AriaSelectValue className="min-w-0 flex-1 truncate" />
					<ChevronDown
						aria-hidden="true"
						className="text-ink-3 size-3.5 shrink-0 transition-transform duration-(--dur-fast) ease-out group-aria-expanded/trigger:rotate-180"
					/>
				</AriaButton>
			</Field>
			<AriaPopover
				offset={4}
				className={cn(
					"border-line bg-page shadow-popover z-50 min-w-(--trigger-width) overflow-hidden rounded-xl border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaListBox
					items={options.map(toItem)}
					className="box-border max-h-70 overflow-auto p-1.5 outline-none"
				>
					{(item) => (
						<AriaListBoxItem
							id={item.id}
							textValue={item.label}
							className="text-label text-ink selected:font-semibold focus:bg-soft flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 whitespace-nowrap outline-none max-md:min-h-11"
						>
							{({ isSelected }) => (
								<>
									<span className="flex-1">{item.label}</span>
									{isSelected && (
										<Check
											aria-hidden="true"
											className="text-accent size-3.5"
										/>
									)}
								</>
							)}
						</AriaListBoxItem>
					)}
				</AriaListBox>
			</AriaPopover>
		</AriaSelect>
	);
}
