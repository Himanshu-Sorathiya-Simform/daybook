import { act, waitFor } from "@testing-library/react";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { isUuidV7 } from "@/lib/ids";
import type { Confirmed } from "../../lib/notices";
import type { SubscriptionsLocale } from "../../lib/types";
import { subscriptionAnswer, subscriptionItem } from "../../lib/__tests__/fixtures";
import { ok, refuse, renderHookInApp, route, testClient } from "./helpers";
import { useSubscriptionNotice } from "../useSubscriptionNotice";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.useRealTimers();
});
afterAll(() => network.close());

const IN: SubscriptionsLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
};
const AT = "2026-11-02T08:00:00.000Z";
const NETFLIX = subscriptionItem("netflix");
const ID = NETFLIX.id;
const PATH = `/api/subscriptions/${ID}`;

const changed = (version: number, over = {}) => ({
	...subscriptionAnswer("netflix", { version, ...over }),
	changeDate: "2026-11-02",
	chargesCreated: 0,
	chargesUpdated: 0,
	chargesDeleted: 0,
	months: [],
});

/** An Edit that renamed Netflix, confirmed at version 4. */
const EDITED: Confirmed = {
	kind: "edit",
	before: NETFLIX,
	saved: changed(4, { name: "Netflix India" }),
	sent: { changedAt: AT, name: "Netflix India" },
};
/** An Add confirmed at version 1. */
const ADDED: Confirmed = {
	kind: "add",
	saved: { ...subscriptionAnswer("netflix", { version: 1 }), chargesCreated: 0 },
	sent: {} as never,
};
const SKIPPED: Confirmed = {
	kind: "skip",
	before: NETFLIX,
	saved: subscriptionAnswer("netflix", { version: 3 }),
	dueOn: "2026-11-05",
};
const UNSKIPPED: Confirmed = { ...SKIPPED, kind: "unskip" };

function setup() {
	const queryClient = testClient();
	const invalidate = vi.spyOn(queryClient, "invalidateQueries");
	const view = renderHookInApp(() => useSubscriptionNotice(IN), {
		queryClient,
	});
	const now = () => view.result.current;
	return { ...view, now, invalidate };
}
type Setup = ReturnType<typeof setup>;

const confirm = (view: Setup, confirmed: Confirmed) =>
	act(() => view.now().confirm(confirmed));
const undo = (view: Setup) => act(() => view.now().undo());
const conflict409 = (version: number, over = {}) =>
	refuse(409, "version_conflict", {
		message: "m",
		details: { current: subscriptionAnswer("netflix", { version, ...over }) },
	});

describe("showing a notice (BR-F05-33)", () => {
	test("there is none until a write is confirmed", () => {
		expect(setup().now().notice).toBeNull();
	});

	// AC-F05-53
	test("a confirmed write shows its text, its Subscription and its Undo", () => {
		const view = setup();
		confirm(view, EDITED);
		expect(view.now().notice).toMatchObject({
			text: "Netflix India saved. Next charge Thu, 5 Nov.",
			subscriptionId: ID,
			failure: null,
			inPanel: true,
		});
		expect(view.now().notice?.undo).not.toBeNull();
	});

	test("the next write replaces it, with a new id", () => {
		const view = setup();
		confirm(view, EDITED);
		const first = view.now().notice?.id;
		confirm(view, SKIPPED);
		expect(view.now().notice?.text).toBe("Skipped the 5 Nov Netflix charge.");
		expect(view.now().notice?.id).not.toBe(first);
	});

	test("Dismiss ends it", () => {
		const view = setup();
		confirm(view, EDITED);
		act(() => view.now().dismiss());
		expect(view.now().notice).toBeNull();
	});

	// AC-F05-53
	test("a delete's notice has no Undo and stays out of the panel", () => {
		const view = setup();
		confirm(view, { kind: "delete", before: NETFLIX, saved: null });
		expect(view.now().notice).toMatchObject({
			text: "Netflix deleted. Its charges stay in Transactions.",
			undo: null,
			inPanel: false,
		});
	});

	test("a failure reads its words and has no Undo", () => {
		const view = setup();
		act(() => view.now().fail(ID, "You are offline. Connect to save."));
		expect(view.now().notice).toMatchObject({
			failure: "You are offline. Connect to save.",
			undo: null,
			subscriptionId: ID,
			inPanel: true,
		});
	});

	test("Undo with no notice, or with none to undo, sends nothing", () => {
		const view = setup();
		const patches = route(network, "patch", PATH, () => ok({}));
		undo(view);
		confirm(view, { kind: "delete", before: NETFLIX, saved: null });
		undo(view);
		expect(patches).toHaveLength(0);
		expect(view.now().notice).not.toBeNull();
	});
});

