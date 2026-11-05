import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { runtimePool } from "../../db/pools";
import {
	createUser,
	insertRow,
	PRIVATE_ROWS,
} from "../../db/__tests__/private-rows";
import { parseOwnerEnv } from "../../env";
import { asUser } from "../transactions/__tests__/helpers";
import { lockCurrency, requireCurrency } from "../currency";

/** The profile lock every finance write takes first (BR-F03-05), through the runtime role. */

let owner: Client;
let withProfile: string;
let withoutProfile: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	withProfile = await createUser(owner, "currency");
	await insertRow(owner, "profile", PRIVATE_ROWS.profile(withProfile));
	withoutProfile = await createUser(owner, "currency-new");
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[withProfile, withoutProfile].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

test("returns the profile's currency in one statement", async () => {
	const { result, statements } = await asUser(withProfile, (tx) =>
		lockCurrency(tx),
	);
	expect(result).toBe("INR");
	expect(statements).toBe(1);
});

test("refuses a user without a profile with 403 profile_required", async () => {
	await expect(
		asUser(withoutProfile, (tx) => lockCurrency(tx)),
	).rejects.toMatchObject({
		code: "profile_required",
	});
});

// AC-F03-13, API-6
test("requireCurrency passes the profile's currency and refuses any other", async () => {
	await expect(
		asUser(withProfile, (tx) => requireCurrency(tx, "INR")),
	).resolves.toMatchObject({
		statements: 1,
	});
	await expect(
		asUser(withProfile, (tx) => requireCurrency(tx, "USD")),
	).rejects.toMatchObject({
		code: "currency_mismatch",
	});
});

/** A second connection as the owner, which plays the F02 currency change: it locks the
 * profile `FOR UPDATE` (BR-F02-15, D-213). A lock timeout keeps a wrong guess from hanging. */
async function ownerConnection() {
	const client = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await client.connect();
	return client;
}

// BR-F03-05: the lock serializes a write with a currency change.
test("a write waits for a currency change holding FOR UPDATE, then refuses the old currency", async () => {
	const change = await ownerConnection();
	try {
		await change.query("BEGIN");
		await change.query(
			"SELECT currency FROM app.profile WHERE user_id = $1 FOR UPDATE",
			[withProfile],
		);
		await change.query(
			"UPDATE app.profile SET currency = 'USD' WHERE user_id = $1",
			[withProfile],
		);
		let settled = false;
		const write = asUser(withProfile, (tx) =>
			requireCurrency(tx, "INR"),
		).finally(() => {
			settled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 500));
		expect(settled).toBe(false);

		await change.query("COMMIT");
		await expect(write).rejects.toMatchObject({ code: "currency_mismatch" });
	} finally {
		await change.query("ROLLBACK").catch(() => {});
		await change.query(
			"UPDATE app.profile SET currency = 'INR' WHERE user_id = $1",
			[withProfile],
		);
		await change.end();
	}
});

// BR-F03-05: while a write holds the lock, a currency change can't take the profile, but
// catch-up's update of last_catch_up_on goes through.
test("a write's lock refuses FOR UPDATE and lets catch-up's update through", async () => {
	const other = await ownerConnection();
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	let locked!: () => void;
	const lockTaken = new Promise<void>((resolve) => {
		locked = resolve;
	});
	const write = asUser(withProfile, async (tx) => {
		await lockCurrency(tx);
		locked();
		await held;
	});
	try {
		await lockTaken;
		await other.query("BEGIN");
		await other.query("SET LOCAL lock_timeout = '2s'");
		await expect(
			other.query(
				"SELECT currency FROM app.profile WHERE user_id = $1 FOR UPDATE NOWAIT",
				[withProfile],
			),
		).rejects.toMatchObject({ code: "55P03" });
		await other.query("ROLLBACK");

		await other.query("BEGIN");
		await other.query("SET LOCAL lock_timeout = '2s'");
		const { rowCount } = await other.query(
			"UPDATE app.profile SET last_catch_up_on = last_catch_up_on WHERE user_id = $1",
			[withProfile],
		);
		expect(rowCount).toBe(1);
		await other.query("ROLLBACK");
	} finally {
		release();
		await write;
		await other.query("ROLLBACK").catch(() => {});
		await other.end();
	}
});
