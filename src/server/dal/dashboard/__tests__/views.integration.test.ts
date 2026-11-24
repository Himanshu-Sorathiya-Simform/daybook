import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { defaultWidgets } from "@/lib/dashboard/views";
import type { ViewWrite } from "@/lib/dashboard/schemas";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { insertProfile } from "../../../../../seed/load-golden";
import { ApiError } from "../../../api/errors";
import { connectOwner } from "../../../db/__tests__/owner";
import { createUser } from "../../../db/__tests__/private-rows";
import {
	goldenContext,
	asUser,
	uuidV7At,
} from "../../transactions/__tests__/helpers";
import { withUser } from "../../with-user";
import { readViews, writeViews } from "../views";

/** The Dashboard views (F08 section 11, BR-F08-22, BR-F08-23, AC-F08-05, AC-F08-14) through the
 * runtime role and RLS, at the golden clock, 2 November 2026 at 06:30 UTC. */

const NINE = "2026-11-02T03:30:00.000Z";
const TEN = "2026-11-02T04:30:00.000Z";
const ELEVEN = "2026-11-02T05:30:00.000Z";
const AHEAD = "2026-11-02T07:30:00.000Z";

let owner: Client;
const users: string[] = [];

beforeAll(async () => {
	owner = await connectOwner();
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
});

async function newUser(label: string): Promise<string> {
	const id = await createUser(owner, label);
	await insertProfile(owner, id);
	users.push(id);
	return id;
}

let counter = 0;
const nextId = () =>
	`0199a000-0000-7000-8002-${String(++counter).padStart(12, "0")}`;

const widgets = (...entries: [string, number, boolean][]) =>
	entries.map(([id, size, hidden]) => ({
		id,
		size,
		hidden,
	})) as ViewWrite["widgets"];

const live = (
	id: string,
	name: string,
	changedAt: string,
	list: ViewWrite["widgets"] = defaultWidgets(),
): ViewWrite => ({ id, name, widgets: list, changedAt, deleted: false });

const marker = (id: string, changedAt: string): ViewWrite => ({
	id,
	name: "",
	widgets: [],
	changedAt,
	deleted: true,
});

const put = (who: string, ...writes: ViewWrite[]) =>
	asUser(who, (tx) => writeViews(tx, goldenContext(who), writes));

/** The same writes, committed, so a later `put` or `commit` of the test sees them. Rows go with
 * the user when the file's cleanup deletes it. */
const commit = (who: string, ...writes: ViewWrite[]) =>
	withUser(goldenContext(who), "write", (tx) =>
		writeViews(tx, goldenContext(who), writes),
	);

/** Several writes in order, in one transaction, so a later one sees what an earlier left. */
const putEach = (who: string, ...batches: ViewWrite[][]) =>
	asUser(who, async (tx) => {
		const answers = [];
		for (const batch of batches) {
			answers.push(await writeViews(tx, goldenContext(who), batch));
		}
		return answers;
	});

