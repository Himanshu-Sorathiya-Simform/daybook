"use client";

import { Search, X } from "lucide-react";
import type { Ref } from "react";
import {
	Button as AriaButton,
	Group as AriaGroup,
	Input as AriaInput,
	Label as AriaLabel,
	SearchField as AriaSearchField,
	type SearchFieldProps as AriaSearchFieldProps,
} from "react-aria-components";

import { cn } from "@/lib/cn";

export type SearchFieldProps = Omit<
	AriaSearchFieldProps,
	"children" | "className" | "style" | "isInvalid" | "validate"
> & {
	/** The field's name for screen readers, "Search Transactions". It is not shown. */
	label: string;
	placeholder?: string;
	/** The placeholder while disabled, "Search needs a connection". */
	disabledPlaceholder?: string;
	/** The key that focuses the field, "/", shown as a key cap while the field is empty. Only a
	 * hint: the page binds the key. */
	shortcut?: string;
	/** The input, for a shortcut that focuses it. */
	inputRef?: Ref<HTMLInputElement>;
	className?: string;
};

/**
 * A search box (BR-F03-39). Enter calls `onSubmit`; Escape clears the text, calls `onClear`, and
 * leaves the box, as does Escape in an empty box. The clear button shows while there is text
 * and is left out of the Tab order, since Escape does the same.
 */
export function SearchField({
	label,
	placeholder,
	disabledPlaceholder,
	shortcut,
	inputRef,
	isDisabled = false,
	onKeyDown,
	className,
	...rest
}: Readonly<SearchFieldProps>) {
	const shown = isDisabled ? (disabledPlaceholder ?? placeholder) : placeholder;
	return (
		<AriaSearchField
			{...rest}
			isDisabled={isDisabled}
			onKeyDown={(event) => {
				// React Aria clears the text on Escape; leaving the box is ours. Every key goes on to
				// the page, as it would without this handler.
				event.continuePropagation();
				if (event.key === "Escape")
					(event.target as HTMLInputElement).blur();
				onKeyDown?.(event);
			}}
			className={cn("flex min-w-0 flex-col", className)}
		>
			{({ isEmpty }) => (
				<>
					<AriaLabel className="sr-only">{label}</AriaLabel>
					<AriaGroup
						className={cn(
							"rounded-control border-edge bg-page focus-within:focus-ring flex h-9.5 min-w-0 items-center gap-2 border px-2.5 max-md:min-h-11",
							"disabled:bg-soft",
						)}
					>
						<Search
							aria-hidden="true"
							className="text-ink-3 size-3.75 shrink-0"
						/>
						<AriaInput
							ref={inputRef}
							{...(shown ? { placeholder: shown } : {})}
							{...(shortcut ? { "aria-keyshortcuts": shortcut } : {})}
							className="text-body text-ink placeholder:text-ink-3 disabled:text-ink-3 min-w-0 flex-1 self-stretch bg-transparent outline-none disabled:cursor-not-allowed pointer-coarse:text-base [&::-webkit-search-cancel-button]:hidden"
						/>
						{shortcut && isEmpty && !isDisabled && (
							<kbd
								aria-hidden="true"
								className="rounded-kbd border-line-strong text-small text-ink-2 shrink-0 border px-1.5 font-sans"
							>
								{shortcut}
							</kbd>
						)}
						{!isEmpty && (
							<AriaButton className="text-ink-3 hover:text-ink inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full max-md:size-11">
								<X
									aria-hidden="true"
									className="size-3.5"
								/>
							</AriaButton>
						)}
					</AriaGroup>
				</>
			)}
		</AriaSearchField>
	);
}
