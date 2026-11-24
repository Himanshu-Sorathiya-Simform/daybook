import { randomUUID } from "node:crypto";
import type { Client, Pool, PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { failure, openRuntime, type Row, rolledBack } from "./constraints";
import { connectOwner } from "./owner";
import { createUser } from "./private-rows";

/** The `app.dashboard_views` table (F08 section 3, D-635, D-636): saved Dashboard views and
 * their deletion markers, written through the runtime role with the user context set. Each
 * test rolls back. */

let owner: Client;
let runtime: Pool;
let user: string;
let other: string;

beforeAll(async () => {
	owner = await connectOwner();
	runtime = openRuntime();
	user = await createUser(owner, "dash-views");
	other = await createUser(owner, "dash-views-other");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[user, other],
	]);
	await Promise.all([owner?.end(), runtime?.end()]);
});

const WIDGETS = [
	{ id: "budgets", size: 4, hidden: false },
	{ id: "investments", size: 2, hidden: true },
];

// F08 section 15's illustrated view. The widgets go in as JSON text: `pg` would send a
// JavaScript array as a Postgres array, not as JSON.
const view = (changes: Row = {}, userId = user): Row => ({
	id: randomUUID(),
	user_id: userId,
	name: "Budget watch",
	widgets: JSON.stringify(WIDGETS),
	format_version: 1,
	changed_at: GOLDEN_NOW,
	version: 1,
	created_at: GOLDEN_NOW,
	updated_at: GOLDEN_NOW,
	...changes,
});

/** A deletion marker: an empty name and no widgets (D-636). */
const marker = (changes: Row = {}): Row =>
	view({ name: "", widgets: "[]", deleted: true, ...changes });

function insert(client: Client | PoolClient, row: Row) {
	const columns = Object.keys(row);
	return client.query(
		`INSERT INTO app.dashboard_views (${columns.join(", ")})
		 VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")})`,
		Object.values(row),
	);
}

const asUser = <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> =>
	rolledBack(runtime, user, fn);

/** The SQLSTATE and constraint an insert of `rows`, in order, ends with, or null. */
const refusal = (...rows: Row[]) =>
	asUser(async (client) => {
		for (const row of rows.slice(0, -1)) await insert(client, row);
		return failure(insert(client, rows[rows.length - 1] as Row));
	});

const CHECK = "23514";
const UNIQUE = "23505";
const NOT_NULL = "23502";

const widgetsRefusal = (widgets: unknown, constraint: string) =>
	refusal(view({ widgets: JSON.stringify(widgets) })).then((result) =>
		expect(result).toEqual({ code: CHECK, constraint }),
	);

test("F08 section 15's view inserts and reads back with its widgets as JSON", async () => {
	const stored = await asUser(async (client) => {
		await insert(client, view());
		const result = await client.query<{
			widgets: unknown;
			deleted: boolean;
			format_version: number;
		}>("SELECT widgets, deleted, format_version FROM app.dashboard_views");
		return result.rows;
	});
	expect(stored).toEqual([
		{ widgets: WIDGETS, deleted: false, format_version: 1 },
	]);
});

describe("names (BR-F08-23)", () => {
	test("take 1 to 40 code points", async () => {
		expect(await refusal(view({ name: "👍".repeat(40) }))).toBeNull();
		expect(await refusal(view({ name: "A" }))).toBeNull();
		for (const name of ["", "👍".repeat(41)]) {
			expect(await refusal(view({ name }))).toEqual({
				code: CHECK,
				constraint: "dashboard_views_name_text",
			});
		}
	});

	test.each([
		["a tab", "Budget\twatch"],
		["a line feed", "Budget\nwatch"],
		["a C1 control", "Budget\u0085watch"],
		["text not in NFC", "Cafe\u0301"],
	])("refuse %s", async (_name, name) => {
		expect(await refusal(view({ name }))).toEqual({
			code: CHECK,
			constraint: "dashboard_views_name_text",
		});
	});

	test("may repeat for one user and across users", async () => {
		expect(
			await refusal(view({ name: "My view" }), view({ name: "My view" })),
		).toBeNull();
		await owner.query("BEGIN");
		try {
			await insert(owner, view({ name: "My view" }));
			expect(
				await failure(insert(owner, view({ name: "My view" }, other))),
			).toBeNull();
		} finally {
			await owner.query("ROLLBACK");
		}
	});
});