describe("Undo (BR-F05-34)", () => {
	// AC-F05-53
	test("after an Add: DELETE with undo create at version 1, then the notice ends", async () => {
		const view = setup();
		const deletes = route(network, "delete", PATH, () =>
			ok({
				changeDate: "2026-11-02",
				chargesCreated: 0,
				chargesKept: 0,
				chargesDeleted: 0,
				months: [],
			}),
		);
		confirm(view, ADDED);
		undo(view);
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.body).toEqual({
			undo: "create",
			changedAt: expect.any(String),
		});
		expect(deletes[0]?.headers.get("if-match")).toBe('"1"');
		expect(isUuidV7(deletes[0]?.headers.get("idempotency-key") ?? "")).toBe(
			true,
		);
	});

	// AC-F05-53
	test("after an Edit: a PATCH of the previous values at the version the write returned", async () => {
		const view = setup();
		const patches = route(network, "patch", PATH, () => ok(changed(5)));
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(patches).toHaveLength(1);
		expect(patches[0]?.body).toEqual({
			name: "Netflix",
			changedAt: expect.any(String),
		});
		expect(patches[0]?.headers.get("if-match")).toBe('"4"');
	});

	test("the change time is the time of the press, not of the write", async () => {
		vi.useFakeTimers({
			toFake: ["Date"],
			now: new Date("2026-11-02T08:00:00Z"),
		});
		const view = setup();
		const patches = route(network, "patch", PATH, () => ok(changed(5)));
		confirm(view, EDITED);
		vi.setSystemTime(new Date("2026-11-02T09:30:00Z"));
		undo(view);
		await waitFor(() => expect(patches).toHaveLength(1));
		expect((patches[0]?.body as { changedAt: string }).changedAt).toBe(
			"2026-11-02T09:30:00.000Z",
		);
	});

	// AC-F05-53
	test("after a Cancel: the old end date with backfillGap", async () => {
		const view = setup();
		const patches = route(network, "patch", PATH, () => ok(changed(5)));
		confirm(view, {
			kind: "cancel",
			before: NETFLIX,
			saved: changed(4, { endDate: "2026-11-02" }),
			sent: { changedAt: AT, endDate: "2026-11-02" },
		});
		undo(view);
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(patches[0]?.body).toEqual({
			endDate: null,
			backfillGap: true,
			changedAt: expect.any(String),
		});
	});

	// AC-F05-53
	test("after a skip: the skip's DELETE, and after an Undo skip the skip again", async () => {
		const view = setup();
		const deletes = route(network, "delete", `${PATH}/skips/2026-11-05`, () =>
			ok(subscriptionAnswer("netflix", { version: 4 })),
		);
		const posts = route(network, "post", `${PATH}/skips`, () =>
			ok(subscriptionAnswer("netflix", { version: 4 })),
		);
		confirm(view, SKIPPED);
		undo(view);
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.headers.get("if-match")).toBe('"3"');
		expect(deletes[0]?.body).toEqual({ changedAt: expect.any(String) });
		confirm(view, UNSKIPPED);
		undo(view);
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(posts).toHaveLength(1);
		expect(posts[0]?.body).toEqual({
			dueOn: "2026-11-05",
			changedAt: expect.any(String),
		});
	});

	test("while it is on its way the page is told, and a second press sends nothing", async () => {
		const view = setup();
		const patches = route(network, "patch", PATH, async () => {
			await delay(80);
			return ok(changed(5));
		});
		confirm(view, EDITED);
		act(() => {
			view.now().undo();
			view.now().undo();
		});
		await waitFor(() => expect(view.now().isUndoing).toBe(true));
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(patches).toHaveLength(1);
		expect(view.now().isUndoing).toBe(false);
	});
});

