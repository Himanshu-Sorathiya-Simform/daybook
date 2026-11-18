"use client";

import { useDebouncer } from "@tanstack/react-pacer";
import { useId, useRef, useState } from "react";

import { SearchField } from "@/components/forms/SearchField";
import { useShortcut } from "@/hooks/useShortcut";
import { cn } from "@/lib/cn";
import type { CurrencyCode } from "@/lib/currency";
import { checkQuery } from "@/lib/transactions/url";
import { FILTER_TEXT } from "../lib/messages";

/** The search box commits its draft this long after typing stops (BR-F03-38, FIL-4). */
export const SEARCH_COMMIT_MS = 300;

export type SearchBoxProps = {
	/** The committed search, from the URL. */
	q: string | undefined;
	/** Commits a new search, or none, to the URL. */
	onCommit: (q: string | undefined) => void;
	currency: CurrencyCode;
	/** Offline the box is disabled: search needs the server (section 10). */
	isOffline?: boolean;
	/** Reports focus entering and leaving the box, a typing visit (D-547). */
	onFocusChange?: (isFocused: boolean) => void;
	className?: string;
};

/**
 * The Transactions search box (BR-F03-38, BR-F03-39). It keeps its own draft and commits it 300
 * ms after typing stops; Enter commits at once, and so does clearing it, with the clear button
 * or Escape, which also leaves the box. A draft under 3 characters that is not an amount is
 * never sent: once typing stops, the box says "Type at least 3 characters, or an amount." and
 * the committed search stays. A draft with a control character, which a paste can bring, is
 * not sent either, and says "Remove unsupported characters." A new search from elsewhere, such as its chip removed, replaces
 * the draft. `/` focuses the box from anywhere on the page but another text field.
 */
export function SearchBox({
	q,
	onCommit,
	currency,
	isOffline = false,
	onFocusChange,
	className,
}: Readonly<SearchBoxProps>) {
	const input = useRef<HTMLInputElement>(null);
	const hintId = useId();
	const [draft, setDraft] = useState(q ?? "");
	const [committed, setCommitted] = useState(q);
	// What the box says about a draft it will not send, or nothing.
	const [problem, setProblem] = useState<"too_short" | "characters" | null>(null);

	// The draft follows a search committed from elsewhere while rendering, React's pattern for
	// state that follows a prop; the box's own commit already matches its draft.
	if (q !== committed) {
		setCommitted(q);
		const check = checkQuery(draft, currency);
		if (!check.ok || check.q !== q) {
			setDraft(q ?? "");
			setProblem(null);
		}
	}

	const settle = (text: string) => {
		const check = checkQuery(text, currency);
		if (!check.ok) {
			// Over 100 characters cannot be typed: the box stops at the limit.
			setProblem(
				check.reason === "too_short" || check.reason === "characters" ?
					check.reason
				:	null,
			);
			return;
		}
		setProblem(null);
		if (check.q !== q) onCommit(check.q);
	};
	const debouncer = useDebouncer(settle, { wait: SEARCH_COMMIT_MS });

	// Offline the box is disabled, so the key focuses nothing.
	useShortcut("/", () => input.current?.focus());

	return (
		<div className={cn("flex min-w-0 flex-col gap-1", className)}>
			<SearchField
				label="Search Transactions"
				placeholder="Search payee, note or amount"
				disabledPlaceholder={FILTER_TEXT.searchOffline}
				shortcut="/"
				inputRef={input}
				value={draft}
				maxLength={100}
				isDisabled={isOffline}
				{...(onFocusChange ? { onFocusChange } : {})}
				{...(problem ? { "aria-describedby": hintId } : {})}
				onChange={(text) => {
					setDraft(text);
					setProblem(null);
					if (text.trim() === "") {
						debouncer.cancel();
						settle(text);
					} else {
						debouncer.maybeExecute(text);
					}
				}}
				onSubmit={() => {
					debouncer.cancel();
					settle(draft);
				}}
			/>
			{/* Always present, so screen readers hear the message when it appears. */}
			<p
				id={hintId}
				role="status"
				className={cn(
					"text-caption text-ink-2 px-0.5",
					!problem && "sr-only",
				)}
			>
				{problem === "too_short" && FILTER_TEXT.searchTooShort}
				{problem === "characters" && FILTER_TEXT.searchCharacters}
			</p>
		</div>
	);
}