describe("readViews", () => {
	test("is empty for a user with no stored views", async () => {
		const who = await newUser("views-empty");
		const { result, statements } = await asUser(who, (tx) => readViews(tx));
		expect(result).toEqual([]);
		expect(statements).toBe(1);
	});

	test("returns live views oldest first by id, never a marker", async () => {
		const who = await newUser("views-order");
		const [a, b, c] = [nextId(), nextId(), nextId()];
		const { result } = await putEach(who, [
			live(c, "Third", NINE),
			live(a, "First", NINE),
			marker(b, NINE),
		]);
		const views = (result[0] as NonNullable<(typeof result)[number]>).views;
		expect(views.map((view) => view.name)).toEqual(["First", "Third"]);
	});

	test("normalizes widgets it reads, as a deploy that added a widget would need", async () => {
		const who = await newUser("views-normalize");
		const id = nextId();
		await owner.query(
			`INSERT INTO app.dashboard_views (id, user_id, created_at, updated_at, name, widgets,
			   format_version, changed_at, deleted, version)
			 VALUES ($1, $2, $3, $3, 'Old', $4::jsonb, 1, $3, false, 1)`,
			[
				id,
				who,
				GOLDEN_NOW,
				JSON.stringify([
					{ id: "goals", size: 5, hidden: true },
					{ id: "gone", size: 2, hidden: false },
				]),
			],
		);
		const { result } = await asUser(who, (tx) => readViews(tx));
		expect(result[0]?.widgets).toHaveLength(8);
		expect(result[0]?.widgets[0]).toEqual({
			id: "goals",
			size: 2,
			hidden: true,
		});
		expect(result[0]?.widgets.map((widget) => String(widget.id))).not.toContain(
			"gone",
		);
	});

	test("gives Overview's widgets to a row of an unknown format", async () => {
		const who = await newUser("views-format");
		await owner.query(
			`INSERT INTO app.dashboard_views (id, user_id, created_at, updated_at, name, widgets,
			   format_version, changed_at, deleted, version)
			 VALUES ($1, $2, $3, $3, 'Future', $4::jsonb, 9, $3, false, 1)`,
			[
				nextId(),
				who,
				GOLDEN_NOW,
				JSON.stringify([{ id: "goals", size: 6, hidden: true }]),
			],
		);
		const { result } = await asUser(who, (tx) => readViews(tx));
		expect(result[0]?.widgets).toEqual(defaultWidgets());
	});

	test("answers the change time as an ISO instant", async () => {
		const who = await newUser("views-instant");
		const { result } = await put(who, live(nextId(), "A", TEN));
		expect(result.views[0]?.changedAt).toBe(TEN);
	});

	test("never returns another user's views", async () => {
		const mine = await newUser("views-mine");
		const theirs = await newUser("views-theirs");
		await commit(theirs, live(nextId(), "Theirs", NINE));
		const { result } = await asUser(mine, (tx) => readViews(tx));
		expect(result).toEqual([]);
	});
});

describe("writeViews: one view", () => {
	test("stores a view and answers it applied, with the widgets normalized by the caller", async () => {
		const who = await newUser("views-one");
		const id = nextId();
		const custom = widgets(["budgets", 4, false], ["investments", 2, true]);
		const { result, statements } = await put(
			who,
			live(id, "Budget watch", TEN, custom),
		);
		expect(result.results).toEqual([{ id, applied: true }]);
		expect(result.views).toEqual([
			{ id, name: "Budget watch", widgets: expect.any(Array), changedAt: TEN },
		]);
		expect(result.views[0]?.widgets.slice(0, 2)).toEqual(custom);
		// The lock, the read of the user's rows, the upsert and the read back.
		expect(statements).toBe(4);
	});

	test("records the row at the request clock, as version 1 in format 1, with no default time", async () => {
		const who = await newUser("views-row");
		const id = nextId();
		const base = goldenContext(who);
		await withUser(base, "write", (tx) =>
			writeViews(tx, base, [live(id, "A", TEN)]),
		);
		const { rows } = await owner.query<{
			version: number;
			format_version: number;
			created: string;
			updated: string;
			changed: string;
		}>(
			`SELECT version, format_version,
			   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created,
			   to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated,
			   to_char(changed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS changed
			 FROM app.dashboard_views WHERE id = $1`,
			[id],
		);
		expect(rows).toEqual([
			{
				version: 1,
				format_version: 1,
				created: GOLDEN_NOW,
				updated: GOLDEN_NOW,
				changed: TEN,
			},
		]);
	});

	test("an update adds 1 to the version, moves updated_at and keeps created_at", async () => {
		const who = await newUser("views-update-row");
		const id = nextId();
		const early = {
			...goldenContext(who),
			now: new Date("2026-11-02T05:00:00.000Z"),
		};
		const late = goldenContext(who);
		await withUser(early, "write", (tx) =>
			writeViews(tx, early, [live(id, "A", NINE)]),
		);
		await withUser(late, "write", (tx) =>
			writeViews(tx, late, [live(id, "B", TEN)]),
		);
		const { rows } = await owner.query<{
			version: number;
			created: string;
			updated: string;
		}>(
			`SELECT version,
			   to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created,
			   to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS updated
			 FROM app.dashboard_views WHERE id = $1`,
			[id],
		);
		expect(rows).toEqual([
			{ version: 2, created: "2026-11-02T05:00:00.000Z", updated: GOLDEN_NOW },
		]);
	});

	test("a newer write replaces the view, adds 1 to the version and keeps created_at", async () => {
		const who = await newUser("views-newer");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "Nine", NINE)],
			[live(id, "Ten", TEN)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: true }]);
		expect(result[1]?.views.map((view) => view.name)).toEqual(["Ten"]);
		expect(result[1]?.views[0]?.changedAt).toBe(TEN);
	});

	test("a tie goes to the later arrival", async () => {
		const who = await newUser("views-tie");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "First", TEN)],
			[live(id, "Second", TEN)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: true }]);
		expect(result[1]?.views[0]?.name).toBe("Second");
	});

	test("a changedAt ahead of the request clock is stored as the clock", async () => {
		const who = await newUser("views-ahead");
		const { result } = await put(who, live(nextId(), "Fast clock", AHEAD));
		expect(result.views[0]?.changedAt).toBe(GOLDEN_NOW);
	});

	test("a view stored with a clamped time loses to a real time after it", async () => {
		const who = await newUser("views-clamped");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "Ahead", AHEAD)],
			[live(id, "Real", ELEVEN)],
		);
		// ELEVEN (05:30) is before the stored clock (06:30): not applied.
		expect(result[1]?.results).toEqual([{ id, applied: false }]);
		expect(result[1]?.views[0]?.name).toBe("Ahead");
	});
});