describe("a failed Undo (BR-F05-33)", () => {
	async function failed(answer: () => Response) {
		const view = setup();
		route(network, "patch", PATH, answer);
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(view.now().notice?.failure).not.toBeNull());
		return view;
	}

	test("a 422 says it can't be undone any more, with no Undo left", async () => {
		const view = await failed(() =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { pause: "x" },
			}),
		);
		expect(view.now().notice?.failure).toBe(
			"This change can't be undone any more.",
		);
		expect(view.now().notice?.undo).toBeNull();
	});

	test("a failed request says it could not be saved", async () => {
		const view = await failed(() => refuse(500, "internal_error"));
		expect(view.now().notice?.failure).toBe(
			"The Subscription could not be saved. Check your connection and try again.",
		);
	});

	test("a 404 says it was deleted on another device and reads the page again", async () => {
		const view = await failed(() =>
			refuse(404, "not_found", { message: "gone" }),
		);
		expect(view.now().notice?.failure).toBe(
			"This Subscription was deleted on another device.",
		);
		await waitFor(() => expect(view.invalidate).toHaveBeenCalled());
	});

	test("a 401 changes nothing: the notice stays with its Undo", async () => {
		const view = setup();
		const patches = route(network, "patch", PATH, () =>
			refuse(401, "unauthenticated"),
		);
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(patches).toHaveLength(1));
		await waitFor(() => expect(view.now().isUndoing).toBe(false));
		expect(view.now().notice?.failure).toBeNull();
		expect(view.now().notice?.undo).not.toBeNull();
	});

	test("Dismiss ends a failure", async () => {
		const view = await failed(() => refuse(500, "internal_error"));
		act(() => view.now().dismiss());
		expect(view.now().notice).toBeNull();
	});
});

describe("an answer that comes late (BR-F05-33)", () => {
	test("after Dismiss it changes nothing, whether it confirms or fails", async () => {
		for (const answer of [
			() => ok(changed(5)),
			() => refuse(500, "internal_error"),
		]) {
			const view = setup();
			const patches = route(network, "patch", PATH, async () => {
				await delay(60);
				return answer();
			});
			confirm(view, EDITED);
			undo(view);
			await waitFor(() => expect(patches).toHaveLength(1));
			act(() => view.now().dismiss());
			await waitFor(() => expect(view.now().isUndoing).toBe(false));
			expect(view.now().notice).toBeNull();
		}
	});

	test("after the next write it leaves the newer notice alone", async () => {
		const view = setup();
		const patches = route(network, "patch", PATH, async () => {
			await delay(60);
			return refuse(500, "internal_error");
		});
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(patches).toHaveLength(1));
		confirm(view, SKIPPED);
		await waitFor(() => expect(view.now().isUndoing).toBe(false));
		expect(view.now().notice).toMatchObject({
			text: "Skipped the 5 Nov Netflix charge.",
			failure: null,
		});
	});

	test("a confirmed Undo of an earlier notice does not end the newer one", async () => {
		const view = setup();
		const patches = route(network, "patch", PATH, async () => {
			await delay(60);
			return ok(changed(5));
		});
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(patches).toHaveLength(1));
		confirm(view, SKIPPED);
		await waitFor(() => expect(view.now().isUndoing).toBe(false));
		expect(view.now().notice?.text).toBe("Skipped the 5 Nov Netflix charge.");
	});
});

