import { z } from "zod";

import { isMonth, type Month, RESTORE_FIRST } from "@/lib/budgets/months";
import { isUuidV7 } from "@/lib/ids";
import { textSchema } from "@/lib/text";
import { isInstant } from "@/lib/transactions/schemas";

import { DASHBOARD_MESSAGES as M } from "./messages";
import {
	MAX_VIEWS_PER_REQUEST,
	MAX_WIDGET_ENTRIES,
	normalizeWidgets,
	VIEW_NAME_MAX,
	type WidgetEntry,
} from "./views";

/** `GET /api/dashboard`'s `month` and `PUT /api/layout`'s body (F08 sections 4 and 11). A body
 * schema checks shape, text and the rules that need no stored row; the clock clamp, the limit
 * of 5 views and the upsert stay with the server (BR-F08-22). */

/** The month a request asks for: the current month when it names none, else `YYYY-MM` from 2000-01
 * to the current month (BR-F08-01). `today` is the profile's date, `YYYY-MM-DD`. */
export function parseDashboardMonth(
	value: string | null | undefined,
	today: string,
): { ok: true; month: Month } | { ok: false; message: string } {
	const current = today.slice(0, 7);
	if (value === null || value === undefined) return { ok: true, month: current };
	if (!isMonth(value) || value < RESTORE_FIRST || value > current) {
		return { ok: false, message: M.month };
	}
	return { ok: true, month: value };
}

const id = z
	.string({ error: M.id })
	.refine(isUuidV7, { error: M.id })
	.transform((value) => value.toLowerCase());
const changedAt = z
	.string({ error: M.instant })
	.refine(isInstant, { error: M.instant });
const flag = z.boolean({ error: M.boolean });
const name = textSchema({
	max: VIEW_NAME_MAX,
	messages: { required: M.nameRequired, tooLong: M.nameTooLong },
});
const widgets = z
	.array(
		z.object(
			{
				id: z.string({ error: M.widget }).max(64, { error: M.widget }),
				size: z.number({ error: M.widget }).int({ error: M.widget }),
				hidden: z.boolean({ error: M.widget }),
			},
			{ error: M.widget },
		),
		{ error: M.widgets },
	)
	.max(MAX_WIDGET_ENTRIES, { error: M.widgets });

/** One view of a `PUT`. A live view's name and widgets are checked; a deleted one's are not
 * read, and it becomes a marker with an empty name and no widgets (D-636). */
const view = z
	.object({
		id,
		changedAt,
		deleted: flag,
		name: z.unknown().optional(),
		widgets: z.unknown().optional(),
	})
	.transform((value, ctx) => {
		const { id: viewId, changedAt: at, deleted } = value;
		if (deleted) {
			return {
				id: viewId,
				name: "",
				widgets: [] as z.output<typeof widgets>,
				changedAt: at,
				deleted: true as const,
			};
		}
		const checked = {
			name: name.safeParse(value.name),
			widgets: widgets.safeParse(value.widgets),
		};
		for (const [key, result] of Object.entries(checked)) {
			if (result.success) continue;
			for (const issue of result.error.issues) {
				ctx.addIssue({
					code: "custom",
					message: issue.message,
					path: [key],
				});
			}
		}
		if (!checked.name.success || !checked.widgets.success) return z.NEVER;
		return {
			id: viewId,
			name: checked.name.data,
			widgets: checked.widgets.data,
			changedAt: at,
			deleted: false as const,
		};
	});

export type ViewWrite = {
	id: string;
	name: string;
	widgets: WidgetEntry[];
	changedAt: string;
	deleted: boolean;
};

/**
 * The body of `PUT /api/layout` (BR-F08-23): a format and 1 to 10 views, each once. What passes
 * comes out with every live view's widgets normalized (BR-F08-20), unknown ids, sizes and
 * formats included, which are never refused. The client's ids are lower-cased.
 */
export const layoutPutSchema = z
	.object({
		formatVersion: z
			.number({ error: M.formatVersion })
			.int({ error: M.formatVersion }),
		views: z
			.array(view, { error: M.views })
			.min(1, { error: M.views })
			.max(MAX_VIEWS_PER_REQUEST, { error: M.views }),
	})
	.superRefine((body, ctx) => {
		const seen = new Set<string>();
		body.views.forEach((each, index) => {
			if (seen.has(each.id)) {
				ctx.addIssue({
					code: "custom",
					message: M.viewTwice,
					path: ["views", index, "id"],
				});
			}
			seen.add(each.id);
		});
	})
	.transform(({ formatVersion, views }): { views: ViewWrite[] } => ({
		views: views.map((each) => ({
			...each,
			widgets:
				each.deleted ? [] : normalizeWidgets(each.widgets, formatVersion),
		})),
	}));

export type LayoutPutBody = z.output<typeof layoutPutSchema>;
export type LayoutPutInput = z.input<typeof layoutPutSchema>;
