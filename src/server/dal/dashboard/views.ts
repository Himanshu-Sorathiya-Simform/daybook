import "server-only";
import { sql } from "drizzle-orm";
import {
	type DashboardView,
	MAX_MARKERS,
	MAX_OWN_VIEWS,
	normalizeWidgets,
	clampChangedAt,
	type RawWidgetEntry,
	VIEW_FORMAT_VERSION,
} from "@/lib/dashboard/views";
import type { ViewWrite } from "@/lib/dashboard/schemas";
import { ApiError, databaseErrorOf } from "../../api/errors";
import type { RequestContext } from "../context";
import { iso } from "../transactions/row";
import type { Tx } from "../with-user";

/** The primary key's index: a view id that is another user's collides with it, since row-level
 * security hides their row from the upsert's own key `(user_id, id)`. */
const PRIMARY_KEY = "dashboard_views_pkey";

type ViewRow = {
	id: string;
	name: string;
	widgets: RawWidgetEntry[];
	format_version: number;
	changed_at: string;
};

/**
 * The user's live Dashboard views (F08 section 11, `GET /api/layout`), oldest first by id,
 * which are UUIDv7s and so ordered by the time they were made. Every view's widgets are
 * normalized on the way out (BR-F08-20), since a deploy may have added or removed widgets.
 * Deletion markers are never returned. Overview is in code and is not here. One statement.
 */
export async function readViews(tx: Tx): Promise<DashboardView[]> {
	const { rows } = await tx.execute<ViewRow>(
		sql`SELECT id, name, widgets, format_version, ${sql.raw(iso("changed_at"))} AS changed_at
			FROM app.dashboard_views WHERE NOT deleted ORDER BY id`,
	);
	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		widgets: normalizeWidgets(row.widgets, row.format_version),
		changedAt: row.changed_at,
	}));
}

/** What one write of a `PUT` did (F08 section 11): applied, or not, and why when the limit
 * was the reason. */
export type ViewResult = { id: string; applied: boolean; reason?: "limit" };

type Stored = { changedAt: string; deleted: boolean };

/**
 * `PUT /api/layout` (F08 BR-F08-22, BR-F08-23): writes each view that is newer than the stored
 * one, in the request's one transaction.
 * 1. The user's views lock, P4's advisory form (D-198), so two requests of one user, which may
 *    both add a view, count and write one after the other; then the user's views are read once.
 * 2. Deletions go first, then the other views in the order sent, so a delete frees a place for
 *    a view sent in the same request.
 * 3. A write whose `changedAt`, held back to the request clock (BR-F08-22), is older than the
 *    stored one is not applied. A tie goes to the later arrival, this one.
 * 4. A write that would make a 6th live view, a deletion marker brought back included, is not
 *    stored: `applied: false`, `reason: "limit"`.
 * 5. The upsert overwrites only a record that is not newer, so a write that lost a race to
 *    another connection answers `applied: false` too. A marker for an id never stored is
 *    stored, so a late edit from another device cannot bring the view back.
 * 6. An id that is another user's is 409 `id_conflict`.
 * 7. Only the `MAX_MARKERS` newest deletion markers are kept: when a request leaves more, the
 *    oldest by change time are deleted, so no client can grow the table (D-636). Live views are
 *    never deleted.
 * Answers one result for each view sent, in the order sent, and the live views as `readViews`
 * returns them after the writes.
 */
export async function writeViews(
	tx: Tx,
	ctx: RequestContext,
	writes: readonly ViewWrite[],
): Promise<{ views: DashboardView[]; results: ViewResult[] }> {
	const lockKey = `${ctx.user.id}:dashboard.views`;
	await tx.execute(
		sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`,
	);
	const { rows } = await tx.execute<{
		id: string;
		deleted: boolean;
		changed_at: string;
	}>(
		sql`SELECT id, deleted, ${sql.raw(iso("changed_at"))} AS changed_at FROM app.dashboard_views`,
	);
	const stored = new Map<string, Stored>(
		rows.map((row) => [
			row.id,
			{ changedAt: row.changed_at, deleted: row.deleted },
		]),
	);
	let live = rows.filter((row) => !row.deleted).length;

	const now = ctx.now.toISOString();
	const outcomes = new Map<string, ViewResult>();
	const order = [
		...writes.filter((write) => write.deleted),
		...writes.filter((write) => !write.deleted),
	];
	for (const write of order) {
		const previous = stored.get(write.id);
		const changedAt = clampChangedAt(write.changedAt, now);
		if (previous && Date.parse(previous.changedAt) > Date.parse(changedAt)) {
			outcomes.set(write.id, { id: write.id, applied: false });
			continue;
		}
		const wasLive = previous !== undefined && !previous.deleted;
		if (!write.deleted && !wasLive && live >= MAX_OWN_VIEWS) {
			outcomes.set(write.id, {
				id: write.id,
				applied: false,
				reason: "limit",
			});
			continue;
		}
		const written = await upsert(tx, ctx, write, changedAt, now);
		outcomes.set(write.id, { id: write.id, applied: written });
		if (!written) continue;
		stored.set(write.id, { changedAt, deleted: write.deleted });
		live += (write.deleted ? 0 : 1) - (wasLive ? 1 : 0);
	}

	const markers = [...stored.values()].filter((each) => each.deleted).length;
	if (markers > MAX_MARKERS) {
		await tx.execute(
			sql`DELETE FROM app.dashboard_views WHERE deleted AND id IN (
					SELECT id FROM app.dashboard_views WHERE deleted
					ORDER BY changed_at DESC, id DESC OFFSET ${MAX_MARKERS})`,
		);
	}

	return {
		views: await readViews(tx),
		results: writes.map((write) => outcomes.get(write.id) as ViewResult),
	};
}

/** One view's upsert: a new row, or a replacement of one that is not newer. `true` when a row
 * was written. A marker has an empty name and no widgets (D-636). */
async function upsert(
	tx: Tx,
	ctx: RequestContext,
	write: ViewWrite,
	changedAt: string,
	now: string,
): Promise<boolean> {
	const name = write.deleted ? "" : write.name;
	const widgets = JSON.stringify(write.deleted ? [] : write.widgets);
	try {
		const { rows } = await tx.execute<{ id: string }>(
			sql`INSERT INTO app.dashboard_views (id, user_id, created_at, updated_at, name, widgets,
					format_version, changed_at, deleted, version)
				VALUES (${write.id}, ${ctx.user.id}, ${now}, ${now}, ${name}, ${widgets}::jsonb,
					${VIEW_FORMAT_VERSION}, ${changedAt}, ${write.deleted}, 1)
				ON CONFLICT (user_id, id) DO UPDATE SET
					name = EXCLUDED.name, widgets = EXCLUDED.widgets,
					format_version = EXCLUDED.format_version, changed_at = EXCLUDED.changed_at,
					deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at,
					version = dashboard_views.version + 1
				WHERE dashboard_views.changed_at <= EXCLUDED.changed_at
				RETURNING id`,
		);
		return rows.length > 0;
	} catch (error) {
		if (databaseErrorOf(error)?.constraint === PRIMARY_KEY) {
			throw new ApiError("id_conflict", { cause: error });
		}
		throw error;
	}
}