describe("a conflict on Undo (BR-F05-34)", () => {
	async function conflicted(
		confirmed: Confirmed,
		method: "patch" | "delete" = "patch",
	) {
		const view = setup();
		let at = 0;
		const answer =
			method === "patch" ?
				changed(10)
			:	{
					changeDate: "2026-11-02",
					chargesCreated: 0,
					chargesKept: 0,
					chargesDeleted: 0,
					months: [],
				};
		const sent = route(network, method, PATH, () =>
			++at === 1 ? conflict409(9, { name: "Netflix Premium" }) : ok(answer),
		);
		confirm(view, confirmed);
		undo(view);
		await waitFor(() => expect(view.now().conflict).not.toBeNull());
		return { view, sent };
	}

	// AC-F05-54
	test("opens the view with the saved Subscription and what Undo would leave", async () => {
		const { view } = await conflicted(EDITED);
		const { conflict } = view.now();
		expect(conflict?.current.version).toBe(9);
		expect(conflict?.yours).toMatchObject({ name: "Netflix" });
		expect(conflict?.isDelete).toBe(false);
		expect(conflict?.line).toBe(
			"Keep mine puts the Subscription back as it was before your change.",
		);
		// The notice waits where it was.
		expect(view.now().notice?.text).toMatch(/saved\./);
		expect(view.now().notice?.failure).toBeNull();
	});

	// AC-F05-54
	test("Keep mine sends the same Undo against the saved version, then the notice ends", async () => {
		const { view, sent } = await conflicted(EDITED);
		act(() => view.now().keepMine());
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(view.now().conflict).toBeNull();
		expect(sent).toHaveLength(2);
		expect(sent[1]?.headers.get("if-match")).toBe('"9"');
		expect((sent[1]?.body as { name: string }).name).toBe("Netflix");
		expect(sent[1]?.headers.get("idempotency-key")).not.toBe(
			sent[0]?.headers.get("idempotency-key"),
		);
	});

	// AC-F05-54
	test("Keep theirs sends nothing, ends the notice and reads the page again", async () => {
		const { view, sent } = await conflicted(EDITED);
		view.invalidate.mockClear();
		act(() => view.now().keepTheirs());
		expect(view.now().conflict).toBeNull();
		expect(view.now().notice).toBeNull();
		expect(sent).toHaveLength(1);
		await waitFor(() => expect(view.invalidate).toHaveBeenCalled());
	});

	test("closing the view without a choice sends nothing and keeps the notice", async () => {
		const { view, sent } = await conflicted(EDITED);
		act(() => view.now().closeConflict());
		expect(view.now().conflict).toBeNull();
		expect(view.now().notice?.undo).not.toBeNull();
		expect(sent).toHaveLength(1);
	});

	// AC-F05-54
	test("the Undo of an Add is a delete: Delete anyway sends a plain DELETE at the saved version", async () => {
		const { view, sent } = await conflicted(ADDED, "delete");
		expect(view.now().conflict?.isDelete).toBe(true);
		expect(view.now().conflict?.line).toBe(
			"Its charges stay in Transactions as ordinary expenses.",
		);
		// What it shows as the user's is the Subscription the Add made.
		expect(view.now().conflict?.yours.name).toBe("Netflix");
		act(() => view.now().keepMine());
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(sent[1]?.headers.get("if-match")).toBe('"9"');
		expect(sent[1]?.body).toEqual({ changedAt: expect.any(String) });
	});

	test("Keep it on the Undo of an Add sends nothing and ends the notice", async () => {
		const { view, sent } = await conflicted(ADDED, "delete");
		act(() => view.now().keepTheirs());
		expect(view.now().notice).toBeNull();
		expect(sent).toHaveLength(1);
	});

	test("Keep mine that meets a second 409 shows the newer Subscription", async () => {
		const view = setup();
		let at = 0;
		route(network, "patch", PATH, () =>
			++at < 3 ? conflict409(8 + at) : ok(changed(11)),
		);
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(view.now().conflict?.current.version).toBe(9));
		act(() => view.now().keepMine());
		await waitFor(() => expect(view.now().conflict?.current.version).toBe(10));
		expect(view.now().notice).not.toBeNull();
	});

	test("Keep mine that is refused another way reads the failure and closes the view", async () => {
		const view = setup();
		let at = 0;
		route(network, "patch", PATH, () =>
			++at === 1 ?
				conflict409(9)
			:	refuse(422, "validation_failed", {
					message: "m",
					fields: { pause: "x" },
				}),
		);
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(view.now().conflict).not.toBeNull());
		act(() => view.now().keepMine());
		await waitFor(() => expect(view.now().conflict).toBeNull());
		expect(view.now().notice?.failure).toBe(
			"This change can't be undone any more.",
		);
	});

	test("a second Keep mine press while the resend is out sends nothing more", async () => {
		const view = setup();
		let at = 0;
		const patches = route(network, "patch", PATH, async () => {
			if (++at === 1) return conflict409(9);
			await delay(60);
			return ok(changed(10));
		});
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(view.now().conflict).not.toBeNull());
		act(() => {
			view.now().keepMine();
			view.now().keepMine();
		});
		await waitFor(() => expect(view.now().notice).toBeNull());
		expect(patches).toHaveLength(2);
	});

	test("the view ends with its notice: a new write's notice takes it away", async () => {
		const { view } = await conflicted(EDITED);
		confirm(view, SKIPPED);
		expect(view.now().conflict).toBeNull();
	});

	test("the view ends with its notice: Dismiss takes it away too", async () => {
		const { view } = await conflicted(EDITED);
		act(() => view.now().dismiss());
		expect(view.now().conflict).toBeNull();
	});
});

