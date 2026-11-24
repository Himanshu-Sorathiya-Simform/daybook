import { describe, expect, test } from "vitest";

import {
	chargesHref,
	OPEN_PARAM,
	openTarget,
	readOpenParam,
	withoutOpen,
} from "../deep-link";
import { subscriptionItem } from "./fixtures";

const netflix = subscriptionItem("netflix");
const ended = subscriptionItem("cultGym", { status: "ended" });

describe("readOpenParam (BR-F05-21)", () => {
	test("is the id in ?open=", () => {
		expect(OPEN_PARAM).toBe("open");
		expect(readOpenParam(new URLSearchParams(`open=${netflix.id}`))).toBe(
			netflix.id,
		);
	});

	test("is null with no parameter", () => {
		expect(readOpenParam(new URLSearchParams(""))).toBeNull();
		expect(readOpenParam(new URLSearchParams("view=table"))).toBeNull();
	});

	test("is null for an empty value", () => {
		expect(readOpenParam(new URLSearchParams("open="))).toBeNull();
	});

	test("takes the first of a repeated parameter", () => {
		expect(readOpenParam(new URLSearchParams("open=a&open=b"))).toBe("a");
	});

	test("keeps an id as given, with no trimming or case change", () => {
		expect(readOpenParam(new URLSearchParams("open=%20Ab"))).toBe(" Ab");
	});
});

describe("openTarget (BR-F05-21)", () => {
	const items = [netflix, ended];

	test("a running Subscription is selected, with no Ended group to open", () => {
		expect(openTarget(items, netflix.id)).toEqual({
			id: netflix.id,
			ended: false,
		});
	});

	test("an ended one is selected with its group to be opened", () => {
		expect(openTarget(items, ended.id)).toEqual({ id: ended.id, ended: true });
	});

	test("an unknown id selects nothing", () => {
		expect(openTarget(items, "0192f0c4-0000-7000-8000-000000000000")).toBeNull();
	});

	test("an empty list selects nothing", () => {
		expect(openTarget([], netflix.id)).toBeNull();
	});

	test("an id matches exactly, not by case", () => {
		expect(openTarget(items, netflix.id.toUpperCase())).toBeNull();
	});

	test.each(["active", "upcoming", "paused", "ending"] as const)(
		"a %s Subscription does not open the Ended group",
		(status) => {
			const item = subscriptionItem("netflix", { status });
			expect(openTarget([item], item.id)?.ended).toBe(false);
		},
	);
});

describe("withoutOpen (BR-F05-21)", () => {
	const origin = "http://localhost:3000";

	test("removes the parameter and leaves the bare page", () => {
		expect(withoutOpen(`${origin}/subscriptions?open=abc`, origin)).toBe(
			"/subscriptions",
		);
	});

	test("keeps every other parameter and the hash", () => {
		expect(
			withoutOpen(`${origin}/subscriptions?x=1&open=abc&y=2#top`, origin),
		).toBe("/subscriptions?x=1&y=2#top");
	});

	test("changes nothing when there is none", () => {
		expect(withoutOpen(`${origin}/subscriptions?x=1`, origin)).toBe(
			"/subscriptions?x=1",
		);
	});

	test("removes a repeated parameter entirely", () => {
		expect(withoutOpen(`${origin}/subscriptions?open=a&open=b`, origin)).toBe(
			"/subscriptions",
		);
	});

	test("takes a relative address too", () => {
		expect(withoutOpen("/subscriptions?open=abc", origin)).toBe(
			"/subscriptions",
		);
	});
});

describe("chargesHref (BR-F05-23)", () => {
	test("is Transactions filtered to the Subscription's charges", () => {
		expect(chargesHref(netflix.id)).toBe(`/transactions?sub=${netflix.id}`);
	});

	test("encodes the id", () => {
		expect(chargesHref("a b&c")).toBe("/transactions?sub=a%20b%26c");
	});
});
