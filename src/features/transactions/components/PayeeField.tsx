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
import { usePayeeSuggestions } from "../hooks/usePayeeSuggestions";
import { counterOf, ENTRY_TEXT } from "../lib/entry";
import type { PayeeItem } from "../lib/suggestions";

export type PayeeFieldProps = {
	/** The payee as typed. */
	value: string;
	onChange: (value: string) => void;
	/** A suggestion was chosen: the dialog fills the payee and its category (BR-F03-45). */
	onChoose: (item: PayeeItem) => void;
	error?: string | undefined;
	isDisabled?: boolean;
	className?: string;
};

/** The key of "Use “X” as a new payee"; a payee's key is its lowered name, which never starts
 * with a control character. */
const NEW_PAYEE = "\u0000new";

/** A suggestion as the list holds it, under its lowered name. */
type Suggestion = { id: string; item: PayeeItem };

/** The list's entries: the suggestions under their heading, then "Use “X” as a new payee". */
type Entry =
	| { id: "suggestions"; heading: string; suggestions: Suggestion[] }
	| { id: typeof NEW_PAYEE; text: string };

/** "Food · 4 times", or "Food · 1 time" (F03 section 8). */
function usage(item: PayeeItem): string {
	const times = item.count === 1 ? "time" : "times";
	return `${categoryLabel(item.lastCategory)} · ${item.count} ${times}`;
}

/**
 * The payee: a text box that also suggests (BR-F03-45, BR-F03-61, D-225). Focused while empty, it
 * lists "Recent and frequent"; typing, "Matches", with "Use “X” as a new payee" last when no
 * suggestion equals the text. The list ends with its keyboard hint. Any text can be kept, and
 * choosing a suggestion hands it to the dialog, which fills the category. Escape closes the list
 * first; a second Escape reaches the dialog. The counter shows from 61 characters.
 */
export function PayeeField({
	value,
	onChange,
	onChoose,
	error,
	isDisabled = false,
	className,
}: Readonly<PayeeFieldProps>) {
	const { mode, items, exact } = usePayeeSuggestions(value);
	const text = value.trim();
	const offerNew = mode === "matches" && text !== "" && !exact;
	// The list is given as data, so React Aria shows it as it is: the suggestions are already
	// the matches (D-497), and React Aria's own filtering breaks on a list with a heading.
	const entries: Entry[] = [];
	if (items.length > 0) {
		entries.push({
			id: "suggestions",
			heading: mode === "recent" ? "Recent and frequent" : "Matches",
			suggestions: items.map((item) => ({ id: lowercase(item.payee), item })),
		});
	}
	if (offerNew) entries.push({ id: NEW_PAYEE, text });
	// The option just chosen, and the text it left, until the text changes. React Aria shows it
	// as chosen; were nothing ever chosen, it would read the chosen text as typing and open the
	// list again. Typed text equal to a payee is never chosen for the user, so its case stays.
	const [picked, setPicked] = useState<{ key: string; text: string } | null>(null);
	const chosen = picked?.text === value ? picked.key : null;

	const choose = (key: AriaKey | null) => {
		if (key === NEW_PAYEE) {
			setPicked({ key, text: value });
			return;
		}
		const item = items.find((candidate) => lowercase(candidate.payee) === key);
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
				label="Payee"
				error={error}
				counter={counterOf("payee", value)}
			>
				<AriaGroup
					className={cn(
						"rounded-control border-edge bg-page focus-within:focus-ring flex min-h-10.5 items-center border px-3 max-md:min-h-11",
						"invalid:border-neg disabled:bg-soft",
					)}
				>
					<AriaInput
						placeholder="Who you paid, or who paid you"
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
					{(entry: Entry) =>
						entry.id === NEW_PAYEE ?
							<AriaListBoxItem
								id={NEW_PAYEE}
								textValue={entry.text}
								className="border-line focus:bg-soft text-label text-ink-2 flex min-h-11.5 cursor-pointer items-center rounded-lg border-t px-2 font-medium outline-none"
							>
								Use “{entry.text}” as a new payee
							</AriaListBoxItem>
						:	<AriaListBoxSection id={entry.id}>
								<AriaHeader className="text-caption text-ink-3 px-2 pt-1 pb-1.5">
									{entry.heading}
								</AriaHeader>
								<AriaCollection items={entry.suggestions}>
									{({ id, item }: Suggestion) => (
										<AriaListBoxItem
											id={id}
											textValue={item.payee}
											className="focus:bg-soft flex min-h-11.5 cursor-pointer items-center gap-2.5 rounded-lg px-2 outline-none"
										>
											<Avatar
												payee={item.payee}
												category={item.lastCategory}
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
					}
				</AriaListBox>
				<p className="text-small text-ink-3 px-3.5 pt-1 pb-2.5">
					{ENTRY_TEXT.listHint}
				</p>
			</AriaPopover>
		</AriaComboBox>
	);
}