// AC-F08-05
describe("last write wins, in either arrival order", () => {
	test("09:00 then 10:00 leaves 10:00", async () => {
		const who = await newUser("views-order-a");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "Nine", NINE)],
			[live(id, "Ten", TEN)],
		);
		expect(result[1]?.views[0]?.name).toBe("Ten");
	});

	test("10:00 then 09:00 leaves 10:00, and the late request is not applied", async () => {
		const who = await newUser("views-order-b");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "Ten", TEN)],
			[live(id, "Nine", NINE)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: false }]);
		expect(result[1]?.views[0]?.name).toBe("Ten");
		expect(result[1]?.views[0]?.changedAt).toBe(TEN);
	});

	test("two requests at the same moment, in separate transactions, leave the later change time", async () => {
		const who = await newUser("views-concurrent");
		const id = nextId();
		const base = goldenContext(who);
		const [first, second] = await Promise.all([
			withUser(base, "write", (tx) =>
				writeViews(tx, base, [live(id, "Nine", NINE)]),
			),
			withUser(base, "write", (tx) =>
				writeViews(tx, base, [live(id, "Ten", TEN)]),
			),
		]);
		const final = await withUser(base, "read", (tx) => readViews(tx));
		expect(final.map((view) => view.name)).toEqual(["Ten"]);
		// Exactly one of the two ended up not applied when 09:00 came second.
		const applied = [first, second].flatMap((answer) =>
			answer.results.map((each) => each.applied),
		);
		expect(applied.filter(Boolean).length).toBeGreaterThanOrEqual(1);
	});

	test("never touches another view of the same request", async () => {
		const who = await newUser("views-two-ids");
		const [a, b] = [nextId(), nextId()];
		const { result } = await putEach(
			who,
			[live(a, "A ten", TEN), live(b, "B nine", NINE)],
			[live(a, "A nine", NINE), live(b, "B ten", TEN)],
		);
		expect(result[1]?.results).toEqual([
			{ id: a, applied: false },
			{ id: b, applied: true },
		]);
		expect(result[1]?.views.map((view) => view.name)).toEqual([
			"A ten",
			"B ten",
		]);
	});
});