describe("deletion markers (D-636)", () => {
	test("keep an empty name and no widgets", async () => {
		expect(await refusal(marker())).toBeNull();
		const stored = await asUser(async (client) => {
			await insert(client, marker());
			const result = await client.query<{ name: string; widgets: unknown }>(
				"SELECT name, widgets FROM app.dashboard_views WHERE deleted",
			);
			return result.rows;
		});
		expect(stored).toEqual([{ name: "", widgets: [] }]);
	});

	test("refuse a name", async () => {
		expect(await refusal(marker({ name: "Budget watch" }))).toEqual({
			code: CHECK,
			constraint: "dashboard_views_name_text",
		});
	});

	test("refuse widgets", async () => {
		expect(await refusal(marker({ widgets: JSON.stringify(WIDGETS) }))).toEqual({
			code: CHECK,
			constraint: "dashboard_views_widgets_array",
		});
	});

	test("a live view with an empty name or an empty widget list is checked as a live one", async () => {
		expect(await refusal(view({ name: "" }))).toEqual({
			code: CHECK,
			constraint: "dashboard_views_name_text",
		});
		// No widgets is for the normalization to repair on read (BR-F08-20), not the table.
		expect(await refusal(view({ widgets: "[]" }))).toBeNull();
	});
});

describe("widgets (BR-F08-20, BR-F08-23)", () => {
	test("are a JSON array", async () => {
		for (const widgets of [{}, "budgets", 3, null, true]) {
			expect(
				await refusal(view({ widgets: JSON.stringify(widgets) })),
			).toEqual({ code: CHECK, constraint: "dashboard_views_widgets_array" });
		}
	});

	test("may not be missing", async () => {
		expect(await refusal(view({ widgets: null }))).toEqual({
			code: NOT_NULL,
			constraint: null,
		});
	});

	test("hold at most 50 entries", async () => {
		const entries = (count: number) =>
			Array.from({ length: count }, (_, index) => ({
				id: `widget-${index}`,
				size: 2,
				hidden: false,
			}));
		expect(
			await refusal(view({ widgets: JSON.stringify(entries(50)) })),
		).toBeNull();
		await widgetsRefusal(entries(51), "dashboard_views_widgets_count");
	});

	test("accept every size the registry knows and the table leaves the registry's list to the code", async () => {
		for (const size of [2, 3, 4, 6, 5, 0, -1, 1000]) {
			expect(
				await refusal(
					view({
						widgets: JSON.stringify([{ id: "x", size, hidden: false }]),
					}),
				),
			).toBeNull();
		}
	});

	test.each([
		["an entry that is a string", ["budgets"]],
		["an entry that is an array", [["budgets", 4, false]]],
		["an entry that is null", [null]],
		["an entry with no hidden flag", [{ id: "budgets", size: 4 }]],
		["an entry with no size", [{ id: "budgets", hidden: false }]],
		["an entry with no id", [{ size: 4, hidden: false }]],
		[
			"an entry with a field of its own",
			[{ id: "budgets", size: 4, hidden: false, title: "x" }],
		],
		["a size with a fraction", [{ id: "budgets", size: 2.5, hidden: false }]],
		["a size written as text", [{ id: "budgets", size: "4", hidden: false }]],
		["a size that is null", [{ id: "budgets", size: null, hidden: false }]],
		["a hidden flag written as text", [{ id: "a", size: 4, hidden: "no" }]],
		["a hidden flag that is a number", [{ id: "a", size: 4, hidden: 0 }]],
		["an id that is a number", [{ id: 4, size: 4, hidden: false }]],
		["an empty id", [{ id: "", size: 4, hidden: false }]],
		["an id of 65 characters", [{ id: "a".repeat(65), size: 4, hidden: false }]],
		["one bad entry among good ones", [...WIDGETS, { id: "x", size: 4 }]],
	])("refuse %s", async (_name, widgets) => {
		await widgetsRefusal(widgets, "dashboard_views_widgets_entries");
	});

	test("accept an id of 1 and of 64 characters", async () => {
		for (const id of ["a", "a".repeat(64)]) {
			expect(
				await refusal(
					view({
						widgets: JSON.stringify([{ id, size: 4, hidden: false }]),
					}),
				),
			).toBeNull();
		}
	});
});

