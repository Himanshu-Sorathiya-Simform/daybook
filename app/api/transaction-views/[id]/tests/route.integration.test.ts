import { randomUUIDv7 } from "node:crypto";
import { Client } from "pg";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden } from "../../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/tests/helpers";
import { parseOwnerEnv } from "@/server/env";
import { GET } from "../../route";
import { DELETE, PATCH } from "../route";

/** `PATCH` and `DELETE /api/transaction-views/[id]` (F03 section 11, BR-F03-68, BR-F03-69;
 * D-489) through the route wrapper, real sessions and the golden clock. Each test edits its
 * own committed view; the edit rules are tested on `editView` itself. */

type User = { id: string; cookie: string };

let owner: Client;
let me: User;
let other: User;
let noProfile: User;

async function user(label: string): Promise<User> {
	const signedIn = await signedInUser(owner, label);
	await loadGolden(owner, signedIn.id);
	return signedIn;
}

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	me = await user("view-id-route");
	other = await user("view-id-route-other");
	noProfile = await signedInUser(owner, "view-id-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[me?.id, other?.id, noProfile?.id].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
});

afterEach(() => {
	vi.useRealTimers();
});

let views = 0;

/** A committed view of `who`'s at version 1, named uniquely: food over last month, by day. */
async function view(who: User = me): Promise<{ id: string; name: string }> {
	const id = uuidV7At(GOLDEN_NOW);
	const name = `Food ${(views += 1)}`;
	await owner.query(
		`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
		   sort, dir, group_by, version)
		 VALUES ($1, $2, $3, $3, $4, '{"range": "last_month", "cat": ["food"]}', 'date', 'desc',
		   'day', 1)`,
		[id, who.id, GOLDEN_NOW, name],
	);
	return { id, name };
}

type Options = { version?: string | null; cookie?: string | null; key?: string };

function send(
	handler: typeof PATCH,
	method: "PATCH" | "DELETE",
	id: string,
	input: unknown,
	{ version = "1", cookie = me.cookie, key }: Options = {},
) {
	return call(handler, `/api/transaction-views/${id}`, {
		method,
		params: { id },
		body: input,
		...(cookie === null ? {} : { cookie }),
		headers: {
			"if-match": version === null ? null : `"${version}"`,
			...(key ? { "idempotency-key": key } : {}),
		},
	});
}

const patch = (id: string, input: unknown, options?: Options) =>
	send(PATCH, "PATCH", id, input, options);
const remove = (id: string, options?: Options) =>
	send(DELETE, "DELETE", id, {}, options);

/** `who`'s views as the list answers them, by id. */
async function listed(who: User = me) {
	const { body } = (await call(GET, "/api/transaction-views", {
		cookie: who.cookie,
	})) as {
		body: {
			data: {
				items: { id: string; [key: string]: unknown }[];
				currency: string;
			};
		};
	};
	return new Map(body.data.items.map((item) => [item.id, item]));
}

const errorOf = (body: unknown) =>
	(
		body as {
			error: {
				code: string;
				fields: Record<string, string>;
				details: Record<string, unknown>;
			};
		}
	).error;