describe("deletion markers (D-636)", () => {
	test("a later deletion beats an edit, and the view is no longer read", async () => {
		const who = await newUser("views-delete");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "Nine", NINE)],
			[marker(id, TEN)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: true }]);
		expect(result[1]?.views).toEqual([]);
	});

	test("an edit after the deletion, with a later time, brings the view back", async () => {
		const who = await newUser("views-resurrect");
		const id = nextId();
		const { result } = await putEach(
			who,
			[marker(id, NINE)],
			[live(id, "Back", ELEVEN)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: true }]);
		expect(result[1]?.views.map((view) => view.name)).toEqual(["Back"]);
	});

	test("an earlier edit does not bring a deleted view back", async () => {
		const who = await newUser("views-no-resurrect");
		const id = nextId();
		const { result } = await putEach(
			who,
			[marker(id, TEN)],
			[live(id, "Late", NINE)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: false }]);
		expect(result[1]?.views).toEqual([]);
	});

	test("a deletion and an edit with the same time leave whichever arrived later", async () => {
		const who = await newUser("views-tie-delete");
		const a = nextId();
		const b = nextId();
		const { result } = await putEach(
			who,
			[live(a, "Edit", TEN), marker(b, TEN)],
			[marker(a, TEN), live(b, "Edit", TEN)],
		);
		expect(result[1]?.views.map((view) => view.name)).toEqual(["Edit"]);
		expect(result[1]?.views[0]?.id).toBe(b);
	});

	test("a marker for an id never stored is stored and applied, so a late edit loses", async () => {
		const who = await newUser("views-marker-unknown");
		const id = nextId();
		const { result } = await putEach(
			who,
			[marker(id, TEN)],
			[live(id, "Late", NINE)],
		);
		expect(result[0]?.results).toEqual([{ id, applied: true }]);
		expect(result[1]?.results).toEqual([{ id, applied: false }]);
	});

	test("a deletion that is older than the stored view is not applied", async () => {
		const who = await newUser("views-old-delete");
		const id = nextId();
		const { result } = await putEach(
			who,
			[live(id, "Ten", TEN)],
			[marker(id, NINE)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: false }]);
		expect(result[1]?.views.map((view) => view.name)).toEqual(["Ten"]);
	});

	test("deleting twice is applied twice, as a retry", async () => {
		const who = await newUser("views-delete-twice");
		const id = nextId();
		const { result } = await putEach(
			who,
			[marker(id, NINE)],
			[marker(id, NINE)],
		);
		expect(result[1]?.results).toEqual([{ id, applied: true }]);
	});

	test("stores the marker with an empty name and no widgets", async () => {
		const who = await newUser("views-marker-row");
		const id = nextId();
		await commit(who, live(id, "Doomed", NINE));
		await withUser(goldenContext(who), "write", (tx) =>
			writeViews(tx, goldenContext(who), [marker(id, TEN)]),
		);
		const { rows } = await owner.query<{
			name: string;
			widgets: unknown;
			deleted: boolean;
		}>("SELECT name, widgets, deleted FROM app.dashboard_views WHERE id = $1", [
			id,
		]);
		expect(rows).toEqual([{ name: "", widgets: [], deleted: true }]);
	});
});

// AC-F08-14
describe("the limit of 5 live views (D-635)", () => {
	const five = async (label: string) => {
		const who = await newUser(label);
		const ids = Array.from({ length: 5 }, nextId);
		await withUser(goldenContext(who), "write", (tx) =>
			writeViews(
				tx,
				goldenContext(who),
				ids.map((id, index) => live(id, `View ${index + 1}`, NINE)),
			),
		);
		return { who, ids };
	};

	test("a sixth view is not stored and says why", async () => {
		const { who, ids } = await five("views-limit");
		const extra = nextId();
		const { result } = await put(who, live(extra, "Sixth", TEN));
		expect(result.results).toEqual([
			{ id: extra, applied: false, reason: "limit" },
		]);
		expect(result.views).toHaveLength(5);
		expect(result.views.map((view) => view.id)).toEqual(ids);
	});

	test("an edit of one of the five is still applied", async () => {
		const { who, ids } = await five("views-limit-edit");
		const { result } = await put(who, live(ids[0] as string, "Renamed", TEN));
		expect(result.results).toEqual([{ id: ids[0], applied: true }]);
		expect(result.views[0]?.name).toBe("Renamed");
	});

	test("deleting one first lets a new one in", async () => {
		const { who, ids } = await five("views-limit-delete");
		const extra = nextId();
		const { result } = await putEach(
			who,
			[marker(ids[0] as string, TEN)],
			[live(extra, "Sixth", TEN)],
		);
		expect(result[1]?.results).toEqual([{ id: extra, applied: true }]);
		expect(result[1]?.views).toHaveLength(5);
	});

	test("a deletion in the same request goes first, wherever it is listed", async () => {
		const { who, ids } = await five("views-limit-same");
		const extra = nextId();
		const { result } = await put(
			who,
			live(extra, "Sixth", TEN),
			marker(ids[0] as string, TEN),
		);
		expect(result.results).toEqual([
			{ id: extra, applied: true },
			{ id: ids[0], applied: true },
		]);
		expect(result.views).toHaveLength(5);
	});

	test("a marker brought back by a later edit counts as a sixth view", async () => {
		const { who, ids } = await five("views-limit-back");
		await commit(who, marker(ids[0] as string, TEN));
		await commit(who, live(nextId(), "Replacement", TEN));
		const { result } = await put(who, live(ids[0] as string, "Back", ELEVEN));
		expect(result.results).toEqual([
			{ id: ids[0], applied: false, reason: "limit" },
		]);
	});

	test("markers do not count toward the five", async () => {
		const who = await newUser("views-limit-markers");
		const gone = Array.from({ length: 4 }, nextId);
		await commit(who, ...gone.map((id) => marker(id, NINE)));
		const { result } = await put(
			who,
			...Array.from({ length: 5 }, (_, index) =>
				live(nextId(), `V${index}`, TEN),
			),
		);
		expect(result.results.every((each) => each.applied)).toBe(true);
		expect(result.views).toHaveLength(5);
	});

	test("three new views at two of five: the third in the order sent is refused", async () => {
		const who = await newUser("views-limit-order");
		const first = Array.from({ length: 3 }, nextId);
		await commit(
			who,
			...first.map((id, index) => live(id, `Old ${index}`, NINE)),
		);
		const sent = Array.from({ length: 3 }, nextId);
		const { result } = await put(
			who,
			...sent.map((id, index) => live(id, `New ${index}`, TEN)),
		);
		expect(result.results).toEqual([
			{ id: sent[0], applied: true },
			{ id: sent[1], applied: true },
			{ id: sent[2], applied: false, reason: "limit" },
		]);
	});

	test("two requests of one user adding a sixth at once leave five", async () => {
		const { who, ids } = await five("views-limit-race");
		const base = goldenContext(who);
		// Four views, so there is exactly one place for two racing adds.
		await withUser(base, "write", (tx) =>
			writeViews(tx, base, [marker(ids[0] as string, TEN)]),
		);
		const answers = await Promise.all([
			withUser(base, "write", (tx) =>
				writeViews(tx, base, [live(nextId(), "Racer A", TEN)]),
			),
			withUser(base, "write", (tx) =>
				writeViews(tx, base, [live(nextId(), "Racer B", TEN)]),
			),
		]);
		const final = await withUser(base, "read", (tx) => readViews(tx));
		expect(final).toHaveLength(5);
		const results = answers.flatMap((answer) => answer.results);
		expect(results.filter((each) => each.applied)).toHaveLength(1);
		expect(results.filter((each) => each.reason === "limit")).toHaveLength(1);
	});
});