describe("the other columns", () => {
	test.each([
		["version", 0],
		["version", -1],
	])("refuse %s %j", async (column, value) => {
		expect(await refusal(view({ [column]: value }))).toEqual({
			code: CHECK,
			constraint: "dashboard_views_version_positive",
		});
	});

	test.each(["format_version", "changed_at", "name"])(
		"%s may not be missing",
		async (column) => {
			expect(await refusal(view({ [column]: null }))).toEqual({
				code: NOT_NULL,
				constraint: null,
			});
		},
	);

	test("a view is live unless it says it is deleted", async () => {
		const stored = await asUser(async (client) => {
			await insert(client, view());
			const result = await client.query<{ deleted: boolean }>(
				"SELECT deleted FROM app.dashboard_views",
			);
			return result.rows;
		});
		expect(stored).toEqual([{ deleted: false }]);
	});
});

describe("ids (ID-1)", () => {
	test("a user's id is stored once", async () => {
		const id = randomUUID();
		const result = await refusal(view({ id }), view({ id }));
		expect(result?.code).toBe(UNIQUE);
	});

	// The data access layer answers this as a conflict and never reads the other row.
	test("another user's id is refused by the primary key, without a read of their row", async () => {
		const id = randomUUID();
		// Committed, since the runtime connection cannot see an open transaction's row.
		await insert(owner, view({ id }));
		try {
			const result = await rolledBack(runtime, other, (client) =>
				failure(insert(client, view({ id }, other))),
			);
			expect(result).toEqual({
				code: UNIQUE,
				constraint: "dashboard_views_pkey",
			});
		} finally {
			await owner.query("DELETE FROM app.dashboard_views WHERE id = $1", [id]);
		}
	});
});

