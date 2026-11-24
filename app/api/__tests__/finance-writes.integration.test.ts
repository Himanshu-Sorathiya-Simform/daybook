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
import { POST as createSubscription } from "../subscriptions/route";
import {
	DELETE as deleteSubscription,
	PATCH as editSubscription,
} from "../subscriptions/[id]/route";
import { POST as skipCharge } from "../subscriptions/[id]/skips/route";
import { DELETE as unskipCharge } from "../subscriptions/[id]/skips/[dueOn]/route";
import { POST as bootCatchUp } from "../sync/catch-up/route";
import { PUT as putLayout } from "../layout/route";

/** The route wrapper's refusals (API-2, API-3, BR-P2-17) on every F03 and F05 write: each of the
 * six Transaction and saved-view writes and the six Subscription writes refuses a foreign or
 * missing Origin, a body that is not JSON, a body over 64 KB and, unless the route is exempt
 * (the boot catch-up, API-3), a missing Idempotency-Key, and changes nothing. The wrapper's own
 * test proves them once; this proves each route goes through it. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let viewId: string;
let netflix: string;

const VIEW_ID = () => uuidV7At(GOLDEN_NOW);
const LAYOUT_VIEW_ID = uuidV7At(GOLDEN_NOW);

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	const user = await signedInUser(owner, "finance-writes");
	const loaded = await loadGolden(owner, user.id);
	golden = { ...loaded, cookie: user.cookie };
	netflix = loaded.subscription("netflix");
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
	/** A route that takes no Idempotency-Key (API-3). */
	exemptKey?: true;
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
	{
		name: "POST /api/subscriptions",
		send: (options) =>
			call(createSubscription, "/api/subscriptions", {
				method: "POST",
				body: {
					id: uuidV7At(GOLDEN_NOW),
					name: "Hulu",
					amountMinor: 79900,
					currency: "INR",
					cadence: { unit: "month", every: 1 },
					startDate: "2026-11-10",
					category: "entertainment",
					note: null,
					backfill: false,
					createdAt: GOLDEN_NOW,
				},
				...options,
			}),
	},
	{
		name: "PATCH /api/subscriptions/[id]",
		send: (options) =>
			call(editSubscription, `/api/subscriptions/${netflix}`, {
				method: "PATCH",
				params: { id: netflix },
				body: { changedAt: GOLDEN_NOW, note: "Changed" },
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "DELETE /api/subscriptions/[id]",
		send: (options) =>
			call(deleteSubscription, `/api/subscriptions/${netflix}`, {
				method: "DELETE",
				params: { id: netflix },
				body: { changedAt: GOLDEN_NOW },
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "POST /api/subscriptions/[id]/skips",
		send: (options) =>
			call(skipCharge, `/api/subscriptions/${netflix}/skips`, {
				method: "POST",
				params: { id: netflix },
				body: { dueOn: "2026-11-05", changedAt: GOLDEN_NOW },
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "DELETE /api/subscriptions/[id]/skips/[dueOn]",
		send: (options) =>
			call(unskipCharge, `/api/subscriptions/${netflix}/skips/2026-11-05`, {
				method: "DELETE",
				params: { id: netflix, dueOn: "2026-11-05" },
				body: { changedAt: GOLDEN_NOW },
				...options,
				headers: { ...versioned, ...options.headers },
			}),
	},
	{
		name: "PUT /api/layout",
		send: (options) =>
			call(putLayout, "/api/layout", {
				method: "PUT",
				body: {
					formatVersion: 1,
					views: [
						{
							id: LAYOUT_VIEW_ID,
							name: "Budget watch",
							widgets: [{ id: "budgets", size: 4, hidden: false }],
							changedAt: GOLDEN_NOW,
							deleted: false,
						},
					],
				},
				...options,
			}),
	},
	{
		name: "POST /api/sync/catch-up",
		exemptKey: true,
		send: (options) =>
			call(bootCatchUp, "/api/sync/catch-up", {
				method: "POST",
				body: {},
				...options,
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
	const subscriptions = await owner.query(
		`SELECT id, version, note FROM app.subscriptions WHERE user_id = $1 ORDER BY id`,
		[golden.userId],
	);
	const skips = await owner.query(
		`SELECT subscription_id, due_on::text FROM app.subscription_skips
		 WHERE user_id = $1 ORDER BY subscription_id, due_on`,
		[golden.userId],
	);
	const charges = await owner.query(
		`SELECT count(*)::int AS n FROM app.transactions
		 WHERE user_id = $1 AND subscription_id IS NOT NULL`,
		[golden.userId],
	);
	const layout = await owner.query(
		`SELECT id, name, version FROM app.dashboard_views WHERE user_id = $1 ORDER BY id`,
		[golden.userId],
	);
	return {
		...rows[0],
		views: views.rows,
		layout: layout.rows,
		subscriptions: subscriptions.rows,
		skips: skips.rows,
		charges: charges.rows[0],
	};
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

describe.each(WRITES)("$name", ({ send, exemptKey }) => {
	test.each(
		REFUSALS.filter(([name]) => !(exemptKey && name === "no Idempotency-Key")),
	)(
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
	const write = (name: string): Write => {
		const found = WRITES.find((candidate) => candidate.name === name);
		if (!found) throw new Error(`No write named ${name}.`);
		return found;
	};
	const cookie = golden.cookie;
	const at = (version: number) => ({
		cookie,
		headers: { "if-match": `"${version}"` },
	});
	expect((await write("POST /api/transactions").send({ cookie })).status).toBe(
		201,
	);
	expect(
		(await write("PATCH /api/transactions/[id]").send({ cookie })).status,
	).toBe(200);
	expect((await write("DELETE /api/transactions/[id]").send(at(2))).status).toBe(
		204,
	);
	expect(
		(await write("POST /api/transaction-views").send({ cookie })).status,
	).toBe(201);
	expect(
		(await write("PATCH /api/transaction-views/[id]").send({ cookie })).status,
	).toBe(200);
	expect(
		(await write("DELETE /api/transaction-views/[id]").send(at(2))).status,
	).toBe(204);

	// F05: Netflix goes from version 1 through a change, a skip and its undo, then is deleted.
	expect((await write("POST /api/subscriptions").send({ cookie })).status).toBe(
		201,
	);
	expect(
		(await write("PATCH /api/subscriptions/[id]").send({ cookie })).status,
	).toBe(200);
	expect(
		(await write("POST /api/subscriptions/[id]/skips").send(at(2))).status,
	).toBe(200);
	expect(
		(await write("DELETE /api/subscriptions/[id]/skips/[dueOn]").send(at(3)))
			.status,
	).toBe(200);
	expect(
		(
			await write("POST /api/sync/catch-up").send({
				cookie,
				headers: { "idempotency-key": null },
			})
		).status,
	).toBe(200);
	expect((await write("DELETE /api/subscriptions/[id]").send(at(4))).status).toBe(
		200,
	);

	// F08: the layout takes no If-Match, and the view it writes is the user's own.
	expect((await write("PUT /api/layout").send({ cookie })).status).toBe(200);
}, 180_000);