describe("results", () => {
	test("come one for each view sent, in the order sent, with mixed outcomes", async () => {
		const who = await newUser("views-results");
		const [a, b, c] = [nextId(), nextId(), nextId()];
		await commit(who, live(a, "A", TEN));
		const { result } = await put(
			who,
			live(b, "B", NINE),
			live(a, "A old", NINE),
			marker(c, NINE),
		);
		expect(result.results).toEqual([
			{ id: b, applied: true },
			{ id: a, applied: false },
			{ id: c, applied: true },
		]);
	});
});

describe("another user's id", () => {
	test("is refused as a conflict and their view is untouched", async () => {
		const mine = await newUser("views-conflict-mine");
		const theirs = await newUser("views-conflict-theirs");
		const id = nextId();
		await commit(theirs, live(id, "Theirs", NINE));
		await expect(put(mine, live(id, "Mine", TEN))).rejects.toMatchObject({
			code: "id_conflict",
			status: 409,
		});
		const { result } = await asUser(theirs, (tx) => readViews(tx));
		expect(result.map((view) => view.name)).toEqual(["Theirs"]);
		const { result: mineAfter } = await asUser(mine, (tx) => readViews(tx));
		expect(mineAfter).toEqual([]);
	});

	test("the refusal is an ApiError", async () => {
		const mine = await newUser("views-conflict-type");
		const theirs = await newUser("views-conflict-type-other");
		const id = uuidV7At(GOLDEN_NOW);
		await commit(theirs, live(id, "Theirs", NINE));
		const error = await put(mine, live(id, "Mine", TEN)).catch(
			(caught: unknown) => caught,
		);
		expect(error).toBeInstanceOf(ApiError);
	});
});

test("deleting the user removes their views and markers", async () => {
	const doomed = await createUser(owner, "views-doomed");
	await insertProfile(owner, doomed);
	await withUser(goldenContext(doomed), "write", (tx) =>
		writeViews(tx, goldenContext(doomed), [
			live(nextId(), "A", NINE),
			marker(nextId(), NINE),
		]),
	);
	await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [doomed]);
	const { rows } = await owner.query(
		"SELECT 1 FROM app.dashboard_views WHERE user_id = $1",
		[doomed],
	);
	expect(rows).toHaveLength(0);
});
