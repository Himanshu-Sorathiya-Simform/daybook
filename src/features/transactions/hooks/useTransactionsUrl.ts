import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import type { CurrencyCode } from "@/lib/currency";
import {
	type ListParams,
	readFilterParams,
	type TransactionFilter,
	writeFilterQuery,
} from "@/lib/transactions/url";

/** What the URL says beyond the filter: the interface parameters, which never enter a query
 * key (F03 section 3, D-454). */
type Interface = { view: string | null; txn: string | null; isNew: boolean };

type State = { filter: TransactionFilter; list: ListParams } & Interface;

/** A parameter given once with a value; repeated or empty counts as absent. */
function single(params: URLSearchParams, name: string): string | null {
	const values = params.getAll(name);
	return values.length === 1 && values[0] !== "" ? (values[0] as string) : null;
}

/** The page's state as `params` hold it: the committed filter and list, and the interface
 * parameters, with what the reader found invalid. */
function stateOf(params: URLSearchParams, currency: CurrencyCode) {
	const read = readFilterParams(params, { currency });
	const state: State = {
		filter: read.filter,
		list: read.list,
		view: single(params, "view"),
		txn: single(params, "txn"),
		isNew: params.get("new") === "1" && params.getAll("new").length === 1,
	};
	return { state, invalid: read.invalid };
}

/** The page's URL for a state: the filter and list in BR-F03-33's normalized order, then
 * `view`, `txn` and `new`. Names that are none of these are not kept (D-458). */
function hrefOf(
	pathname: string,
	{ filter, list, view, txn, isNew }: State,
	currency: CurrencyCode,
): string {
	const parts = [writeFilterQuery(filter, list, { currency })];
	if (view !== null) parts.push(`view=${encodeURIComponent(view)}`);
	if (txn !== null) parts.push(`txn=${encodeURIComponent(txn)}`);
	if (isNew) parts.push("new=1");
	const query = parts.filter((part) => part !== "").join("&");
	return query === "" ? pathname : `${pathname}?${query}`;
}

/**
 * The Transactions page's state in its URL (FIL-4, BR-F03-33, BR-F03-53, BR-F03-65).
 * - **Reading:** the committed filter and list parameters, normalized by the same reader as the
 *   API, and the interface parameters `view`, `txn` and `new`.
 * - **Invalid parameters** are dropped with the notice (BR-F03-34): the URL is replaced by its
 *   normalized form, and `notice` stays true until dismissed or the filter changes.
 * - **Writing:** a filter, list or view change pushes a history entry; selecting a row, the new
 *   dialog and marking a view replace the current one (BR-F03-53, BR-F03-65,
 *   BR-F03-73). Each goes through the browser's history, which Next's router follows without
 *   asking the server again, so the page's prefetch runs only on a real page load. Each write
 *   starts from the browser's URL, so two writes both land, such as closing `new=1` and
 *   selecting the row it created, even with a render between them.
 */
export function useTransactionsUrl(currency: CurrencyCode) {
	const searchParams = useSearchParams();
	const pathname = usePathname();
	const { state: current, invalid } = stateOf(
		new URLSearchParams(searchParams.toString()),
		currency,
	);
	const [notice, setNotice] = useState(false);

	const cleaned = invalid.length > 0 ? hrefOf(pathname, current, currency) : null;

	// The notice is set while rendering, React's pattern for state that follows what was
	// read; only the URL, which lives outside React, is changed in an effect.
	if (cleaned !== null && !notice) setNotice(true);

	useEffect(() => {
		if (cleaned === null) return;
		// Next's router starts following the history API in an effect of its own component,
		// which runs after this one on the first render; a microtask later it is listening.
		let live = true;
		queueMicrotask(() => {
			if (live) window.history.replaceState(null, "", cleaned);
		});
		return () => {
			live = false;
		};
	}, [cleaned]);

	// Each write starts from the browser's URL, which every history call moves at once. The
	// rendered URL can lag: Next's router takes a call in a render later, so a render in between
	// would bring back what an earlier write removed.
	const go = (mode: "push" | "replace", change: (state: State) => State) => {
		const { state } = stateOf(
			new URLSearchParams(window.location.search),
			currency,
		);
		const next = change(state);
		const href = hrefOf(pathname, next, currency);
		if (mode === "push") window.history.pushState(null, "", href);
		else window.history.replaceState(null, "", href);
	};

	return {
		filter: current.filter,
		list: current.list,
		view: current.view,
		txn: current.txn,
		isNew: current.isNew,
		/** "Some filters in this link weren't valid and were removed." (FIL-5). */
		notice,
		dismissNotice: () => setNotice(false),
		/** A new committed filter, and list parameters when given. The view, the selected row
		 * and the dialog stay (BR-F03-66, BR-F03-73). It adds a history entry, or replaces the
		 * current one for a later change in the same visit to a control (D-547). */
		setFilter: (
			filter: TransactionFilter,
			list?: ListParams,
			mode: "push" | "replace" = "push",
		) => {
			setNotice(false);
			go(mode, (state) => ({ ...state, filter, list: list ?? state.list }));
		},
		setList: (list: ListParams) => go("push", (state) => ({ ...state, list })),
		/** Applies a view: its filter and list replace the URL's, with `view=<id>`, or none for
		 * All Transactions (BR-F03-65). The selected row stays. */
		applyView: (
			view: string | null,
			filter: TransactionFilter,
			list: ListParams,
		) => {
			setNotice(false);
			go("push", (state) => ({ ...state, view, filter, list }));
		},
		/** Marks a view as selected without a history entry, the URL's filter unchanged: a view
		 * just saved from it (BR-F03-67), or none for an id the views list does not have
		 * (BR-F03-65) or a view just deleted (BR-F03-69). */
		markView: (view: string | null) =>
			go("replace", (state) => ({ ...state, view })),
		select: (txn: string | null) =>
			go("replace", (state) => ({ ...state, txn })),
		setNew: (isNew: boolean) => go("replace", (state) => ({ ...state, isNew })),
	};
}
