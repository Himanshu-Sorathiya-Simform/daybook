import { Client } from "pg";
import { afterAll, beforeAll, expect, test } from "vitest";

import { loadGolden, type LoadedGolden } from "../../../../seed/load-golden";
import { call } from "@/server/api/__tests__/call";
import {
	closeOwner,
	connectOwner,
	freezeGoldenClock,
} from "@/server/api/__tests__/endpoint";
import { signedInUser } from "@/server/auth/__tests__/sessions";
import { GET } from "../route";

/** `GET /api/payees` (BR-F03-44, BR-F03-61) through the route wrapper, a real session and the golden clock,
 * on golden's M1 rows. */

let owner: Client;
let golden: LoadedGolden & { cookie: string };
let noProfile: { id: string; cookie: string };

beforeAll(async () => {
	owner = await connectOwner();
	const user = await signedInUser(owner, "payees-route");
	golden = { ...(await loadGolden(owner, user.id)), cookie: user.cookie };
	noProfile = await signedInUser(owner, "payees-route-new");
});

afterAll(() => closeOwner(owner, [golden?.userId, noProfile?.id].filter(Boolean)));

freezeGoldenClock();

const get = (query: string, cookie: string | null = golden.cookie) =>
	call(
		GET,
		`/api/payees${query ? `?${query}` : ""}`,
		cookie === null ? {} : { cookie },
	);

test("no session gets 401, and no profile 403 profile_required", async () => {
	expect((await get("", null)).status).toBe(401);
	const { status, body } = await get("", noProfile.cookie);
	expect(status).toBe(403);
	expect(body).toMatchObject({ error: { code: "profile_required" } });
});

// AC-F03-21, AC-F03-44, through HTTP; golden: section 5's category counts.
test("lists the payees and categories, with each payee's last expense and the profile currency", async () => {
	const { status, body } = await get("");
	expect(status).toBe(200);
	const data = (
		body as { data: { items: { payee: string }[]; categories: unknown[] } }
	).data;
	expect(data.items).toHaveLength(13);
	expect(data.items[0]).toEqual({
		payee: "Swiggy",
		count: 4,
		lastUsedOn: "2026-11-01",
		lastType: "expense",
		lastCategory: "food",
		lastExpense: { amountMinor: 42000, category: "food" },
	});
	expect(data.categories[0]).toEqual({ key: "food", count: 7 });
	// lastExpense holds money, so the answer carries the currency (API-6, D-451).
	expect(data).toHaveProperty("currency", "INR");
});

// AC-F03-44, D-451: a payee with income only has no last expense, and Croma's is #17, not the
// refund #18.
test("lastExpense is null for income only, and skips a newer refund", async () => {
	const { body } = await get("");
	const items = (
		body as {
			data: {
				items: { payee: string; lastExpense: unknown }[];
			};
		}
	).data.items;
	const last = (payee: string) =>
		items.find((item) => item.payee === payee)?.lastExpense;
	expect(last("Acme Corp")).toBeNull();
	expect(last("Croma")).toEqual({ amountMinor: 450000, category: "shopping" });
	expect(last("Netflix")).toEqual({
		amountMinor: 64900,
		category: "entertainment",
	});
});

// AC-F03-44
test("q=apart answers Sunrise Apartments alone, without categories", async () => {
	const { body } = await get("q=apart");
	expect(body).toEqual({
		data: {
			items: [
				{
					payee: "Sunrise Apartments",
					count: 3,
					lastUsedOn: "2026-11-01",
					lastType: "expense",
					lastCategory: "housing",
					lastExpense: { amountMinor: 1800000, category: "housing" },
				},
			],
			currency: "INR",
		},
	});
});

test("q is trimmed before it matches", async () => {
	const { body } = await get("q=%20%20o%20");
	expect(body).toMatchObject({ data: { items: [{ payee: "Indian Oil" }] } });
});

// AC-F03-44, BR-F03-61
test.each(["q=", `q=${"a".repeat(81)}`, "q=a%00", "q=a&q=b"])(
	"%s gets 400 naming q",
	async (query) => {
		const { status, body } = await get(query);
		expect(status).toBe(400);
		expect(body).toMatchObject({
			error: { code: "bad_request", details: { params: ["q"] } },
		});
	},
);
