import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { parseOwnerEnv } from "../../src/server/env";
import { createUser } from "../../src/server/db/__tests__/private-rows";
import { loadStress, type LoadedStress } from "../load-stress";

/** The stress loader against a real database: all 1,000 rows pass the table's checks. */

let owner: Client;
let loaded: LoadedStress;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	loaded = await loadStress(owner, await createUser(owner, "stress-load"), {
		today: "2026-11-02",
	});
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = $1`, [loaded?.userId]);
	await owner?.end();
});

test("stores all 1,000 rows and golden's profile, with last catch-up on today", async () => {
	const { rows } = await owner.query<{ n: number; newest: string }>(
		`SELECT count(*)::int AS n, max(occurred_on)::text AS newest
		 FROM app.transactions WHERE user_id = $1`,
		[loaded.userId],
	);
	expect(rows[0]).toEqual({ n: 1000, newest: "2026-11-02" });
	const profile = await owner.query(
		`SELECT currency, timezone, last_catch_up_on::text AS caught_up
		 FROM app.profile WHERE user_id = $1`,
		[loaded.userId],
	);
	expect(profile.rows).toEqual([
		{ currency: "INR", timezone: "Asia/Kolkata", caught_up: "2026-11-02" },
	]);
});

test("gives the ids a prefix of this load, so a second user can load the same rows", async () => {
	const again = await loadStress(owner, await createUser(owner, "stress-load-2"), {
		today: "2026-11-02",
	});
	try {
		expect(again.rows.map((row) => row.id)).not.toEqual(
			loaded.rows.map((row) => row.id),
		);
	} finally {
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [again.userId]);
	}
});
