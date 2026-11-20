import { describe, expect, test } from "vitest";

import type { Formats } from "../labels";
import {
	type MenuAction,
	READY_ACTIONS,
	readyMenu,
	rowMenu,
	shortcutAction,
	shortcutHints,
	type ShortcutKey,
} from "../menu";
import { subscriptionItem } from "./fixtures";

const F: Formats = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
};

const labels = (item: Parameters<typeof rowMenu>[0], f: Formats = F) =>
	rowMenu(item, f).map((entry) => entry.label);
const actions = (item: Parameters<typeof rowMenu>[0], f: Formats = F) =>
	rowMenu(item, f).map((entry) => entry.action);

const netflix = (changes: Parameters<typeof subscriptionItem>[1] = {}) =>
	subscriptionItem("netflix", changes);

describe("rowMenu by status (BR-F05-22)", () => {
	// AC-F05-36
	test("an active Subscription with a next due date", () => {
		expect(labels(netflix())).toEqual([
			"Edit",
			"Skip the 5 Nov charge",
			"Pause",
			"Cancel Subscription",
			"View charges",
			"Delete",
		]);
		expect(actions(netflix())).toEqual([
			"edit",
			"skip",
			"pause",
			"cancel",
			"viewCharges",
			"delete",
		]);
	});

	test("an active Subscription with no next due date cannot be skipped or paused", () => {
		expect(labels(netflix({ nextDueOn: null }))).toEqual([
			"Edit",
			"Cancel Subscription",
			"View charges",
			"Delete",
		]);
	});

	// AC-F05-36
	test("a paused Subscription offers Resume now and Change pause, and no Skip or Pause", () => {
		const paused = netflix({ status: "paused", nextDueOn: "2027-01-05" });
		expect(labels(paused)).toEqual([
			"Edit",
			"Resume now",
			"Change pause",
			"Cancel Subscription",
			"View charges",
			"Delete",
		]);
	});

	test("a paused Subscription with no next due date offers the same", () => {
		expect(labels(netflix({ status: "paused", nextDueOn: null }))).toEqual([
			"Edit",
			"Resume now",
			"Change pause",
			"Cancel Subscription",
			"View charges",
			"Delete",
		]);
	});

	// AC-F05-36
	test("an ending Subscription offers Skip, Pause, Change end date and Keep it going, and no Cancel", () => {
		expect(labels(netflix({ status: "ending", endDate: "2026-12-31" }))).toEqual(
			[
				"Edit",
				"Skip the 5 Nov charge",
				"Pause",
				"Change end date",
				"Keep it going",
				"View charges",
				"Delete",
			],
		);
		expect(actions(netflix({ status: "ending" }))).not.toContain("cancel");
	});

	test("an ending Subscription with no next due date has no Skip or Pause", () => {
		expect(labels(netflix({ status: "ending", nextDueOn: null }))).toEqual([
			"Edit",
			"Change end date",
			"Keep it going",
			"View charges",
			"Delete",
		]);
	});

	// AC-F05-36, BR-F05-12
	test("an upcoming Subscription has Delete instead of Cancel, and no Skip or Pause", () => {
		expect(
			labels(netflix({ status: "upcoming", nextDueOn: "2026-12-05" })),
		).toEqual(["Edit", "View charges", "Delete"]);
	});

	// AC-F05-36, section 6: Read-only
	test("an ended Subscription offers Resume, Edit, View charges and Delete", () => {
		expect(labels(netflix({ status: "ended", nextDueOn: null }))).toEqual([
			"Resume",
			"Edit",
			"View charges",
			"Delete",
		]);
	});

	test("an ended Subscription offers nothing else even if it holds a next due date", () => {
		expect(actions(netflix({ status: "ended" }))).toEqual([
			"resume",
			"edit",
			"viewCharges",
			"delete",
		]);
	});

	test("every status ends with View charges and a Delete after a separator", () => {
		for (const status of [
			"active",
			"ending",
			"paused",
			"upcoming",
			"ended",
		] as const) {
			const items = rowMenu(netflix({ status }), F);
			expect(items.at(-2)).toMatchObject({ action: "viewCharges" });
			expect(items.at(-1)).toEqual({
				action: "delete",
				label: "Delete",
				danger: true,
				separatorBefore: true,
			});
		}
	});

	test("only Delete is in the danger style or after a separator", () => {
		for (const status of [
			"active",
			"ending",
			"paused",
			"upcoming",
			"ended",
		] as const) {
			const others = rowMenu(netflix({ status }), F).filter(
				(entry) => entry.action !== "delete",
			);
			for (const entry of others) {
				expect(entry).not.toHaveProperty("danger");
				expect(entry).not.toHaveProperty("separatorBefore");
			}
		}
	});

	test("Edit and View charges are on every menu", () => {
		for (const status of [
			"active",
			"ending",
			"paused",
			"upcoming",
			"ended",
		] as const) {
			expect(actions(netflix({ status }))).toEqual(
				expect.arrayContaining(["edit", "viewCharges"]),
			);
		}
	});

	test("Resume is on an ended row's menu alone", () => {
		for (const status of ["active", "ending", "paused", "upcoming"] as const) {
			expect(actions(netflix({ status }))).not.toContain("resume");
		}
	});
});

