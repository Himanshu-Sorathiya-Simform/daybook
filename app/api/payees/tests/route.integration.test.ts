import { Client } from "pg";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	expect,
	test,
	vi,
} from "vitest";

import { GOLDEN_NOW } from "../../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../../seed/load-golden";
import { call } from "@/server/api/tests/call";
import { signedInUser } from "@/server/auth/tests/sessions";
import { runtimePool } from "@/server/db/pools";
import { parseOwnerEnv } from "@/server/env";
import { GET } from "../route";

/** `GET /api/payees` (BR-F03-44, BR-F03-61) through the route wrapper, a real session and the golden clock,
 * on golden's M1 rows. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "payees-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "payees-route-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[golden?.userId, noProfile?.id].filter(Boolean),
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

const get = (query: string, cookie: string | null = golden.cookie) =>
	call(
		GET,
		`/api/payees${query ? `?${query}` : ""}`,
		cookie === null ? {} : { cookie },
	);

test("no session gets 401, and no profile 403 profile_required", async () => {
	expect((await get("", null)).status).toBe(401);
	const { status, body } = await get("", noProfile.cookie);
	expect(status).toBe(403);
	expect(body).toMatchObject({ error: { code: "profile_required" } });
});

// AC-F03-21, AC-F03-44, through HTTP; golden: section 5's category counts.
test("lists the payees and categories, with no currency since they hold no money", async () => {
	const { status, body } = await get("");
	expect(status).toBe(200);
	const data = (
		body as { data: { items: { payee: string }[]; categories: unknown[] } }
	).data;
	expect(data.items).toHaveLength(13);
	expect(data.items[0]).toEqual({
		payee: "Swiggy",
		count: 4,
		lastUsedOn: "2026-11-01",
		lastType: "expense",
		lastCategory: "food",
	});
	expect(data.categories[0]).toEqual({ key: "food", count: 7 });
	expect(data).not.toHaveProperty("currency");
});

// AC-F03-44
test("q=apart answers Sunrise Apartments alone, without categories", async () => {
	const { body } = await get("q=apart");
	expect(body).toEqual({
		data: {
			items: [
				{
					payee: "Sunrise Apartments",
					count: 3,
					lastUsedOn: "2026-11-01",
					lastType: "expense",
					lastCategory: "housing",
				},
			],
		},
	});
});

test("q is trimmed before it matches", async () => {
	const { body } = await get("q=%20%20o%20");
	expect(body).toMatchObject({ data: { items: [{ payee: "Indian Oil" }] } });
});

// AC-F03-44, BR-F03-61
test.each(["q=", `q=${"a".repeat(81)}`, "q=a%00", "q=a&q=b"])(
	"%s gets 400 naming q",
	async (query) => {
		const { status, body } = await get(query);
		expect(status).toBe(400);
		expect(body).toMatchObject({
			error: { code: "bad_request", details: { params: ["q"] } },
		});
	},
);
