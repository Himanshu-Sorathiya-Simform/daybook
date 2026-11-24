import { randomUUIDv7 } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { insertProfile } from "../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import {
	closeOwner,
	connectOwner,
	dataOf,
	errorOf,
	expectCrossOriginRefused,
	expectSessionRefusals,
	freezeGoldenClock,
	sentTwiceWithOneKey,
	type SignedIn,
} from "@/server/api/__tests__/endpoint";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { defaultWidgets } from "@/lib/dashboard/views";
import { GET, PUT } from "../route";

/** `GET` and `PUT /api/layout` (F08 section 11) through the route wrapper, real sessions and the
 * golden clock. The rules are tested on `readViews` and `writeViews`; these show each answer
 * the wrapper gives. */

let owner: Client;
let noProfile: SignedIn;
const users: string[] = [];

const NINE = "2026-11-02T03:30:00.000Z";
const TEN = "2026-11-02T04:30:00.000Z";

let counter = 0;
const nextId = () =>
	`0199a000-0000-7000-8003-${String(++counter).padStart(12, "0")}`;

beforeAll(async () => {
	owner = await connectOwner();
	noProfile = await signedInUser(owner, "layout-route-new");
	users.push(noProfile.id);
});

afterAll(() => closeOwner(owner, users));

freezeGoldenClock();

async function freshUser(label: string): Promise<SignedIn> {
	const user = await signedInUser(owner, label);
	users.push(user.id);
	await insertProfile(owner, user.id);
	return user;
}

const view = (
	id: string,
	name: string,
	changedAt: string,
	extra: Record<string, unknown> = {},
) => ({
	id,
	name,
	widgets: [
		{ id: "budgets", size: 4, hidden: false },
		{ id: "investments", size: 2, hidden: true },
	],
	changedAt,
	deleted: false,
	...extra,
});

const marker = (id: string, changedAt: string) => ({ id, changedAt, deleted: true });

const put = (
	input: unknown,
	{
		cookie,
		headers = {},
	}: { cookie: string | null; headers?: Record<string, string | null> },
) =>
	call(PUT, "/api/layout", {
		method: "PUT",
		body: input,
		headers,
		...(cookie === null ? {} : { cookie }),
	});

const body = (views: unknown[], formatVersion = 1) => ({ formatVersion, views });

const read = (cookie: string | null) =>
	call(GET, "/api/layout", cookie === null ? {} : { cookie });

type Layout = {
	views: { id: string; name: string; widgets: unknown[]; changedAt: string }[];
};
type Written = Layout & {
	results: { id: string; applied: boolean; reason?: string }[];
};

describe("GET /api/layout", () => {
	test("answers no views for a user who has made none; Overview is in code", async () => {
		const user = await freshUser("layout-route-empty");
		const { status, body: answer } = await read(user.cookie);
		expect(status).toBe(200);
		expect(answer).toEqual({ data: { views: [] } });
	});

	test("answers the user's live views, oldest first, with normalized widgets", async () => {
		const user = await freshUser("layout-route-read");
		const [a, b] = [nextId(), nextId()];
		await put(body([view(b, "Second", TEN), view(a, "First", NINE)]), {
			cookie: user.cookie,
		});
		const { body: answer } = await read(user.cookie);
		const { views } = dataOf<Layout>(answer);
		expect(views.map((each) => each.name)).toEqual(["First", "Second"]);
		expect(views[0]?.widgets).toHaveLength(8);
		expect(views[0]?.widgets.slice(0, 2)).toEqual([
			{ id: "budgets", size: 4, hidden: false },
			{ id: "investments", size: 2, hidden: true },
		]);
		expect(views[0]?.changedAt).toBe(NINE);
	});

	test("never lists a deleted view", async () => {
		const user = await freshUser("layout-route-deleted");
		const id = nextId();
		await put(body([view(id, "Doomed", NINE)]), { cookie: user.cookie });
		await put(body([marker(id, TEN)]), { cookie: user.cookie });
		expect(dataOf<Layout>((await read(user.cookie)).body).views).toEqual([]);
	});

	test("never lists another user's views", async () => {
		const mine = await freshUser("layout-route-mine");
		const theirs = await freshUser("layout-route-theirs");
		await put(body([view(nextId(), "Theirs", NINE)]), { cookie: theirs.cookie });
		expect(dataOf<Layout>((await read(mine.cookie)).body).views).toEqual([]);
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		expect((await read(null)).status).toBe(401);
		const { status, body: answer } = await read(noProfile.cookie);
		expect(status).toBe(403);
		expect(errorOf(answer).code).toBe("profile_required");
	});
});