describe("the Skip item (BR-F05-26)", () => {
	test("names the next due date", () => {
		expect(labels(netflix({ nextDueOn: "2026-12-01" }))[1]).toBe(
			"Skip the 1 Dec charge",
		);
	});

	test("names the year when it is not the current one", () => {
		expect(labels(subscriptionItem("amazonPrime"))[1]).toBe(
			"Skip the 12 Oct 2027 charge",
		);
	});

	test("follows the date locale", () => {
		expect(labels(netflix(), { ...F, dateLocale: "en-US" })[1]).toBe(
			"Skip the Nov 5 charge",
		);
	});
});

describe("the Pause item and the 24-month limit (BR-F05-43)", () => {
	// The limit is 2028-11-02; Pause needs the next due date before it.
	test.each([
		["2026-11-05", true],
		["2028-10-31", true],
		["2028-11-01", true],
		["2028-11-02", false],
		["2028-11-03", false],
		["2030-01-01", false],
	])("a next due date of %s offers Pause: %s", (nextDueOn, offered) => {
		expect(actions(netflix({ nextDueOn }))).toEqual(
			offered ?
				expect.arrayContaining(["pause"])
			:	expect.not.arrayContaining(["pause"]),
		);
	});

	test("Skip is still offered when Pause is not", () => {
		expect(actions(netflix({ nextDueOn: "2029-01-05" }))).toContain("skip");
	});

	test("the limit follows the profile's today", () => {
		expect(
			actions(netflix({ nextDueOn: "2028-11-02" }), {
				...F,
				today: "2026-11-03",
			}),
		).toContain("pause");
	});

	test("an ending Subscription's Pause follows the same limit", () => {
		expect(
			actions(netflix({ status: "ending", nextDueOn: "2028-11-02" })),
		).not.toContain("pause");
		expect(
			actions(netflix({ status: "ending", nextDueOn: "2028-11-01" })),
		).toContain("pause");
	});
});

