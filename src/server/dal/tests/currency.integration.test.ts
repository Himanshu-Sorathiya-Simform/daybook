import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { runtimePool } from "../../db/pools";
import { createUser, insertRow, PRIVATE_ROWS } from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import { asUser } from "../transactions/tests/helpers";
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
