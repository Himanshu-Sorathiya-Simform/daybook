import type { CurrencyCode } from "@/lib/currency";
import { lowercase } from "@/lib/text";
import type { Dir, Group, Sort } from "@/lib/transactions/model";
import type { ListParams, TransactionFilter } from "@/lib/transactions/url";
import {
	ALL_TRANSACTIONS,
	fromViewFilter,
	isEdited,
	type SavedView,
	toViewFilter,
	VIEW_MESSAGES,
	type ViewFilter,
	viewNameSchema,
} from "@/lib/transactions/views";

/** The profile's today in its zone (TIME-5) and its currency, which views resolve against. */
export type ViewContext = { today: string; currency: CurrencyCode };

/** A view's filter and list parameters, as a view stores them. */
type ViewShape = { filter: ViewFilter; sort: Sort; dir: Dir; group: Group };

/** The URL's filter and list parameters. */
export type UrlState = { filter: TransactionFilter; list: ListParams };

/** The view the bar shows as selected (BR-F03-65, BR-F03-66). */
export type SelectedView =
	| { kind: "all"; edited: boolean }
	| { kind: "saved"; view: SavedView; edited: boolean }
	/** A `view` id before the views list has loaded: it stays, and no pill is selected yet. */
	| { kind: "waiting" };

/**
 * The selected view, and whether the URL differs from it with its preset resolved for today
 * (BR-F03-66). No `view` selects All Transactions, and so does an id the loaded list lacks,
 * which the page then drops from the URL (BR-F03-65).
 */
export function selectedView(
	id: string | null,
	views: readonly SavedView[] | undefined,
	current: UrlState,
	context: ViewContext,
): SelectedView {
	if (id !== null) {
		if (views === undefined) return { kind: "waiting" };
		const view = views.find((item) => item.id === id);
		if (view) {
			return { kind: "saved", view, edited: isEdited(view, current, context) };
		}
	}
	return { kind: "all", edited: isEdited(ALL_TRANSACTIONS, current, context) };
}

/** Whether `id` names a view the loaded list lacks, so it leaves the URL (BR-F03-65). Until the
 * list loads, nothing is unknown. */
export function isUnknownView(
	id: string | null,
	views: readonly SavedView[] | undefined,
): boolean {
	return (
		id !== null && views !== undefined && !views.some((item) => item.id === id)
	);
}

/** What applying a view writes into the URL (BR-F03-65): its filter, with a preset as that
 * preset's dates for today, and its sort, direction and group. */
export function viewUrl(view: ViewShape, today: string): UrlState {
	return {
		filter: fromViewFilter(view.filter, today),
		list: { sort: view.sort, dir: view.dir, group: view.group },
	};
}

/** What Save as view and Update view store from the URL (BR-F03-67, BR-F03-68): its filter,
 * with dates that are a preset's today saved as that preset, and its list parameters. The
 * currency goes with amount bounds only (BR-F03-64). */
export function viewFields(
	{ filter, list }: UrlState,
	{ today, currency }: ViewContext,
): ViewShape & { currency?: CurrencyCode } {
	const saved = toViewFilter(filter, today);
	const fields = { filter: saved, ...list };
	const hasAmount = saved.minMinor !== undefined || saved.maxMinor !== undefined;
	return hasAmount ? { ...fields, currency } : fields;
}

export type NameCheck = { ok: true; name: string } | { ok: false; message: string };

/**
 * A new name for a view, checked before Rename sends it (BR-F03-63): the server's text rules
 * give the name as it will be stored, and a name one of `others` has, compared as Postgres's
 * `lower()` compares (D-497), gets the server's own message. The server still decides.
 */
export function checkViewName(text: string, others: readonly string[]): NameCheck {
	const parsed = viewNameSchema.safeParse(text);
	if (!parsed.success) {
		return { ok: false, message: parsed.error.issues[0]?.message ?? "" };
	}
	const name = parsed.data;
	if (others.some((other) => lowercase(other) === lowercase(name))) {
		return { ok: false, message: VIEW_MESSAGES.nameTaken };
	}
	return { ok: true, name };
}