describe("readyMenu (the actions built so far)", () => {
	test("every action of the menu is built", () => {
		expect([...READY_ACTIONS].sort()).toEqual(
			[
				"resume",
				"edit",
				"skip",
				"pause",
				"resumeNow",
				"changePause",
				"cancel",
				"changeEnd",
				"keepGoing",
				"viewCharges",
				"delete",
			].sort(),
		);
	});

	test.each(["active", "upcoming", "paused", "ending", "ended"] as const)(
		"a %s Subscription's menu is the whole menu",
		(status) => {
			const item = subscriptionItem("netflix", { status });
			expect(readyMenu(item, F)).toEqual(rowMenu(item, F));
		},
	);

	test("keeps the full order for the actions that are ready", () => {
		const ready = new Set<MenuAction>(["edit", "delete", "viewCharges"]);
		const item = subscriptionItem("netflix");
		expect(readyMenu(item, F, ready).map((entry) => entry.action)).toEqual([
			"edit",
			"viewCharges",
			"delete",
		]);
		expect(readyMenu(item, F, ready).at(-1)).toMatchObject({
			danger: true,
			separatorBefore: true,
		});
	});

	test("with none ready the menu is empty", () => {
		expect(readyMenu(subscriptionItem("netflix"), F, new Set())).toEqual([]);
	});

	test("with all ready it is the whole menu", () => {
		const all = new Set(
			rowMenu(subscriptionItem("netflix"), F).map((e) => e.action),
		);
		expect(readyMenu(subscriptionItem("netflix"), F, all)).toEqual(
			rowMenu(subscriptionItem("netflix"), F),
		);
	});
});

describe("the keys that act as the menu's items do (BR-F05-45, D-630)", () => {
	const act = (key: ShortcutKey, status: Parameters<typeof subscriptionItem>[1]) =>
		shortcutAction(key, subscriptionItem("netflix", status), F);

	// AC-F05-52
	test.each([
		["S", { status: "active" }, "skip"],
		["S", { status: "ending" }, "skip"],
		["P", { status: "active" }, "pause"],
		["P", { status: "ending" }, "pause"],
		["P", { status: "paused" }, "changePause"],
		["R", { status: "ended" }, "resume"],
		["R", { status: "paused" }, "resumeNow"],
		["R", { status: "ending" }, "keepGoing"],
		["C", { status: "active" }, "cancel"],
		["C", { status: "paused" }, "cancel"],
		["C", { status: "ending" }, "changeEnd"],
		["Delete", { status: "active" }, "delete"],
		["Delete", { status: "upcoming" }, "delete"],
		["Delete", { status: "ended" }, "delete"],
	] as const)("%s on a %j Subscription acts as %s", (key, status, action) => {
		expect(act(key, status)).toBe(action);
	});

	test.each([
		["S", { status: "paused" }],
		["S", { status: "ended" }],
		["S", { status: "upcoming" }],
		["S", { status: "active", nextDueOn: null }],
		["P", { status: "ended" }],
		["P", { status: "upcoming" }],
		["P", { status: "active", nextDueOn: "2028-11-02" }],
		["R", { status: "active" }],
		["R", { status: "upcoming" }],
		["C", { status: "ended" }],
		["C", { status: "upcoming" }],
	] as const)("%s on a %j Subscription acts as nothing", (key, status) => {
		expect(act(key, status)).toBeNull();
	});

	test("a key only ever acts as an item the menu offers", () => {
		for (const status of [
			"active",
			"ending",
			"paused",
			"upcoming",
			"ended",
		] as const) {
			const item = subscriptionItem("netflix", { status });
			const offered = rowMenu(item, F).map((entry) => entry.action);
			for (const key of ["S", "P", "R", "C", "Delete"] as const) {
				const action = shortcutAction(key, item, F);
				if (action !== null) expect(offered).toContain(action);
			}
		}
	});

	test("the hints name each key with the words of its action", () => {
		expect(shortcutHints(subscriptionItem("netflix"), F)).toEqual([
			"S to skip",
			"P to pause",
			"C to cancel",
			"Delete to delete",
		]);
		expect(
			shortcutHints(subscriptionItem("netflix", { status: "paused" }), F),
		).toEqual([
			"P to change pause",
			"R to resume now",
			"C to cancel",
			"Delete to delete",
		]);
	});

	test("an upcoming Subscription has only Delete", () => {
		expect(
			shortcutHints(subscriptionItem("netflix", { status: "upcoming" }), F),
		).toEqual(["Delete to delete"]);
	});
});
