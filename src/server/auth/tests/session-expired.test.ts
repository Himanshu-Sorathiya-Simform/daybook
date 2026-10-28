// @vitest-environment node
import { describe, expect, test, vi } from "vitest";
import {
	expireCookie,
	LOGOUT_COOKIE,
	parseCookies,
	sessionExpired,
} from "../session-expired";

const ORIGIN = "http://localhost:3000";
const SESSION = "daybook.session_token=abc.sig";

type Options = {
	query?: string;
	site?: string | null;
	cookie?: string;
	revoke?: (cookie: string) => Promise<unknown>;
};

async function call({
	query = "",
	site = "same-origin",
	cookie,
	revoke,
}: Options = {}) {
	const headers = new Headers();
	if (site !== null) headers.set("sec-fetch-site", site);
	if (cookie) headers.set("cookie", cookie);
	const revoked: string[] = [];
	const response = await sessionExpired(
		// The request's own host is never used for the redirect.
		new Request(`http://internal.host/api/session/expired${query}`, { headers }),
		{
			origin: ORIGIN,
			revoke:
				revoke
				?? (async (header) => {
					revoked.push(header);
				}),
		},
	);
	return {
		response,
		revoked,
		location: response.headers.get("location"),
		cleared: response.headers
			.getSetCookie()
			.map((set) => set.slice(0, set.indexOf("=")))
			.sort(),
	};
}

describe("parseCookies", () => {
	test("reads every name and value", () => {
		expect([...parseCookies("a=1; daybook.x=2;b=3")]).toEqual([
			["a", "1"],
			["daybook.x", "2"],
			["b", "3"],
		]);
	});

	test("keeps a value that holds = signs", () => {
		expect(
			parseCookies("daybook.session_token=abc==.sig").get(
				"daybook.session_token",
			),
		).toBe("abc==.sig");
	});

	test("keeps the first of two cookies with one name", () => {
		expect(parseCookies("a=1; a=2").get("a")).toBe("1");
	});

	test("skips parts without a name and value, and names that are not tokens", () => {
		expect([
			...parseCookies("flag; =x; bad name=1; a,b=2; ok=3").keys(),
		]).toEqual(["ok"]);
	});

	test("reads a missing header as no cookies", () => {
		expect(parseCookies(null).size).toBe(0);
	});
});

describe("expireCookie", () => {
	test("expires a cookie on path / at once", () => {
		expect(expireCookie("daybook.session_token")).toBe(
			"daybook.session_token=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax",
		);
	});

	test("adds Secure for a __Secure- name, which the browser needs to accept it", () => {
		expect(expireCookie("__Secure-daybook.session_token")).toMatch(/; Secure$/);
	});
});

describe("a same-origin request", () => {
	test.each(["same-origin", "none"])(
		"with Sec-Fetch-Site %s clears the session cookies",
		async (site) => {
			const { cleared } = await call({ site, cookie: SESSION });
			expect(cleared).toEqual(["daybook.session_token"]);
		},
	);

	test("clears every daybook. and __Secure-daybook. cookie and nothing else", async () => {
		const { cleared } = await call({
			cookie: "daybook.session_token=a; daybook.session_data=b; __Secure-daybook.session_token=c; daybook_logout=1; theme=dark; daybookx=1",
		});
		expect(cleared).toEqual([
			"__Secure-daybook.session_token",
			"daybook.session_data",
			"daybook.session_token",
		]);
	});

	test("sends the user to login with next and expired=1", async () => {
		const { response, location } = await call({
			query: "?next=%2Ftransactions%3Fmonth%3D2026-11",
			cookie: SESSION,
		});
		expect(response.status).toBe(303);
		expect(location).toBe(
			`${ORIGIN}/login?next=%2Ftransactions%3Fmonth%3D2026-11&expired=1`,
		);
	});

	test.each([
		["no next", ""],
		["a next to another site", "?next=https%3A%2F%2Fevil.example"],
		["a protocol-relative next", "?next=%2F%2Fevil.example"],
		["a next with a backslash", "?next=%2F%5Cevil.example"],
	])("with %s sends the user to /login?expired=1", async (_name, query) => {
		const { location } = await call({ query, cookie: SESSION });
		expect(location).toBe(`${ORIGIN}/login?expired=1`);
	});

	test("with reason=deleted sends the user to /?deleted=1 and clears the cookies", async () => {
		const { location, cleared, revoked } = await call({
			query: "?reason=deleted&next=%2Fdashboard",
			cookie: SESSION,
		});
		expect(location).toBe(`${ORIGIN}/?deleted=1`);
		expect(cleared).toEqual(["daybook.session_token"]);
		expect(revoked).toEqual([]);
	});

	test("never revokes the session, outside reason=logout", async () => {
		const { revoked } = await call({ cookie: SESSION });
		expect(revoked).toEqual([]);
	});

	test("with no cookies clears nothing and still redirects", async () => {
		const { cleared, location } = await call();
		expect(cleared).toEqual([]);
		expect(location).toBe(`${ORIGIN}/login?expired=1`);
	});

	test("is never cached", async () => {
		const { response } = await call({ cookie: SESSION });
		expect(response.headers.get("cache-control")).toBe("no-store");
	});
});

