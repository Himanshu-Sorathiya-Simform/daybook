import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { parseOwnerEnv } from "../../env";

/** The database's locale (D-472). `lower()` and text order follow it, so CI's database must
 * use Neon's: the built-in provider with `C.UTF-8`. */

let owner: Client;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(async () => {
	await owner?.end();
});

test("is Neon's: the built-in provider with C.UTF-8", async () => {
	const result = await owner.query(
		`SELECT datlocprovider, datlocale, datcollate, datctype
		 FROM pg_database WHERE datname = current_database()`,
	);
	expect(result.rows).toEqual([
		{
			datlocprovider: "b",
			datlocale: "C.UTF-8",
			datcollate: "C.UTF-8",
			datctype: "C.UTF-8",
		},
	]);
});

test("lowers letters outside ASCII and sorts by code point", async () => {
	const result = await owner.query<{ lowered: string; sorted: string[] }>(
		`SELECT lower('ÉCOLE ÜMIT') AS lowered,
		        array_agg(word ORDER BY word) AS sorted
		 FROM unnest(ARRAY['b', 'é', 'B', '_x', 'a']) AS word`,
	);
	expect(result.rows[0]).toEqual({
		lowered: "école ümit",
		sorted: ["B", "_x", "a", "b", "é"],
	});
});
