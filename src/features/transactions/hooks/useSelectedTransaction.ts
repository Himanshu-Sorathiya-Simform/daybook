import { useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef } from "react";

import { showToast } from "@/components/feedback/showToast";
import { ApiRequestError } from "@/lib/api/client";
import type { CurrencyCode } from "@/lib/currency";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import { TRANSACTIONS_TEXT } from "../lib/messages";
import type { PanelSelection } from "../lib/panel";
import { transactionOptions } from "../lib/queries";
import type { TransactionAnswer } from "../lib/types";
import { useTransactionList } from "./useTransactionList";

type Options = {
	/** The selected row's id, `txn`, or null. */
	id: string | null;
	filter: TransactionFilter;
	list: ListParams;
	currency: CurrencyCode;
	/** Clears the selection once its row is found missing. */
	onMissing: () => void;
};

/**
 * The selected row for the panel (BR-F03-53, BR-F03-73): from the loaded pages, or, when they
 * do not hold it, through `GET /api/transactions/[id]` alone. Of the two, the higher version
 * wins, so an edit shows before the list has refetched.
 *
 * A 404 clears the selection with a message: "We couldn't find that Transaction." for a link to
 * a row this page never showed, and "This Transaction was deleted on another device." for one
 * it did, which left the pages on a refetch (D-554).
 */
export function useSelectedTransaction({
	id,
	filter,
	list,
	currency,
	onMissing,
}: Options): PanelSelection | null {
	const pages = useTransactionList({ filter, list, currency });
	const { data } = pages;
	let inPages: TransactionAnswer | undefined;
	if (id !== null && data) {
		for (const page of data.pages) {
			const found = page.items.find((item) => item.id === id);
			if (found) {
				inPages = { ...found, currency: page.currency };
				break;
			}
		}
	}
	// Its own query always, so an edit's answer shows at once; asked for alone once the pages
	// have answered without it, or failed.
	const alone = useQuery({
		...transactionOptions(id ?? ""),
		enabled: id !== null && (data !== undefined || pages.isError) && !inPages,
	});
	const loose = id !== null && alone.data?.id === id ? alone.data : undefined;
	const row =
		inPages && loose ?
			loose.version > inPages.version ?
				loose
			:	inPages
		:	(inPages ?? loose);

	// The last id the panel showed, which tells a deep link apart from a row deleted elsewhere.
	const seen = useRef<string | null>(null);
	// The caller's latest clearing function, so a new one each render never repeats the message.
	const clear = useRef(onMissing);
	useLayoutEffect(() => {
		if (row) seen.current = row.id;
		clear.current = onMissing;
	});

	const missing =
		id !== null
		&& !inPages
		&& alone.error instanceof ApiRequestError
		&& alone.error.status === 404;
	useEffect(() => {
		if (!missing) return;
		showToast(
			seen.current === id ?
				TRANSACTIONS_TEXT.deletedElsewhere
			:	TRANSACTIONS_TEXT.notFound,
		);
		clear.current();
	}, [missing, id]);

	if (id === null) return null;
	if (row) return { state: "shown", row };
	if (alone.isError && !missing) {
		return { state: "failed", onRetry: () => void alone.refetch() };
	}
	return { state: "loading" };
}
