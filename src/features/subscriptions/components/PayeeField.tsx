"use client";

import { useState } from "react";
import {
	Collection as AriaCollection,
	ComboBox as AriaComboBox,
	Group as AriaGroup,
	Header as AriaHeader,
	Input as AriaInput,
	type Key as AriaKey,
	ListBox as AriaListBox,
	ListBoxItem as AriaListBoxItem,
	ListBoxSection as AriaListBoxSection,
	Popover as AriaPopover,
} from "react-aria-components";

import { Avatar } from "@/components/data/Avatar";
import { Field } from "@/components/forms/Field";
import { categoryLabel } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { lowercase } from "@/lib/text";
import type { PayeeItem } from "@/lib/transactions/answers";
import { DIALOG_TEXT } from "../lib/dialog";

export type PayeeFieldProps = {
	/** The name as typed. */
	value: string;
	onChange: (value: string) => void;
	/** The payees to list: `payeeChoices` for the text. */
	choices: readonly PayeeItem[];
	/** A payee was chosen: the dialog fills its category and amount (BR-F05-24). */
	onChoose: (item: PayeeItem) => void;
	/** "Filled from your last Netflix expense: …", while it still holds. */
	hint?: string | undefined;
	error?: string | undefined;
	autoFocus?: boolean;
	isDisabled?: boolean;
	className?: string;
};

/** "Entertainment · 3 times", or "· 1 time": the last expense's category and every row the
 * payee has, of any type (BR-F05-24). */
function usage(item: PayeeItem): string {
	const times = item.count === 1 ? "time" : "times";
	return `${categoryLabel(item.lastExpense?.category ?? item.lastCategory)} · ${item.count} ${times}`;
}

/**
 * Add's Name: a text box that lists "Payees you've paid" (BR-F05-24). Any text can be kept as the
 * name; choosing a payee hands it to the dialog, which fills the category and amount of its last
 * expense. The list is given as data, so React Aria shows it as it is: the choices already are
 * the matches, and React Aria's own filtering breaks on a list with a heading. There is no
 * "Use … as a new payee": a new name is only typed. Escape closes the list first; a second
 * Escape reaches the dialog.
 */
export function PayeeField({
	value,
	onChange,
	choices,
	onChoose,
	hint,
	error,
	autoFocus = false,
	isDisabled = false,
	className,
}: Readonly<PayeeFieldProps>) {
	const entries =
		choices.length > 0 ?
			[
				{
					id: "paid",
					items: choices.map((item) => ({
						id: lowercase(item.payee),
						item,
					})),
				},
			]
		:	[];
	// The option just chosen, and the text it left, until the text changes: React Aria shows it
	// as chosen, and reads the chosen text as typing no more.
	const [picked, setPicked] = useState<{ key: string; text: string } | null>(null);
	const chosen = picked?.text === value ? picked.key : null;
	const choose = (key: AriaKey | null) => {
		const item = choices.find((each) => lowercase(each.payee) === key);
		if (!item) return;
		setPicked({ key: lowercase(item.payee), text: item.payee });
		onChoose(item);
	};

	return (
		<AriaComboBox
			allowsCustomValue
			menuTrigger="focus"
			inputValue={value}
			onInputChange={onChange}
			items={entries}
			value={chosen}
			onChange={choose}
			isInvalid={Boolean(error)}
			isDisabled={isDisabled}
			className={cn("flex flex-col", className)}
		>
			<Field
				label={DIALOG_TEXT.name}
				error={error}
				hint={hint}
			>
				<AriaGroup
					className={cn(
						"rounded-control border-edge bg-page focus-within:focus-ring flex min-h-10.5 items-center border px-3 max-md:min-h-11",
						"invalid:border-neg disabled:bg-soft",
					)}
				>
					<AriaInput
						autoFocus={autoFocus}
						placeholder={DIALOG_TEXT.namePlaceholder}
						className="text-body text-ink placeholder:text-ink-3 disabled:text-ink-3 min-w-0 flex-1 self-stretch bg-transparent outline-none disabled:cursor-not-allowed pointer-coarse:text-base"
					/>
				</AriaGroup>
			</Field>
			<AriaPopover
				offset={4}
				className={cn(
					"border-line bg-page shadow-popover z-50 flex w-(--trigger-width) flex-col overflow-hidden rounded-xl border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaListBox className="box-border max-h-70 overflow-auto p-1.5 outline-none">
					{(entry: (typeof entries)[number]) => (
						<AriaListBoxSection id={entry.id}>
							<AriaHeader className="text-caption text-ink-3 px-2 pt-1 pb-1.5">
								{DIALOG_TEXT.payeesHeading}
							</AriaHeader>
							<AriaCollection items={entry.items}>
								{({ id, item }: { id: string; item: PayeeItem }) => (
									<AriaListBoxItem
										id={id}
										textValue={item.payee}
										className="focus:bg-soft flex min-h-11.5 cursor-pointer items-center gap-2.5 rounded-lg px-2 outline-none"
									>
										<Avatar
											payee={item.payee}
											category={
												item.lastExpense?.category
												?? item.lastCategory
											}
											size="sm"
										/>
										<span className="flex min-w-0 flex-col">
											<span className="text-label text-ink truncate font-medium">
												{item.payee}
											</span>
											<span className="text-caption text-ink-2">
												{usage(item)}
											</span>
										</span>
									</AriaListBoxItem>
								)}
							</AriaCollection>
						</AriaListBoxSection>
					)}
				</AriaListBox>
			</AriaPopover>
		</AriaComboBox>
	);
}
