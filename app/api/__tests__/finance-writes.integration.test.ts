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

import { GOLDEN_NOW } from "../../../seed/golden";
import { loadGolden, type LoadedGolden } from "../../../seed/load-golden";
import { call, type CallOptions } from "@/server/api/__tests__/call";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { runtimePool } from "@/server/db/pools";
import { uuidV7At } from "@/server/dal/transactions/__tests__/helpers";
import { parseOwnerEnv } from "@/server/env";
import { POST as createTransaction } from "../transactions/route";
import {
	DELETE as deleteTransaction,
	PATCH as editTransaction,
} from "../transactions/[id]/route";
import { POST as createView } from "../transaction-views/route";
import {
	DELETE as deleteView,
	PATCH as editView,
} from "../transaction-views/[id]/route";

/** The route wrapper's refusals (API-2, API-3, BR-P2-17) on every F03 write: each of the six
 * Transaction and saved-view writes refuses a foreign or missing Origin, a body that is not
 * JSON, a body over 64 KB and a missing Idempotency-Key, and changes nothing. The wrapper's own
 * test proves them once; this proves each F03 route goes through it. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let viewId: string;

const VIEW_ID = () => uuidV7At(GOLDEN_NOW);

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "finance-writes");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	viewId = VIEW_ID();
	await owner.query(
		`INSERT INTO app.transaction_views
		   (id, user_id, created_at, updated_at, name, filter, sort, dir, group_by, version)
		 VALUES ($1, $2, $3, $3, 'Food', '{"cat":["food"]}', 'date', 'desc', 'day', 1)`,
		[viewId, golden.userId, GOLDEN_NOW],
	);
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [golden?.userId]);
	await owner?.end();
	await runtimePool().end();
});

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"], now: new Date(GOLDEN_NOW) });
});

afterEach(() => {
	vi.useRealTimers();
});

type Write = {
	name: string;
	send: (options: CallOptions) => ReturnType<typeof call>;
};

const versioned = { "if-match": '"1"' };

/** Each F03 write, with a body it would otherwise accept. */
const WRITES: Write[] = [
	{
		name: "POST /api/transactions",
		send: (options) =>
			call(createTransaction, "/api/transactions", {
				method: "POST",
				body: {
					id: uuidV7At(GOLDEN_NOW),
					type: "expense",
					amountMinor: 64000,
					currency: "INR",
					occurredAt: GOLDEN_NOW,
					occurredOn: "2026-11-02",
					createdAt: GOLDEN_NOW,
					category: "food",
					payee: "Swiggy",
				},
				...options,
			}),
	},
	{
		name: "PATCH /api/transactions/[id]",
		send: (options) =>
			call(editTransaction, `/api/transactions/${golden.id(24)}`, {
				method: "PATCH",
				params: { id: golden.id(24) },
				body: { note: "Changed" },
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "DELETE /api/transactions/[id]",
		send: (options) =>
			call(deleteTransaction, `/api/transactions/${golden.id(24)}`, {
				method: "DELETE",
				params: { id: golden.id(24) },
				body: {},
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "POST /api/transaction-views",
		send: (options) =>
			call(createView, "/api/transaction-views", {
				method: "POST",
				body: {
					id: VIEW_ID(),
					name: "Rent",
					filter: {},
					sort: "date",
					dir: "desc",
					group: "day",
				},
				...options,
			}),
	},
	{
		name: "PATCH /api/transaction-views/[id]",
		send: (options) =>
			call(editView, `/api/transaction-views/${viewId}`, {
				method: "PATCH",
				params: { id: viewId },
				body: { name: "Groceries" },
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "DELETE /api/transaction-views/[id]",
		send: (options) =>
			call(deleteView, `/api/transaction-views/${viewId}`, {
				method: "DELETE",
				params: { id: viewId },
				body: {},
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
];

/** The user's rows and views as they stand: a refused write leaves both alone. */
async function state() {
	const { rows } = await owner.query<{ rows: string; version: number }>(
		`SELECT (SELECT count(*) FROM app.transactions WHERE user_id = $1)::text AS rows,
		        (SELECT version FROM app.transactions WHERE id = $2) AS version`,
		[golden.userId, golden.id(24)],
	);
	const views = await owner.query(
		`SELECT id, name, version FROM app.transaction_views WHERE user_id = $1 ORDER BY id`,
		[golden.userId],
	);
	return { ...rows[0], views: views.rows };
}

const REFUSALS: [string, Omit<CallOptions, "cookie">, number, string][] = [
	[
		"a foreign Origin",
		{ headers: { origin: "https://evil.example" } },
		403,
		"cross_origin",
	],
	["no Origin", { headers: { origin: null } }, 403, "cross_origin"],
	[
		"a text/plain body",
		{ headers: { "content-type": "text/plain" } },
		415,
		"unsupported_media_type",
	],
	[
		"no Content-Type",
		{ headers: { "content-type": null } },
		415,
		"unsupported_media_type",
	],
	[
		"no Idempotency-Key",
		{ headers: { "idempotency-key": null } },
		400,
		"bad_request",
	],
	[
		"a body over 64 KB",
		{ rawBody: JSON.stringify({ pad: "a".repeat(64 * 1024) }) },
		413,
		"payload_too_large",
	],
];

describe.each(WRITES)("$name", ({ send }) => {
	test.each(REFUSALS)(
		"refuses %s with %i, and changes nothing",
		async (_name, options, status, code) => {
			const before = await state();
			const { status: got, body } = await send({
				cookie: golden.cookie,
				...options,
				headers: { ...options.headers },
			});
			expect(got).toBe(status);
			expect((body as { error: { code: string } }).error.code).toBe(code);
			expect(await state()).toEqual(before);
		},
	);
});

// The control: with nothing refused, each of the same writes is accepted, so the refusals above
// came from the wrapper and not from the body. Runs last, since it writes.
test("the same writes, with nothing refused, are accepted in turn", async () => {
	const [create, edit, remove, createV, editV, removeV] = WRITES as [
		Write,
		Write,
		Write,
		Write,
		Write,
		Write,
	];
	const cookie = golden.cookie;
	expect((await create.send({ cookie })).status).toBe(201);
	expect((await edit.send({ cookie })).status).toBe(200);
	expect(
		(await remove.send({ cookie, headers: { "if-match": '"2"' } })).status,
	).toBe(204);
	expect((await createV.send({ cookie })).status).toBe(201);
	expect((await editV.send({ cookie })).status).toBe(200);
	expect(
		(await removeV.send({ cookie, headers: { "if-match": '"2"' } })).status,
	).toBe(204);
});