// AC-F08-05, AC-F08-14
describe("PUT /api/layout", () => {
	test("answers 200 with each view's result and the live views after the write", async () => {
		const user = await freshUser("layout-route-put");
		const id = nextId();
		const { status, body: answer } = await put(
			body([view(id, "Budget watch", TEN)]),
			{
				cookie: user.cookie,
			},
		);
		expect(status).toBe(200);
		const data = dataOf<Written>(answer);
		expect(data.results).toEqual([{ id, applied: true }]);
		expect(data.views.map((each) => each.name)).toEqual(["Budget watch"]);
	});

	test("an older write is not applied, and the stored view comes back", async () => {
		const user = await freshUser("layout-route-older");
		const id = nextId();
		await put(body([view(id, "Ten", TEN)]), { cookie: user.cookie });
		const { body: answer } = await put(body([view(id, "Nine", NINE)]), {
			cookie: user.cookie,
		});
		const data = dataOf<Written>(answer);
		expect(data.results).toEqual([{ id, applied: false }]);
		expect(data.views[0]).toMatchObject({ name: "Ten", changedAt: TEN });
	});

	test("a sixth view is refused with reason limit, and the five come back", async () => {
		const user = await freshUser("layout-route-limit");
		await put(
			body(
				Array.from({ length: 5 }, (_, index) =>
					view(nextId(), `View ${index + 1}`, NINE),
				),
			),
			{ cookie: user.cookie },
		);
		const extra = nextId();
		const { status, body: answer } = await put(
			body([view(extra, "Sixth", TEN)]),
			{
				cookie: user.cookie,
			},
		);
		expect(status).toBe(200);
		const data = dataOf<Written>(answer);
		expect(data.results).toEqual([
			{ id: extra, applied: false, reason: "limit" },
		]);
		expect(data.views).toHaveLength(5);
	});

	test("a change time ahead of the server clock is stored as the clock", async () => {
		const user = await freshUser("layout-route-ahead");
		const { body: answer } = await put(
			body([view(nextId(), "Fast clock", "2026-11-02T09:30:00.000Z")]),
			{ cookie: user.cookie },
		);
		expect(dataOf<Written>(answer).views[0]?.changedAt).toBe(GOLDEN_NOW);
	});

	test("normalizes unknown ids, sizes and a format it does not know, never refusing them", async () => {
		const user = await freshUser("layout-route-normalize");
		const id = nextId();
		const { status, body: answer } = await put(
			body(
				[
					view(id, "Odd", TEN, {
						widgets: [
							{ id: "nothing", size: 3, hidden: false },
							{ id: "goals", size: 5, hidden: true },
						],
					}),
				],
				2,
			),
			{ cookie: user.cookie },
		);
		expect(status).toBe(200);
		expect(dataOf<Written>(answer).views[0]?.widgets).toEqual(defaultWidgets());
	});

	test("a deletion marker for a view never stored is applied", async () => {
		const user = await freshUser("layout-route-marker");
		const id = nextId();
		const { body: answer } = await put(body([marker(id, TEN)]), {
			cookie: user.cookie,
		});
		expect(dataOf<Written>(answer).results).toEqual([{ id, applied: true }]);
	});

	test("the same key and body twice gives one write and the same answer (API-3)", async () => {
		const user = await freshUser("layout-route-replay");
		const input = body([view(nextId(), "Once", TEN)]);
		const { first, again } = await sentTwiceWithOneKey(put, input, user.cookie);
		expect(first.status).toBe(200);
		expect(again.body).toEqual(first.body);
		const { rows } = await owner.query<{ version: number }>(
			"SELECT version FROM app.dashboard_views WHERE user_id = $1",
			[user.id],
		);
		expect(rows).toEqual([{ version: 1 }]);
	});

	test("the same key with another body is 422 idempotency_key_reused", async () => {
		const user = await freshUser("layout-route-reused");
		const headers = { "idempotency-key": randomUUIDv7() };
		await put(body([view(nextId(), "First", NINE)]), {
			cookie: user.cookie,
			headers,
		});
		const { status, body: answer } = await put(
			body([view(nextId(), "Second", TEN)]),
			{
				cookie: user.cookie,
				headers,
			},
		);
		expect(status).toBe(422);
		expect(errorOf(answer).code).toBe("idempotency_key_reused");
	});

	test("takes no If-Match: the server keeps the later change time, not a version (OFF-8)", async () => {
		const user = await freshUser("layout-route-no-match");
		const { status } = await put(body([view(nextId(), "A", TEN)]), {
			cookie: user.cookie,
			headers: { "if-match": '"99"' },
		});
		expect(status).toBe(200);
	});

	test("without an Idempotency-Key is 400", async () => {
		const user = await freshUser("layout-route-nokey");
		const { status, body: answer } = await put(
			body([view(nextId(), "A", TEN)]),
			{
				cookie: user.cookie,
				headers: { "idempotency-key": null },
			},
		);
		expect(status).toBe(400);
		expect(errorOf(answer).code).toBe("bad_request");
	});

	test("another user's id is 409 id_conflict and their view is untouched", async () => {
		const mine = await freshUser("layout-route-c-mine");
		const theirs = await freshUser("layout-route-c-theirs");
		const id = nextId();
		await put(body([view(id, "Theirs", NINE)]), { cookie: theirs.cookie });
		const { status, body: answer } = await put(body([view(id, "Mine", TEN)]), {
			cookie: mine.cookie,
		});
		expect(status).toBe(409);
		expect(errorOf(answer).code).toBe("id_conflict");
		expect(dataOf<Layout>((await read(theirs.cookie)).body).views[0]?.name).toBe(
			"Theirs",
		);
	});

	test("no session is 401, and no profile 403 profile_required", async () => {
		await expectSessionRefusals(
			put,
			body([view(nextId(), "A", TEN)]),
			noProfile.cookie,
		);
	});

	test("a request from another origin is 403 cross_origin", async () => {
		const user = await freshUser("layout-route-origin");
		await expectCrossOriginRefused(
			put,
			body([view(nextId(), "A", TEN)]),
			user.cookie,
		);
		expect((await read(user.cookie)).status).toBe(200);
	});
});