// BR-F08-22: the upsert that overwrites only an older record, on the key `(user_id, id)`.
describe("the last-write-wins upsert (BR-F08-22, D-279)", () => {
	const UPSERT = `INSERT INTO app.dashboard_views
		(id, user_id, created_at, updated_at, name, widgets, format_version, changed_at, deleted, version)
		VALUES ($1, $2, $3, $3, $4, $5, 1, $6, $7, 1)
		ON CONFLICT (user_id, id) DO UPDATE SET
			name = EXCLUDED.name, widgets = EXCLUDED.widgets, changed_at = EXCLUDED.changed_at,
			deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at,
			version = dashboard_views.version + 1
		WHERE dashboard_views.changed_at <= EXCLUDED.changed_at
		RETURNING name, deleted, version`;
	const NINE = "2026-11-02T03:30:00.000Z";
	const TEN = "2026-11-02T04:30:00.000Z";

	const write = (
		client: PoolClient,
		id: string,
		name: string,
		changedAt: string,
		deleted = false,
	) =>
		client.query<{ name: string; deleted: boolean; version: number }>(UPSERT, [
			id,
			user,
			GOLDEN_NOW,
			name,
			deleted ? "[]" : JSON.stringify(WIDGETS),
			changedAt,
			deleted,
		]);

	test("a newer write replaces an older one and adds 1 to the version", async () => {
		const id = randomUUID();
		const second = await asUser(async (client) => {
			await write(client, id, "Nine", NINE);
			return write(client, id, "Ten", TEN);
		});
		expect(second.rows).toEqual([{ name: "Ten", deleted: false, version: 2 }]);
	});

	test("an older write changes nothing and returns no row", async () => {
		const id = randomUUID();
		const { late, stored } = await asUser(async (client) => {
			await write(client, id, "Ten", TEN);
			const late = await write(client, id, "Nine", NINE);
			const stored = await client.query<{ name: string }>(
				"SELECT name FROM app.dashboard_views WHERE id = $1",
				[id],
			);
			return { late, stored };
		});
		expect(late.rows).toEqual([]);
		expect(stored.rows).toEqual([{ name: "Ten" }]);
	});

	test("a tie goes to the later arrival", async () => {
		const id = randomUUID();
		const second = await asUser(async (client) => {
			await write(client, id, "First", TEN);
			return write(client, id, "Second", TEN);
		});
		expect(second.rows).toEqual([
			{ name: "Second", deleted: false, version: 2 },
		]);
	});

	test("a later deletion beats an edit, and a still later edit brings the view back", async () => {
		const id = randomUUID();
		const { gone, back } = await asUser(async (client) => {
			await write(client, id, "Nine", NINE);
			const gone = await write(client, id, "", TEN, true);
			const back = await write(
				client,
				id,
				"Again",
				"2026-11-02T05:30:00.000Z",
			);
			return { gone, back };
		});
		expect(gone.rows).toEqual([{ name: "", deleted: true, version: 2 }]);
		expect(back.rows).toEqual([{ name: "Again", deleted: false, version: 3 }]);
	});

	test("an earlier edit does not bring a deleted view back", async () => {
		const id = randomUUID();
		const late = await asUser(async (client) => {
			await write(client, id, "", TEN, true);
			return write(client, id, "Nine", NINE);
		});
		expect(late.rows).toEqual([]);
	});

	test("a deletion marker for an id never stored is stored", async () => {
		const id = randomUUID();
		const stored = await asUser(async (client) => {
			await write(client, id, "", TEN, true);
			const result = await client.query<{ deleted: boolean }>(
				"SELECT deleted FROM app.dashboard_views WHERE id = $1",
				[id],
			);
			return result.rows;
		});
		expect(stored).toEqual([{ deleted: true }]);
	});
});

test("the primary key and the user-and-id key are the only indexes", async () => {
	const result = await owner.query<{ indexname: string; indexdef: string }>(
		`SELECT indexname, indexdef FROM pg_indexes
		 WHERE schemaname = 'app' AND tablename = 'dashboard_views' ORDER BY indexname`,
	);
	const indexes = Object.fromEntries(
		result.rows.map((row) => [row.indexname, row.indexdef]),
	);
	expect(Object.keys(indexes)).toEqual([
		"dashboard_views_pkey",
		"dashboard_views_user_id_id_key",
	]);
	expect(indexes["dashboard_views_user_id_id_key"]).toContain("UNIQUE INDEX");
	expect(indexes["dashboard_views_user_id_id_key"]).toContain("(user_id, id)");
});

test("deleting the user removes their views and markers without a foreign-key error", async () => {
	const doomed = await createUser(owner, "dash-views-delete");
	await owner.query("BEGIN");
	try {
		await insert(owner, view({}, doomed));
		await insert(owner, marker({ user_id: doomed }));
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
		const left = await owner.query<{ count: string }>(
			"SELECT count(*) FROM app.dashboard_views WHERE user_id = $1",
			[doomed],
		);
		expect(Number(left.rows[0]?.count)).toBe(0);
	} finally {
		await owner.query("ROLLBACK");
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
	}
});
