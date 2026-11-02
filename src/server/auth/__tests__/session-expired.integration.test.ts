import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";
import {
	GET as authGet,
	POST as authPost,
} from "../../../../app/api/auth/[...all]/route";
import { GET } from "../../../../app/api/session/expired/route";
import { parseOwnerEnv, serverEnv } from "../../env";

const ORIGIN = serverEnv().APP_ORIGIN;
const DOMAIN = "session-expired.integration.test";

let owner: Client;

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(async () => {
	await owner.query(`DELETE FROM auth."user" WHERE email LIKE '%@' || $1`, [
		DOMAIN,
	]);
	await owner.end();
});

/** Signs a new user up and returns their session cookie as `name=value`. */
async function signedIn(): Promise<string> {
	const response = await authPost(
		new Request(`${ORIGIN}/api/auth/sign-up/email`, {
			method: "POST",
			headers: { origin: ORIGIN, "content-type": "application/json" },
			body: JSON.stringify({
				email: `${randomUUID()}@${DOMAIN}`,
				password: "correct horse battery",
				name: "Asha",
			}),
		}),
	);
	const set = response.headers
		.getSetCookie()
		.find((cookie) => cookie.startsWith("daybook.session_token="));
	return set!.split(";")[0]!;
}

async function sessionIsValid(cookie: string): Promise<boolean> {
	const response = await authGet(
		new Request(`${ORIGIN}/api/auth/get-session`, { headers: { cookie } }),
	);
	return (await response.json()) !== null;
}

function expired(query: string, headers: Record<string, string>) {
	return GET(new Request(`${ORIGIN}/api/session/expired${query}`, { headers }));
}

const clearedNames = (response: Response) =>
	response.headers.getSetCookie().map((set) => set.slice(0, set.indexOf("=")));

// AC-P2-21
test("a cross-site request clears no cookie, keeps the session and goes to /login?expired=1", async () => {
	const cookie = await signedIn();
	const response = await expired("?next=%2Fdashboard", {
		cookie,
		"sec-fetch-site": "cross-site",
	});
	expect(response.status).toBe(303);
	expect(response.headers.get("location")).toBe(`${ORIGIN}/login?expired=1`);
	expect(clearedNames(response)).toEqual([]);
	expect(await sessionIsValid(cookie)).toBe(true);
});

// AC-P2-21
test("a cross-site reason=logout with daybook_logout=1 revokes the session and clears the cookies", async () => {
	const cookie = await signedIn();
	const response = await expired("?reason=logout", {
		cookie: `${cookie}; daybook_logout=1`,
		"sec-fetch-site": "cross-site",
	});
	expect(response.headers.get("location")).toBe(`${ORIGIN}/login?expired=1`);
	expect(clearedNames(response).sort()).toEqual([
		"daybook.session_token",
		"daybook_logout",
	]);
	expect(await sessionIsValid(cookie)).toBe(false);
});

// AC-P2-21
test("a cross-site reason=logout without daybook_logout keeps the session", async () => {
	const cookie = await signedIn();
	const response = await expired("?reason=logout", {
		cookie,
		"sec-fetch-site": "cross-site",
	});
	expect(clearedNames(response)).toEqual([]);
	expect(await sessionIsValid(cookie)).toBe(true);
});

test("a same-origin request clears the cookie and sends the user to login with next", async () => {
	const cookie = await signedIn();
	const response = await expired("?next=%2Fdashboard", {
		cookie,
		"sec-fetch-site": "same-origin",
	});
	expect(response.headers.get("location")).toBe(
		`${ORIGIN}/login?next=%2Fdashboard&expired=1`,
	);
	expect(clearedNames(response)).toEqual(["daybook.session_token"]);
});