describe("a refused write with no dialog", () => {
	const write = {
		kind: "skip" as const,
		request: {
			kind: "skip" as const,
			id: ID,
			body: { dueOn: "2026-11-05", changedAt: AT },
		},
		before: NETFLIX,
	};
	const refused = async (view: Setup, error: unknown) => {
		await act(async () => {
			await view.now().refused(error, write);
		});
	};
	const errorOf = async (answer: () => Response) => {
		route(network, "post", `${PATH}/skips`, answer);
		const { apiFetch } = await import("@/lib/api/client");
		try {
			await apiFetch(`${PATH}/skips`, {
				method: "POST",
				body: {},
				version: 1,
			});
		} catch (error) {
			return error;
		}
		throw new Error("did not fail");
	};

	test("a 422 is a failure notice with the server's words", async () => {
		const view = setup();
		await refused(
			view,
			await errorOf(() =>
				refuse(422, "validation_failed", {
					message: "m",
					fields: { dueOn: "Only an upcoming charge can be skipped." },
				}),
			),
		);
		expect(view.now().notice).toMatchObject({
			failure: "Only an upcoming charge can be skipped.",
			subscriptionId: ID,
		});
	});

	test("a 404 is a failure notice and reads the page again", async () => {
		const view = setup();
		await refused(
			view,
			await errorOf(() => refuse(404, "not_found", { message: "gone" })),
		);
		expect(view.now().notice?.failure).toBe(
			"This Subscription was deleted on another device.",
		);
		expect(view.invalidate).toHaveBeenCalled();
	});

	test("a 401 shows nothing", async () => {
		const view = setup();
		await refused(view, await errorOf(() => refuse(401, "unauthenticated")));
		expect(view.now().notice).toBeNull();
		expect(view.now().conflict).toBeNull();
	});

	test("a 409 opens the view with the skip put over the saved Subscription", async () => {
		const view = setup();
		await refused(
			view,
			await errorOf(() => conflict409(2, { skips: ["2026-12-05"] })),
		);
		expect(view.now().notice).toBeNull();
		expect(view.now().conflict).toMatchObject({
			line: "Keep mine saves your change to the Subscription as it is saved now.",
			isDelete: false,
		});
		expect(view.now().conflict?.yours.skips).toEqual([
			"2026-11-05",
			"2026-12-05",
		]);
	});

	test("an error that is not the API's is a bug and is thrown on", async () => {
		const view = setup();
		await expect(view.now().refused(new Error("bug"), write)).rejects.toThrow(
			"bug",
		);
	});

	test("a write conflict does not end when a notice is replaced", async () => {
		const view = setup();
		await refused(view, await errorOf(() => conflict409(2)));
		confirm(view, EDITED);
		expect(view.now().conflict).not.toBeNull();
	});

	test("Keep mine on a delete's conflict sends the same delete and the notice says it was deleted", async () => {
		const view = setup();
		const deleteWrite = {
			kind: "delete" as const,
			request: { kind: "delete" as const, id: ID, body: { changedAt: AT } },
			before: NETFLIX,
		};
		const deletes = route(network, "delete", PATH, () =>
			ok({
				changeDate: "2026-11-02",
				chargesCreated: 0,
				chargesKept: 2,
				chargesDeleted: 0,
				months: [],
			}),
		);
		await act(async () => {
			await view
				.now()
				.refused(await errorOf(() => conflict409(2)), deleteWrite);
		});
		expect(view.now().conflict?.isDelete).toBe(true);
		act(() => view.now().keepMine());
		await waitFor(() =>
			expect(view.now().notice?.text).toBe(
				"Netflix deleted. Its charges stay in Transactions.",
			),
		);
		expect(deletes[0]?.body).toEqual({ changedAt: AT });
		expect(deletes[0]?.headers.get("if-match")).toBe('"2"');
	});

	test("Keep mine on a resume now's conflict puts the notice up for a resume", async () => {
		const view = setup();
		const paused = subscriptionItem("netflix", {
			pause: { from: "2026-10-05", until: "2027-01-05" },
		});
		const resumeWrite = {
			kind: "resumeNow" as const,
			request: {
				kind: "change" as const,
				id: ID,
				body: {
					changedAt: AT,
					pause: { from: "2026-10-05", until: "2026-11-02" },
				},
			},
			before: paused,
		};
		const patches = route(network, "patch", PATH, () =>
			ok(changed(10, { nextDueOn: "2026-12-05" })),
		);
		await act(async () => {
			await view
				.now()
				.refused(
					await errorOf(() => conflict409(9, { pause: paused.pause })),
					resumeWrite,
				);
		});
		act(() => view.now().keepMine());
		await waitFor(() =>
			expect(view.now().notice?.text).toBe(
				"Netflix resumed. Next charge Sat, 5 Dec.",
			),
		);
		expect(patches[0]?.body).toEqual(resumeWrite.request.body);
		// Undoing it puts the pause as it was saved when Keep mine sent it.
		expect(view.now().notice?.undo?.request).toMatchObject({
			kind: "change",
			body: { pause: paused.pause },
		});
	});
});

