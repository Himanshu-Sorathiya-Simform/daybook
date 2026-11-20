import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "vitest";

import {
	SUBSCRIPTION_NAMES_KEY,
	subscriptionChipLabel,
	subscriptionHref,
	subscriptionNamesOptions,
} from "../subscriptions";

describe("the shared Subscriptions key (STATE-5, D-541)", () => {
	// The Subscriptions page spells the same key as subscriptionKeys.list(), and its own
	// test pins it there, so both pages read one cache entry.
	test("is the list key under the subscriptions root", () => {
		expect([...SUBSCRIPTION_NAMES_KEY]).toEqual(["subscriptions", "list"]);
		expect(subscriptionNamesOptions().queryKey).toEqual([
			"subscriptions",
			"list",
		]);
	});
});

describe("subscriptionNamesOptions", () => {
	const select = subscriptionNamesOptions().select!;
	const answer = {
		items: [
			{ id: "a", name: "Netflix", amountMinor: 64900 },
			{ id: "b", name: "Cult Gym", amountMinor: 150000 },
		],
		totals: {},
	};

	test("reads each id's name from the list's answer, ignoring the rest of it", () => {
		const names = select(answer);
		expect(names.get("a")).toBe("Netflix");
		expect(names.get("b")).toBe("Cult Gym");
		expect(names.size).toBe(2);
	});

	test("an id the list does not hold has no name", () => {
		expect(select(answer).get("zzz")).toBeUndefined();
	});

	test("an empty list has no names", () => {
		expect(select({ items: [] }).size).toBe(0);
	});

	test("a cached full answer from the Subscriptions page serves it", () => {
		const client = new QueryClient();
		client.setQueryData(["subscriptions", "list"], answer);
		expect(client.getQueryData(subscriptionNamesOptions().queryKey)).toBe(
			answer,
		);
	});
});

describe("subscriptionChipLabel (D-541)", () => {
	test("is the name and charges", () => {
		expect(subscriptionChipLabel("Netflix")).toBe("Netflix charges");
	});

	test.each([undefined, null, ""])("is Subscription charges for %j", (name) => {
		expect(subscriptionChipLabel(name)).toBe("Subscription charges");
	});

	test("keeps a name as written, even with a trailing word", () => {
		expect(subscriptionChipLabel("Netflix charges")).toBe(
			"Netflix charges charges",
		);
	});
});

describe("subscriptionHref (BR-F03-16, BR-F05-21)", () => {
	test("opens the Subscriptions page on the Subscription", () => {
		expect(subscriptionHref("0192f0c4-7a1e")).toBe(
			"/subscriptions?open=0192f0c4-7a1e",
		);
	});

	test("encodes the id", () => {
		expect(subscriptionHref("a b&c")).toBe("/subscriptions?open=a%20b%26c");
	});
});
