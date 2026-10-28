import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { ApiError } from "../../api/errors";
import { profile } from "../../db/schema";
import {
	createUser,
	GOLDEN_NOW,
	insertRow,
	PRIVATE_ROWS,
} from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import { versionedDelete, versionedUpdate } from "../versions";
import { withUser } from "../with-user";

const LATER = new Date("2026-11-02T08:00:00.000Z");

let owner: Client;
const users: string[] = [];
const as = (id: string) => ({ user: { id, email: "x", name: "x" } });

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(async () => {
	await owner.query(`DELETE FROM auth."user" WHERE id = ANY($1::uuid[])`, [users]);
	await owner.end();
});

/** A user with a profile at version 1; returns both ids. */
async function withProfileRow(): Promise<{ userId: string; id: string }> {
	const userId = await createUser(owner, "versions");
	users.push(userId);
	const row = PRIVATE_ROWS.profile(userId);
	await insertRow(owner, "profile", row);
	return { userId, id: String(row["id"]) };
}

async function row(id: string) {
	const { rows } = await owner.query(
		"SELECT country, version, updated_at FROM app.profile WHERE id = $1",
		[id],
	);
	return rows[0] as
		{ country: string; version: number; updated_at: Date } | undefined;
}

/** The ApiError `promise` rejects with. */
async function apiError(promise: Promise<unknown>): Promise<ApiError> {
	const error = await promise.then(
		() => null,
		(e: unknown) => e,
	);
	if (!(error instanceof ApiError))
		throw new Error(`Expected an ApiError, got ${String(error)}`);
	return error;
}

describe("versionedUpdate (BR-P2-21)", () => {
	test("updates the row, raises its version by one and sets updated_at to now", async () => {
		const { userId, id } = await withProfileRow();
		const updated = await withUser(as(userId), "write", (tx) =>
			versionedUpdate(
				tx,
				profile,
				{ id, version: 1 },
				{ country: "US" },
				LATER,
			),
		);
		expect(updated).toMatchObject({
			id,
			country: "US",
			version: 2,
			updatedAt: LATER,
		});
		expect(await row(id)).toEqual({
			country: "US",
			version: 2,
			updated_at: LATER,
		});
	});

	test("a stale version gives version_conflict with the current row, and changes nothing", async () => {
		const { userId, id } = await withProfileRow();
		await withUser(as(userId), "write", (tx) =>
			versionedUpdate(
				tx,
				profile,
				{ id, version: 1 },
				{ country: "US" },
				LATER,
			),
		);
		const error = await apiError(
			withUser(as(userId), "write", (tx) =>
				versionedUpdate(
					tx,
					profile,
					{ id, version: 1 },
					{ country: "GB" },
					LATER,
				),
			),
		);
		expect(error.code).toBe("version_conflict");
		expect(error.details["current"]).toMatchObject({
			id,
			country: "US",
			version: 2,
		});
		expect((await row(id))!.country).toBe("US");
	});

	test("a version ahead of the row is a conflict too", async () => {
		const { userId, id } = await withProfileRow();
		const error = await apiError(
			withUser(as(userId), "write", (tx) =>
				versionedUpdate(
					tx,
					profile,
					{ id, version: 5 },
					{ country: "GB" },
					LATER,
				),
			),
		);
		expect(error.code).toBe("version_conflict");
	});

	test("another user's row gives not_found, and is untouched", async () => {
		const mine = await withProfileRow();
		const theirs = await withProfileRow();
		const error = await apiError(
			withUser(as(mine.userId), "write", (tx) =>
				versionedUpdate(
					tx,
					profile,
					{ id: theirs.id, version: 1 },
					{ country: "GB" },
					LATER,
				),
			),
		);
		expect(error.code).toBe("not_found");
		expect(await row(theirs.id)).toMatchObject({ country: "IN", version: 1 });
	});

	test("a missing id gives not_found", async () => {
		const { userId } = await withProfileRow();
		const error = await apiError(
			withUser(as(userId), "write", (tx) =>
				versionedUpdate(
					tx,
					profile,
					{ id: "0192f0c4-8a1b-7c2d-9e3f-0123456789ab", version: 1 },
					{ country: "GB" },
					LATER,
				),
			),
		);
		expect(error.code).toBe("not_found");
	});

	test("the caller cannot set version or updated_at through `set`", async () => {
		const { userId, id } = await withProfileRow();
		await withUser(as(userId), "write", (tx) =>
			versionedUpdate(
				tx,
				profile,
				{ id, version: 1 },
				{ country: "US", version: 99, updatedAt: new Date(GOLDEN_NOW) },
				LATER,
			),
		);
		expect(await row(id)).toMatchObject({ version: 2, updated_at: LATER });
	});
});

describe("versionedDelete (BR-P2-21)", () => {
	test("deletes the row at its current version", async () => {
		const { userId, id } = await withProfileRow();
		await withUser(as(userId), "write", (tx) =>
			versionedDelete(tx, profile, { id, version: 1 }),
		);
		expect(await row(id)).toBeUndefined();
	});

	test("a stale version gives version_conflict and keeps the row", async () => {
		const { userId, id } = await withProfileRow();
		await owner.query("UPDATE app.profile SET version = 2 WHERE id = $1", [id]);
		const error = await apiError(
			withUser(as(userId), "write", (tx) =>
				versionedDelete(tx, profile, { id, version: 1 }),
			),
		);
		expect(error.code).toBe("version_conflict");
		expect(error.details["current"]).toMatchObject({ id, version: 2 });
		expect(await row(id)).toBeDefined();
	});

	test("another user's row gives not_found and keeps it", async () => {
		const mine = await withProfileRow();
		const theirs = await withProfileRow();
		const error = await apiError(
			withUser(as(mine.userId), "write", (tx) =>
				versionedDelete(tx, profile, { id: theirs.id, version: 1 }),
			),
		);
		expect(error.code).toBe("not_found");
		expect(await row(theirs.id)).toBeDefined();
	});
});
