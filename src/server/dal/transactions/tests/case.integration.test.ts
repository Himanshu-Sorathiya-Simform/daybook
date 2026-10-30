import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { lowercase } from "@/lib/text";
import { parseOwnerEnv } from "../../../env";

/** `lowercase` (D-497) against Postgres's own `lower()` and `ILIKE`, over every code point.
 * Every case-insensitive match in SQL (search, payee suggestions, payee groups, view names)
 * uses them, and the browser's mirror of those matches must fold case the same way. A Postgres
 * or Node upgrade that changes either side fails here, and `NOT_LOWERCASED_BY_POSTGRES` in
 * `src/lib/text.ts` is what to update. It reads only built-in functions, so it touches no table. */

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

const hex = (text: string) =>
	[...text].map((c) => c.codePointAt(0)!.toString(16)).join("+");

describe("lowercase and Postgres's lower()", () => {
	test("agree on every code point, surrogates aside", async () => {
		const { rows } = await owner.query<{ cp: number; lowered: string }>(
			`SELECT cp, lower(chr(cp)) AS lowered FROM generate_series(1, 1114111) AS cp
			 WHERE cp NOT BETWEEN 55296 AND 57343 AND lower(chr(cp)) <> chr(cp)`,
		);
		const lowered = new Map(rows.map(({ cp, lowered }) => [cp, lowered]));
		// The count of code points Postgres 18 lowercases is a guard on the sweep itself: a
		// query that selected nothing would make the comparison below empty.
		expect(lowered.size).toBeGreaterThan(1400);
		const differences: string[] = [];
		for (let cp = 1; cp <= 0x10ffff; cp++) {
			if (cp >= 0xd800 && cp <= 0xdfff) continue;
			const character = String.fromCodePoint(cp);
			const expected = lowered.get(cp) ?? character;
			if (lowercase(character) !== expected) {
				differences.push(
					`U+${cp.toString(16).toUpperCase()}: lowercase ${hex(lowercase(character))}, Postgres ${hex(expected)}`,
				);
			}
		}
		expect(differences).toEqual([]);
	});

	test("agree on whole words, where JavaScript's final sigma and dotted İ differ", async () => {
		const words = [
			"İSTANBUL",
			"ΟΔΟΣ",
			"Σ",
			"ΣΑΣ",
			"ǅ",
			"ẞTRASSE",
			"Café ÉCOLE",
			"𐐀𐐁",
		];
		const { rows } = await owner.query<{ lowered: string }>(
			`SELECT lower(w) AS lowered FROM unnest($1::text[]) WITH ORDINALITY AS t(w, n) ORDER BY n`,
			[words],
		);
		expect(words.map(lowercase)).toEqual(rows.map(({ lowered }) => lowered));
	});
});

describe("ILIKE and lower()", () => {
	// A search is `text ILIKE '%q%'`, a payee match `lower(payee) LIKE lower(q) || '%'`: both fold
	// case with `lower()`, so a character and its lowercase must match each other under ILIKE.
	test("ILIKE finds a character by its lowercase and its lowercase by the character", async () => {
		const { rows } = await owner.query<{ failing: string }>(
			`SELECT count(*)::text AS failing FROM generate_series(1, 1114111) AS cp
			 WHERE cp NOT BETWEEN 55296 AND 57343 AND cp NOT IN (37, 92, 95)
			   AND NOT (chr(cp) ILIKE '%' || lower(chr(cp)) || '%'
			        AND lower(chr(cp)) ILIKE '%' || chr(cp) || '%')`,
		);
		expect(rows[0]?.failing).toBe("0");
	});

	test.each([
		["İstanbul Kebab", "ist", true],
		["ΟΔΟΣ", "οδοσ", true],
		["οδος", "οδοσ", false],
	])("%j ILIKE %%%j%% is %s", async (text, q, expected) => {
		const { rows } = await owner.query<{ found: boolean }>(
			`SELECT $1::text ILIKE '%' || $2::text || '%' AS found`,
			[text, q],
		);
		expect(rows[0]?.found).toBe(expected);
		expect(lowercase(text).includes(lowercase(q))).toBe(expected);
	});
});