describe("PATCH (AC-F03-52)", () => {
	test("a rename alone answers 200 with the view and currency, as the list then shows it", async () => {
		const { id, name } = await view();
		const { status, body } = await patch(id, { name: name.toUpperCase() });
		expect(status).toBe(200);
		expect(body).toEqual({
			data: {
				id,
				name: name.toUpperCase(),
				filter: { range: "last_month", cat: ["food"] },
				sort: "date",
				dir: "desc",
				group: "day",
				version: 2,
				createdAt: GOLDEN_NOW,
				updatedAt: GOLDEN_NOW,
				currency: "INR",
			},
		});
		expect({ ...(await listed()).get(id), currency: "INR" }).toEqual(
			(body as { data: unknown }).data,
		);
	});

	test("the filter, sort, direction and group together answer 200", async () => {
		const { id } = await view();
		const { status, body } = await patch(id, {
			filter: { minMinor: 50000 },
			sort: "amount",
			dir: "desc",
			group: "none",
			currency: "INR",
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({
			data: { filter: { minMinor: 50000 }, sort: "amount", group: "none" },
		});
	});

	test("the filter alone, and an empty body, get 422", async () => {
		const { id } = await view();
		for (const input of [{ filter: { cat: ["food"] } }, {}]) {
			const { status, body } = await patch(id, input);
			expect(status).toBe(422);
			expect(errorOf(body).code).toBe("validation_failed");
		}
	});

	// AC-F03-47: every name refusal is tested on editView; this one shows the wrapper's answer.
	test("a rename to another view's name gets 422 on name", async () => {
		const taken = await view();
		const { id } = await view();
		const { status, body } = await patch(id, { name: taken.name.toLowerCase() });
		expect(status).toBe(422);
		expect(errorOf(body).fields).toEqual({
			name: "You already have a view with this name.",
		});
	});

	test("a stale If-Match gets 409 with the list's view and currency in details.current", async () => {
		const { id } = await view();
		await patch(id, { name: "First rename" });
		const { status, body } = await patch(id, { name: "Second rename" });
		expect(status).toBe(409);
		expect(errorOf(body)).toMatchObject({
			code: "version_conflict",
			details: { current: { ...(await listed()).get(id), currency: "INR" } },
		});
		expect((await listed()).get(id)).toMatchObject({
			name: "First rename",
			version: 2,
		});
	});

	test("replaying a PATCH with the same key answers the same and raises version once", async () => {
		const { id } = await view();
		const key = randomUUIDv7();
		const first = await patch(id, { name: "Replayed" }, { key });
		const again = await patch(id, { name: "Replayed" }, { key });
		expect(first.status).toBe(200);
		expect(again).toMatchObject({ status: 200, body: first.body });
		expect((await listed()).get(id)).toMatchObject({ version: 2 });
	});

	test("no If-Match gets 400", async () => {
		const { id } = await view();
		expect((await patch(id, { name: "Mine" }, { version: null })).status).toBe(
			400,
		);
	});
});

describe("DELETE (BR-F03-69)", () => {
	test("answers 204 with no body, and the list loses the view", async () => {
		const { id } = await view();
		const { status, body } = await remove(id);
		expect(status).toBe(204);
		expect(body).toBeNull();
		expect((await listed()).has(id)).toBe(false);
	});

	test("a stale If-Match gets 409 with the view, and the view stays", async () => {
		const { id } = await view();
		await patch(id, { name: "Renamed first" });
		const { status, body } = await remove(id);
		expect(status).toBe(409);
		expect(errorOf(body).details).toEqual({
			current: { ...(await listed()).get(id), currency: "INR" },
		});
	});

	test("a body with a field gets 422, and the view stays", async () => {
		const { id } = await view();
		const { status } = await send(DELETE, "DELETE", id, { name: "Food" });
		expect(status).toBe(422);
		expect((await listed()).has(id)).toBe(true);
	});

	test("replaying a DELETE with the same key answers 204 again", async () => {
		const { id } = await view();
		const key = randomUUIDv7();
		const answers = [await remove(id, { key }), await remove(id, { key })];
		expect(answers.map(({ status }) => status)).toEqual([204, 204]);
	});
});

// AC-F03-52, BR-F03-69
test("a PATCH or DELETE of a deleted view gets 404", async () => {
	const { id } = await view();
	await remove(id);
	expect(errorOf((await patch(id, { name: "Back" })).body).code).toBe("not_found");
	expect((await remove(id)).status).toBe(404);
});

// AC-F03-53
test("another user's PATCH and DELETE of a view get 404, and the view is unchanged", async () => {
	const { id, name } = await view(me);
	expect(
		(await patch(id, { name: "Theirs now" }, { cookie: other.cookie })).status,
	).toBe(404);
	expect((await remove(id, { cookie: other.cookie })).status).toBe(404);
	expect((await listed(me)).get(id)).toMatchObject({ name, version: 1 });
});

describe("the wrapper's refusals", () => {
	test("no session gets 401, and no profile 403 profile_required", async () => {
		const { id } = await view();
		expect((await patch(id, { name: "Mine" }, { cookie: null })).status).toBe(
			401,
		);
		const { status, body } = await remove(id, { cookie: noProfile.cookie });
		expect(status).toBe(403);
		expect(errorOf(body).code).toBe("profile_required");
	});
});
