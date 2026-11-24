import {
	isWidgetSize,
	WIDGETS,
	type WidgetId,
	type WidgetSize,
	widgetById,
} from "./widgets";

/** The built-in view's id. It is defined in code, never stored (D-635). */
export const OVERVIEW_ID = "overview";
export const OVERVIEW_NAME = "Overview";
/** The name Customize gives the copy it makes of Overview (BR-F08-25). */
export const COPY_NAME = "My view";

/** The format of the stored widget document (F08 section 3). */
export const VIEW_FORMAT_VERSION = 1;
/** Live views of the user's own (D-635), a name's length, and the sizes of one request and one
 * view's list (BR-F08-23). */
export const MAX_OWN_VIEWS = 5;
export const VIEW_NAME_MAX = 40;
export const MAX_VIEWS_PER_REQUEST = 10;
export const MAX_WIDGET_ENTRIES = 50;

export type WidgetEntry = { id: WidgetId; size: WidgetSize; hidden: boolean };

/** A widget entry as a client or a stored row may hold it, before normalization. */
export type RawWidgetEntry = { id: string; size: number; hidden: boolean };

export type DashboardView = {
	id: string;
	name: string;
	widgets: WidgetEntry[];
	changedAt: string;
};

export const isOverview = (id: string) => id === OVERVIEW_ID;

/** The registry's widgets in its order, at their default sizes, all visible: Overview's
 * widgets, and what Reset to default sets (BR-F08-21). Fresh objects each time. */
export function defaultWidgets(): WidgetEntry[] {
	return WIDGETS.map((widget) => ({
		id: widget.id,
		size: widget.defaultSize,
		hidden: false,
	}));
}

/** Overview itself: never stored, never changed. */
export function overviewView(): {
	id: string;
	name: string;
	widgets: WidgetEntry[];
} {
	return { id: OVERVIEW_ID, name: OVERVIEW_NAME, widgets: defaultWidgets() };
}

/** What Customize makes on Overview (BR-F08-25): a copy named "My view", with `id` and
 * `changedAt` from the client. */
export function copyOfOverview(id: string, changedAt: string): DashboardView {
	return { id, name: COPY_NAME, widgets: defaultWidgets(), changedAt };
}

/** Whether a user with `liveViews` views of their own may make another (D-635). */
export const canAddView = (liveViews: number) => liveViews < MAX_OWN_VIEWS;

/**
 * A view's widgets made valid (BR-F08-20): unknown ids dropped, a duplicate keeping its first
 * entry, a size outside 2, 3, 4 and 6 set to the widget's default, registry widgets the view
 * lacks appended in registry order and visible, and the first widget made visible when none
 * is. A view with an unknown `formatVersion` gets Overview's widgets. The server does this on
 * every read and write, the client again on load.
 */
export function normalizeWidgets(
	entries: readonly RawWidgetEntry[],
	formatVersion: number = VIEW_FORMAT_VERSION,
): WidgetEntry[] {
	const source: readonly RawWidgetEntry[] =
		formatVersion === VIEW_FORMAT_VERSION ? entries : defaultWidgets();
	const seen = new Set<string>();
	const result: WidgetEntry[] = [];
	for (const entry of source) {
		const widget = widgetById(entry.id);
		if (!widget || seen.has(widget.id)) continue;
		seen.add(widget.id);
		result.push({
			id: widget.id,
			size: isWidgetSize(entry.size) ? entry.size : widget.defaultSize,
			hidden: entry.hidden === true,
		});
	}
	for (const widget of WIDGETS) {
		if (!seen.has(widget.id)) {
			result.push({ id: widget.id, size: widget.defaultSize, hidden: false });
		}
	}
	if (result.every((entry) => entry.hidden)) {
		(result[0] as WidgetEntry).hidden = false;
	}
	return result;
}

/** The most recent `changedAt` the server may store: a later one is stored as the request
 * clock, so a device with a fast clock cannot win forever (BR-F08-22). Instants are ISO 8601
 * in UTC, which compare as text only when they have the same form, so they are compared as
 * times. */
export function clampChangedAt(changedAt: string, now: string): string {
	return Date.parse(changedAt) > Date.parse(now) ? now : changedAt;
}
