import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import { parseOwnerEnv } from "../../../server/env";
import { GEO_DATA } from "../data";
import { UTC } from "..";

const zones = [
	...Object.values(GEO_DATA.countries).flatMap((country) =>
		country.zones.map((zone) => zone.name),
	),
	UTC,
];

let owner: Client;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(() => owner.end());

// AC-F02-04
test("Postgres knows every zone the geo module offers, and UTC", async () => {
	const { rows } = await owner.query<{ name: string }>(
		`SELECT name FROM unnest($1::text[]) AS z(name)
		 WHERE name NOT IN (SELECT name FROM pg_timezone_names)`,
		[zones],
	);
	expect(rows.map((row) => row.name)).toEqual([]);
});

// AC-F02-04
test("AT TIME ZONE accepts every zone and UTC", async () => {
	const { rows } = await owner.query<{ count: string }>(
		`SELECT count(*)::text AS count
		 FROM unnest($2::text[]) AS z(name), LATERAL (SELECT $1::timestamptz AT TIME ZONE z.name) AS t`,
		["2026-11-02T06:30:00Z", zones],
	);
	expect(Number(rows[0]!.count)).toBe(zones.length);
});