describe("a request from another site", () => {
	// AC-P2-21
	test.each([
		["cross-site", "cross-site"],
		["same-site", "same-site"],
		["no Sec-Fetch-Site", null],
	])("(%s) clears nothing and goes to /login?expired=1", async (_name, site) => {
		const { cleared, location, revoked } = await call({
			site,
			query: "?next=%2Fdashboard",
			cookie: SESSION,
		});
		expect(cleared).toEqual([]);
		expect(location).toBe(`${ORIGIN}/login?expired=1`);
		expect(revoked).toEqual([]);
	});

	test("with reason=deleted is refused the same way", async () => {
		const { cleared, location } = await call({
			site: "cross-site",
			query: "?reason=deleted",
			cookie: SESSION,
		});
		expect(cleared).toEqual([]);
		expect(location).toBe(`${ORIGIN}/login?expired=1`);
	});

	// AC-P2-21
	test("with reason=logout but no logout cookie is refused", async () => {
		const { cleared, revoked } = await call({
			site: "cross-site",
			query: "?reason=logout",
			cookie: SESSION,
		});
		expect(cleared).toEqual([]);
		expect(revoked).toEqual([]);
	});

	test("with a logout cookie but no reason=logout is refused", async () => {
		const { cleared, revoked } = await call({
			site: "cross-site",
			cookie: `${SESSION}; ${LOGOUT_COOKIE}=1`,
		});
		expect(cleared).toEqual([]);
		expect(revoked).toEqual([]);
	});

	test("with a logout cookie of another value is refused", async () => {
		const { cleared, revoked } = await call({
			site: "cross-site",
			query: "?reason=logout",
			cookie: `${SESSION}; ${LOGOUT_COOKIE}=0`,
		});
		expect(cleared).toEqual([]);
		expect(revoked).toEqual([]);
	});
});

describe("an offline logout (reason=logout)", () => {
	const cookie = `${SESSION}; daybook.session_data=x; ${LOGOUT_COOKIE}=1`;

	// AC-P2-21
	test("with daybook_logout=1 from another site revokes the session and clears the cookies", async () => {
		const { revoked, cleared, location } = await call({
			site: "cross-site",
			query: "?reason=logout",
			cookie,
		});
		expect(revoked).toEqual([cookie]);
		expect(cleared).toEqual([
			"daybook.session_data",
			"daybook.session_token",
			LOGOUT_COOKIE,
		]);
		expect(location).toBe(`${ORIGIN}/login?expired=1`);
	});

	test("from the same origin, without the marker, revokes and clears too", async () => {
		const { revoked, cleared } = await call({
			query: "?reason=logout",
			cookie: SESSION,
		});
		expect(revoked).toEqual([SESSION]);
		expect(cleared).toEqual(["daybook.session_token", LOGOUT_COOKIE]);
	});

	test("revokes a __Secure- session cookie too", async () => {
		const secure = `__Secure-daybook.session_token=abc; ${LOGOUT_COOKIE}=1`;
		const { revoked } = await call({
			site: "cross-site",
			query: "?reason=logout",
			cookie: secure,
		});
		expect(revoked).toEqual([secure]);
	});

	test("without a session cookie revokes nothing and still clears the marker", async () => {
		const { revoked, cleared } = await call({
			site: "cross-site",
			query: "?reason=logout",
			cookie: `daybook.session_data=x; ${LOGOUT_COOKIE}=1`,
		});
		expect(revoked).toEqual([]);
		expect(cleared).toEqual(["daybook.session_data", LOGOUT_COOKIE]);
	});

	test("ignores next", async () => {
		const { location } = await call({
			query: "?reason=logout&next=%2Fdashboard",
			cookie,
		});
		expect(location).toBe(`${ORIGIN}/login?expired=1`);
	});

	test("still clears the cookies when revoking fails, and logs only what failed", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const { cleared, location } = await call({
				site: "cross-site",
				query: "?reason=logout",
				cookie,
				revoke: async () => {
					throw new TypeError(`fetch failed for ${cookie}`);
				},
			});
			expect(cleared).toEqual([
				"daybook.session_data",
				"daybook.session_token",
				LOGOUT_COOKIE,
			]);
			expect(location).toBe(`${ORIGIN}/login?expired=1`);
			expect(error.mock.calls).toEqual([
				["[auth] Revoking a session failed", { name: "TypeError" }],
			]);
		} finally {
			error.mockRestore();
		}
	});
});