describe("midnight (BR-F05-33, D-597)", () => {
	const HOURS = 3_600_000;
	function atEight() {
		vi.useFakeTimers({
			toFake: ["Date", "setTimeout", "clearTimeout"],
			now: new Date("2026-11-02T08:00:00Z"),
		});
		return setup();
	}

	// AC-F05-53
	test("the notice ends at the next midnight in the profile's zone", () => {
		const view = atEight();
		confirm(view, EDITED);
		// 8:00 UTC is 13:30 in Kolkata: midnight is 10.5 hours away.
		act(() => vi.advanceTimersByTime(10.5 * HOURS - 1));
		expect(view.now().notice).not.toBeNull();
		act(() => vi.advanceTimersByTime(1));
		expect(view.now().notice).toBeNull();
	});

	test("a failure ends then too", () => {
		const view = atEight();
		act(() => view.now().fail(ID, "x"));
		act(() => vi.advanceTimersByTime(10.5 * HOURS));
		expect(view.now().notice).toBeNull();
	});

	test("a notice shown later has its own midnight, and the first's timer is gone", () => {
		const view = atEight();
		confirm(view, EDITED);
		act(() => vi.advanceTimersByTime(5 * HOURS));
		confirm(view, SKIPPED);
		// 5.5 hours remain: the first notice's timer would have fired by now.
		act(() => vi.advanceTimersByTime(5.5 * HOURS - 1));
		expect(view.now().notice?.text).toBe("Skipped the 5 Nov Netflix charge.");
		act(() => vi.advanceTimersByTime(1));
		expect(view.now().notice).toBeNull();
	});

	test("a notice that ended before midnight leaves no timer to end a later one", () => {
		const view = atEight();
		confirm(view, EDITED);
		act(() => view.now().dismiss());
		confirm(view, SKIPPED);
		act(() => vi.advanceTimersByTime(10.5 * HOURS - 1));
		expect(view.now().notice).not.toBeNull();
	});

	test("the conflict view goes with its notice at midnight", async () => {
		const view = atEight();
		vi.useRealTimers();
		route(network, "patch", PATH, () => conflict409(9));
		confirm(view, EDITED);
		undo(view);
		await waitFor(() => expect(view.now().conflict).not.toBeNull());
		act(() => view.now().dismiss());
		expect(view.now().conflict).toBeNull();
	});
});
