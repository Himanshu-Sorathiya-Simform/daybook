import type { WidgetEntry } from "./views";
import { widgetById, type WidgetId, type WidgetSize } from "./widgets";

/** The grid's six columns on a wide screen (F08 section 3); one column below it. */
export const WIDE_COLUMNS = 6;
/** The grid is wide from this width in pixels, measured on the grid itself. */
export const WIDE_GRID_WIDTH = 640;

export type PlacedWidget = {
	id: WidgetId;
	size: WidgetSize;
	/** The columns it takes: its size, or more when it is the last of its row and stretches. */
	span: number;
	stretched: boolean;
};

export type GridRow = { widgets: PlacedWidget[]; height: number };

/** The widgets a view shows: its visible ones, and without the finance widgets while the
 * account is empty (BR-F08-19). */
export function shownWidgets(
	widgets: readonly WidgetEntry[],
	accountEmpty: boolean,
): WidgetEntry[] {
	return widgets.filter((entry) => {
		if (entry.hidden) return false;
		return !(accountEmpty && widgetById(entry.id)?.finance);
	});
}

/**
 * Packs widgets into rows (F08 section 3): in order, a widget joins the current row while the
 * sizes add up to at most 6, else it starts the next. A row is as tall as its tallest widget's
 * reserved height, and its last widget stretches to fill it, which is drawn and never stored.
 * With one column every widget is a row of its own and nothing stretches.
 */
export function packRows(
	widgets: readonly WidgetEntry[],
	columns: 1 | typeof WIDE_COLUMNS,
): GridRow[] {
	const groups: WidgetEntry[][] = [];
	let used = 0;
	for (const entry of widgets) {
		const size = columns === 1 ? WIDE_COLUMNS : entry.size;
		const current = groups[groups.length - 1];
		if (current && used + size <= WIDE_COLUMNS && columns !== 1) {
			current.push(entry);
			used += size;
		} else {
			groups.push([entry]);
			used = size;
		}
	}
	return groups.map((group) => {
		const total = group.reduce((sum, entry) => sum + entry.size, 0);
		return {
			height: Math.max(
				...group.map((entry) => widgetById(entry.id)?.height ?? 0),
			),
			widgets: group.map((entry, index) => {
				const last = index === group.length - 1;
				const stretch = columns !== 1 && last ? WIDE_COLUMNS - total : 0;
				return {
					id: entry.id,
					size: entry.size,
					span: columns === 1 ? 1 : entry.size + stretch,
					stretched: stretch > 0,
				};
			}),
		};
	});
}
