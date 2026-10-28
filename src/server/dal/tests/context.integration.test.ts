import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { sessionFor, signedInUser } from "../../auth/tests/sessions";
import {
	createUser,
	GOLDEN_NOW,
	insertRow,
	PRIVATE_ROWS,
} from "../../db/tests/private-rows";
import { parseOwnerEnv } from "../../env";
import { readProfile, sessionUser } from "../context";
import { withUser } from "../with-user";

let owner: Client;
const users: string[] = [];

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

afterEach(() => {
	vi.useRealTimers();
});

const headers = (cookie?: string) => new Headers(cookie ? { cookie } : {});

describe("sessionUser (BR-P2-12)", () => {
	test("returns the session's user", async () => {
		const user = await signedInUser(owner, "context");
		users.push(user.id);
		expect(await sessionUser(headers(user.cookie))).toEqual({
			id: user.id,
			email: expect.stringContaining("@isolation.test"),
			name: "context",
		});
	});

	test("returns null with no cookie", async () => {
		expect(await sessionUser(headers())).toBeNull();
	});

	test("returns null for a cookie with a bad signature", async () => {
		const user = await signedInUser(owner, "context");
		users.push(user.id);
		const forged = user.cookie.replace(/\.[^.]+$/, ".AAAA");
		expect(await sessionUser(headers(forged))).toBeNull();
	});

	test("returns null once the user is deleted", async () => {
		const user = await signedInUser(owner, "context");
		await owner.query(`DELETE FROM auth."user" WHERE id = $1`, [user.id]);
		expect(await sessionUser(headers(user.cookie))).toBeNull();
	});

	test("returns null for an expired session", async () => {
		const id = await createUser(owner, "context");
		users.push(id);
		const cookie = await sessionFor(owner, id);
		await owner.query(
			"UPDATE auth.session SET expires_at = $1 WHERE user_id = $2",
			[GOLDEN_NOW, id],
		);
		// A day after it expired, by the frozen clock (TST-3).
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-03T06:30:00.000Z"),
		});
		expect(await sessionUser(headers(cookie))).toBeNull();
	});

	// D-433: reading never extends the session, even when Better Auth's daily update is due.
	test("never extends the session", async () => {
		const id = await createUser(owner, "context");
		users.push(id);
		const cookie = await sessionFor(owner, id);
		// A 7-day session started on the golden day, so it expires on 9 Nov. Better Auth extends
		// a session once its start is more than a day old, so by 4 Nov an extension is due.
		await owner.query(
			"UPDATE auth.session SET expires_at = $1 WHERE user_id = $2",
			["2026-11-09T06:30:00.000Z", id],
		);
		const before = await owner.query(
			"SELECT expires_at, updated_at FROM auth.session WHERE user_id = $1",
			[id],
		);
		// Two days after the session began: past Better Auth's one-day update age.
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-04T06:30:00.000Z"),
		});
		expect(await sessionUser(headers(cookie))).not.toBeNull();
		const after = await owner.query(
			"SELECT expires_at, updated_at FROM auth.session WHERE user_id = $1",
			[id],
		);
		expect(after.rows).toEqual(before.rows);
	});
});

describe("readProfile", () => {
	const as = (id: string) => ({ user: { id, email: "x", name: "x" } });

	test("returns the user's own profile, mapped to the context's fields", async () => {
		const id = await createUser(owner, "context");
		users.push(id);
		await insertRow(owner, "profile", PRIVATE_ROWS.profile(id));
		expect(await withUser(as(id), "read", readProfile)).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "monday",
			lastCatchUpOn: "2026-11-01",
		});
	});

	test("returns null before onboarding, even when other users have profiles", async () => {
		const other = await createUser(owner, "context");
		users.push(other);
		await insertRow(owner, "profile", PRIVATE_ROWS.profile(other));
		const id = await createUser(owner, "context");
		users.push(id);
		expect(await withUser(as(id), "read", readProfile)).toBeNull();
	});
});
