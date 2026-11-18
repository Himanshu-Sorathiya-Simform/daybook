import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { insertProfile } from "../../../../../seed/load-golden";
import { createUser } from "../../../db/__tests__/private-rows";
import { runtimePool } from "../../../db/pools";
import { parseOwnerEnv } from "../../../env";
import { asUser } from "../../transactions/__tests__/helpers";
import {
	addCharge,
	addSubscription,
	subscriptionRow,
} from "../../subscriptions/__tests__/helpers";
import { currencyEditable } from "../read";

/** BR-F02-14: the currency is editable only while the user has no Transactions, no Budgets and
 * no Subscriptions. Subscriptions joined the check with their table (F05). */

let owner: Client;
const users: string[] = [];

beforeAll(async () => {
	owner = new Client({
		connectionString: parseOwnerEnv(process.env).DATABASE_URL_OWNER,
	});
	await owner.connect();
});

afterAll(async () => {
	await owner?.query(`DELETE FROM auth."user" WHERE id = ANY($1)`, [users]);
	await owner?.end();
	await runtimePool().end();
});

async function profileUser(label: string): Promise<string> {
	const userId = await createUser(owner, label);
	await insertProfile(owner, userId);
	users.push(userId);
	return userId;
}

const editable = async (userId: string) =>
	(await asUser(userId, (tx) => currencyEditable(tx))).result;

describe("currencyEditable and Subscriptions", () => {
	test("a user with nothing may change the currency", async () => {
		expect(await editable(await profileUser("cur-none"))).toBe(true);
	});

	test("one Subscription, and nothing else, locks it", async () => {
		const userId = await profileUser("cur-sub");
		await addSubscription(owner, userId);
		expect(await editable(userId)).toBe(false);
	});

	test("a Subscription with no charges still locks it", async () => {
		const userId = await profileUser("cur-sub-bare");
		await addSubscription(owner, userId, {
			startDate: "2026-12-05",
			chargesFrom: "2026-12-05",
		});
		expect(await editable(userId)).toBe(false);
	});

	test("deleting the Subscription unlocks it again", async () => {
		const userId = await profileUser("cur-sub-gone");
		const sub = await addSubscription(owner, userId);
		await owner.query("DELETE FROM app.subscriptions WHERE id = $1", [sub.id]);
		expect(await editable(userId)).toBe(true);
	});

	test("a charge left behind by a deleted Subscription is a Transaction: it still locks it", async () => {
		const userId = await profileUser("cur-charge");
		const sub = subscriptionRow();
		await addSubscription(owner, userId, sub);
		await addCharge(owner, userId, {
			subscriptionId: sub.id,
			dueOn: "2026-10-05",
		});
		await owner.query("DELETE FROM app.subscriptions WHERE id = $1", [sub.id]);
		expect(await editable(userId)).toBe(false);
	});

	test("another user's Subscription does not lock mine", async () => {
		const mine = await profileUser("cur-mine");
		const theirs = await profileUser("cur-theirs");
		await addSubscription(owner, theirs);
		expect(await editable(mine)).toBe(true);
		expect(await editable(theirs)).toBe(false);
	});
});
