import {
	addedMessage,
	DASHBOARD_MESSAGES,
	hiddenMessage,
	movedMessage,
	sizedMessage,
} from "./messages";
import { defaultWidgets, type WidgetEntry } from "./views";
import { widgetById, type WidgetSize } from "./widgets";

/** What one Customize action does: the view's new widgets and the words a live region reads
 * (BR-F08-25). Every function here returns new arrays and never changes its input. */
export type Change = { widgets: WidgetEntry[]; announcement: string };

const titleOf = (id: string) => widgetById(id)?.title ?? id;
const visibleCount = (widgets: readonly WidgetEntry[]) =>
	widgets.filter((entry) => !entry.hidden).length;

/**
 * Moves a visible widget one place earlier (`-1`) or later (`1`) among the visible ones,
 * swapping with its visible neighbor; hidden widgets stay where they are. `null` at the end of
 * the row, or for an id that is not visible. The announcement gives the new position among the
 * visible widgets: "Budgets moved to position 2 of 8."
 */
export function moveWidget(
	widgets: readonly WidgetEntry[],
	id: string,
	direction: -1 | 1,
): Change | null {
	const visible = widgets.flatMap((entry, index) => (entry.hidden ? [] : [index]));
	const from = widgets.findIndex((entry) => entry.id === id && !entry.hidden);
	if (from === -1) return null;
	const place = visible.indexOf(from);
	const target = visible[place + direction];
	if (target === undefined) return null;
	const next = widgets.map((entry) => ({ ...entry }));
	[next[from], next[target]] = [
		next[target] as WidgetEntry,
		next[from] as WidgetEntry,
	];
	return {
		widgets: next,
		announcement: movedMessage(
			titleOf(id),
			place + direction + 1,
			visible.length,
		),
	};
}

/** Sets a visible widget's size. `null` when it already has it or is not visible. */
export function setWidgetSize(
	widgets: readonly WidgetEntry[],
	id: string,
	size: WidgetSize,
): Change | null {
	const entry = widgets.find((each) => each.id === id && !each.hidden);
	if (!entry || entry.size === size) return null;
	return {
		widgets: widgets.map((each) =>
			each.id === id ? { ...each, size } : { ...each },
		),
		announcement: sizedMessage(titleOf(id), size),
	};
}

export type HideResult =
	{ ok: true; change: Change } | { ok: false; message: string };

/** Hides a visible widget. Hiding the last visible one is refused (BR-F08-24). An id that is
 * not visible gives `ok: false` with an empty message, so a caller never announces nothing. */
export function hideWidget(widgets: readonly WidgetEntry[], id: string): HideResult {
	const entry = widgets.find((each) => each.id === id && !each.hidden);
	if (!entry) return { ok: false, message: "" };
	if (visibleCount(widgets) <= 1) {
		return { ok: false, message: DASHBOARD_MESSAGES.keepOne };
	}
	return {
		ok: true,
		change: {
			widgets: widgets.map((each) =>
				each.id === id ? { ...each, hidden: true } : { ...each },
			),
			announcement: hiddenMessage(titleOf(id)),
		},
	};
}

/** Shows a hidden widget again at the end of the view (BR-F08-25). `null` when it is not
 * hidden. */
export function showWidget(
	widgets: readonly WidgetEntry[],
	id: string,
): Change | null {
	const entry = widgets.find((each) => each.id === id && each.hidden);
	if (!entry) return null;
	return {
		widgets: [
			...widgets.filter((each) => each.id !== id).map((each) => ({ ...each })),
			{ ...entry, hidden: false },
		],
		announcement: addedMessage(titleOf(id)),
	};
}

/** Reset to default (BR-F08-21): Overview's widgets, after the page has asked
 * `DASHBOARD_MESSAGES.resetConfirm`. */
export function resetWidgets(): Change {
	return {
		widgets: defaultWidgets(),
		announcement: DASHBOARD_MESSAGES.resetDone,
	};
}
