"use client";

import { Check, ChevronDown } from "lucide-react";
import {
	Button as AriaButton,
	ComboBox as AriaComboBox,
	type ComboBoxProps as AriaComboBoxProps,
	Group as AriaGroup,
	Input as AriaInput,
	ListBox as AriaListBox,
	ListBoxItem as AriaListBoxItem,
	Popover as AriaPopover,
	useFilter as useAriaFilter,
} from "react-aria-components";

import { Field, type FieldProps } from "@/components/forms/Field";
import { cn } from "@/lib/cn";

export type ComboBoxOption = { value: string; label: string };

type Item = { id: string; label: string };

export type ComboBoxProps = Omit<
	AriaComboBoxProps<Item>,
	| "children"
	| "className"
	| "style"
	| "items"
	| "defaultItems"
	| "selectionMode"
	| "isInvalid"
	| "validate"
	| "value"
	| "defaultValue"
	| "onChange"
	| "allowsCustomValue"
	| "allowsEmptyCollection"
	| "defaultFilter"
>
	& Omit<FieldProps, "children" | "className"> & {
		/** The choices, in the order they are listed. */
		options: ComboBoxOption[];
		/** The chosen option's value, or `null` with none. */
		value: string | null;
		onChange: (value: string | null) => void;
		placeholder?: string;
		/** What the list says when nothing matches the typed text. */
		emptyMessage: string;
		/** Classes for the root element, which holds the label, the box and the message. */
		className?: string;
	};

/**
 * A text box that filters a long list to choose one option, such as a country. Typing keeps the
 * options whose label contains the text, ignoring case and accents; the button lists them all.
 * Only a listed option can be chosen: text that matches none goes back to the chosen label when
 * focus leaves. Use `Select` when the list is short enough to scan.
 */
export function ComboBox({
	label,
	hint,
	error,
	optional,
	counter,
	options,
	value,
	onChange,
	placeholder,
	emptyMessage,
	className,
	...rest
}: Readonly<ComboBoxProps>) {
	const { contains } = useAriaFilter({ sensitivity: "base" });
	const items = options.map((option): Item => ({
		id: option.value,
		label: option.label,
	}));
	return (
		<AriaComboBox
			{...rest}
			defaultItems={items}
			defaultFilter={contains}
			value={value}
			onChange={(key) => onChange(key === null ? null : String(key))}
			allowsEmptyCollection
			isInvalid={Boolean(error)}
			className={cn("flex flex-col", className)}
		>
			<Field {...{ label, hint, error, optional, counter }}>
				<AriaGroup
					className={cn(
						"rounded-control border-edge bg-page focus-within:focus-ring flex min-h-10.5 items-center gap-1 border pl-3 max-md:min-h-11",
						"invalid:border-neg disabled:bg-soft",
					)}
				>
					<AriaInput
						{...(placeholder ? { placeholder } : {})}
						className="text-body text-ink placeholder:text-ink-3 disabled:text-ink-3 min-w-0 flex-1 self-stretch bg-transparent outline-none disabled:cursor-not-allowed pointer-coarse:text-base"
					/>
					<AriaButton className="text-ink-3 disabled:text-ink-3 flex size-9 shrink-0 cursor-pointer items-center justify-center outline-none disabled:cursor-not-allowed max-md:size-11">
						<ChevronDown
							aria-hidden="true"
							className="size-3.5"
						/>
					</AriaButton>
				</AriaGroup>
			</Field>
			<AriaPopover
				offset={4}
				className={cn(
					"border-line bg-page shadow-popover z-50 w-(--trigger-width) overflow-hidden rounded-xl border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaListBox
					className="box-border max-h-70 overflow-auto p-1.5 outline-none"
					renderEmptyState={() => (
						<p className="text-label text-ink-3 px-2.5 py-2">
							{emptyMessage}
						</p>
					)}
				>
					{(item: Item) => (
						<AriaListBoxItem
							id={item.id}
							textValue={item.label}
							className="text-label text-ink selected:font-semibold focus:bg-soft flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 outline-none max-md:min-h-11"
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
		</AriaComboBox>
	);
}
