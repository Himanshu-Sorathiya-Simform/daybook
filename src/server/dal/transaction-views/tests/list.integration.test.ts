import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { GOLDEN_NOW } from "../../../../../seed/golden";
import { loadGolden } from "../../../../../seed/load-golden";
import { runtimePool } from "../../../db/pools";
import { createUser } from "../../../db/tests/private-rows";
import { parseOwnerEnv } from "../../../env";
import { asUser } from "../../transactions/tests/helpers";
import { listViews } from "../list";
import { addViews } from "./helpers";

/** `listViews` (BR-F03-63, AC-F03-45, AC-F03-53) through the runtime role and RLS. */

let owner: Client;
let userId: string;
let other: string;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
	userId = (await loadGolden(owner, await createUser(owner, "list-views"))).userId;
	other = (await loadGolden(owner, await createUser(owner, "list-views-other")))
		.userId;
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [
		[userId, other].filter(Boolean),
	]);
	await owner?.end();
	await runtimePool().end();
});

const insert = (id: string, user: string, name: string, createdAt: string) =>
	owner.query(
		`INSERT INTO app.transaction_views (id, user_id, created_at, updated_at, name, filter,
		   sort, dir, group_by, version)
		 VALUES ($1, $2, $3, $3, $4, '{"cat": ["food"]}', 'amount', 'asc', 'none', 1)`,
		[id, user, createdAt, name],
	);

test("a user with no views gets an empty list, never All Transactions", async () => {
	const { result, statements } = await asUser(userId, (tx) => listViews(tx));
	expect(result).toEqual([]);
	expect(statements).toBe(1);
});

test("lists the user's views by createdAt, then id, as the API's view", async () => {
	const later = "2026-11-02T07:00:00.000Z";
	// Two views recorded at the same instant, inserted out of id order, and an earlier one.
	await insert("0199a000-0000-7000-8000-00000000000b", userId, "Second", later);
	await insert("0199a000-0000-7000-8000-00000000000a", userId, "First", later);
	await insert(
		"0199a000-0000-7000-8000-00000000000c",
		userId,
		"Earliest",
		GOLDEN_NOW,
	);
	const { result, statements } = await asUser(userId, (tx) => listViews(tx));
	expect(result.map(({ name }) => name)).toEqual(["Earliest", "First", "Second"]);
	expect(result[0]).toEqual({
		id: "0199a000-0000-7000-8000-00000000000c",
		name: "Earliest",
		filter: { cat: ["food"] },
		sort: "amount",
		dir: "asc",
		group: "none",
		version: 1,
		createdAt: GOLDEN_NOW,
		updatedAt: GOLDEN_NOW,
	});
	expect(statements).toBe(1);
});

// AC-F03-53
test("never shows another user's views", async () => {
	await insert(
		"0199a000-0000-7000-8000-00000000000d",
		userId,
		"Not theirs",
		GOLDEN_NOW,
	);
	const { result } = await asUser(other, async (tx) => {
		await addViews(tx, other, 2);
		return listViews(tx);
	});
	expect(result.map(({ name }) => name)).toEqual(["View 1", "View 2"]);
});
