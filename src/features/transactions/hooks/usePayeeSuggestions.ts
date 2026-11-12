import { useQuery } from "@tanstack/react-query";
import { useDebouncer } from "@tanstack/react-pacer";
import { useEffect, useState } from "react";

import { useOnline } from "@/hooks/useOnline";
import { normalizeText } from "@/lib/text";
import { payeeSearchOptions } from "../lib/queries";
import {
	deviceSuggestions,
	hasExactPayee,
	MAX_SUGGESTIONS,
	mergeSuggestions,
	type PayeeItem,
	payeeQueryText,
	RECENT_COUNT,
} from "../lib/suggestions";
import { usePayees } from "./usePayees";

/** The server search waits this long after typing stops (BR-F03-61, as FIL-4). */
export const SEARCH_DELAY_MS = 300;

export type PayeeSuggestions = {
	/** "recent" while the field is empty, "matches" while typing (BR-F03-45). */
	mode: "recent" | "matches";
	items: PayeeItem[];
	/** Whether a suggestion equals the typed text, so no "Use … as a new payee". */
	exact: boolean;
};

/**
 * The payee field's suggestions (BR-F03-45, BR-F03-61). Empty, or only spaces and invisible
 * characters, the first 5 of the device's list. Text no payee can hold, with a control
 * character or over 80 code points, matches nothing and is never sent. Typing, up to 8 of the
 * device's matches; when those are fewer than 8 and the browser is online, the server's search
 * for the same text, 300 ms after typing stops, fills the rest with payees not already listed. A server answer only ever joins the text it was asked for,
 * and never offline, where the device's suggestions are all there is (section 10).
 */
export function usePayeeSuggestions(text: string): PayeeSuggestions {
	const { data } = usePayees();
	const online = useOnline();
	const q = payeeQueryText(text);
	const [settled, setSettled] = useState<string | null>(null);
	const settle = useDebouncer(setSettled, { wait: SEARCH_DELAY_MS });

	useEffect(() => settle.maybeExecute(q), [q, settle]);

	const list = data?.items ?? [];
	const device = q === null ? [] : deviceSuggestions(list, q);
	const search =
		online && q !== null && settled === q && device.length < MAX_SUGGESTIONS;
	const server = useQuery({ ...payeeSearchOptions(q ?? ""), enabled: search });

	const normalized = normalizeText(text);
	if (normalized.ok && normalized.value === "") {
		return { mode: "recent", items: list.slice(0, RECENT_COUNT), exact: false };
	}
	if (q === null) return { mode: "matches", items: [], exact: false };
	const items =
		search && server.data ? mergeSuggestions(device, server.data.items) : device;
	return { mode: "matches", items, exact: hasExactPayee(items, q) };
}