describe("PUT /api/layout, a body that breaks a rule is 422 validation_failed with fields", () => {
	const refused = async (input: unknown) => {
		const user = await freshUser(`layout-route-422-${++counter}`);
		const { status, body: answer } = await put(input, { cookie: user.cookie });
		expect(dataOf<Layout>((await read(user.cookie)).body).views).toEqual([]);
		return { status, error: errorOf(answer) };
	};

	test.each([
		["overview as an id", body([view("overview", "A", TEN)]), "views.0.id"],
		["an empty name", body([view(nextId(), "", TEN)]), "views.0.name"],
		[
			"a name of 41 characters",
			body([view(nextId(), "x".repeat(41), TEN)]),
			"views.0.name",
		],
		[
			"an id that is not a UUIDv7",
			body([view("0199a000-0000-4000-8000-000000000001", "A", TEN)]),
			"views.0.id",
		],
		[
			"a change time that is not an instant",
			body([view(nextId(), "A", "yesterday")]),
			"views.0.changedAt",
		],
		["no views", body([]), "views"],
		[
			"eleven views",
			body(Array.from({ length: 11 }, () => view(nextId(), "A", TEN))),
			"views",
		],
		[
			"a format that is not a whole number",
			{ formatVersion: "1", views: [view(nextId(), "A", TEN)] },
			"formatVersion",
		],
	])("%s", async (_name, input, field) => {
		const { status, error } = await refused(input);
		expect(status).toBe(422);
		expect(error.code).toBe("validation_failed");
		expect(Object.keys(error.fields)).toContain(field);
	});

	test("a view sent twice names the second", async () => {
		const id = nextId();
		const { status, error } = await refused(
			body([view(id, "A", TEN), view(id, "B", TEN)]),
		);
		expect(status).toBe(422);
		expect(Object.keys(error.fields)).toContain("views.1.id");
	});
});
