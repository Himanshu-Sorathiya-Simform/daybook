import { act, waitFor } from "@testing-library/react";
import { delay, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { Month } from "@/lib/budgets/months";
import { isUuidV7 } from "@/lib/ids";
import type { Formats } from "../../lib/labels";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import { deletionNotice, writeNotice } from "../../lib/notices";
import { useBudgetNotices } from "../useBudgetNotice";
import { ok, refuse, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const FOOD = goldenBudget("food");
const SAVED = budgetAnswer("food", { version: 3 });
const RULES = { schedule: FOOD.schedule, overrides: FOOD.overrides };

type Props = { month: Month };
function renderNotices(month: Month = "2026-10") {
	return renderHookInApp(
		({ month: shown }: Props) =>
			useBudgetNotices({ month: shown, currency: "INR", formats: IN }),
		{ initialProps: { month } },
	);
}

/** A change's notice: Undo restores food's rules at version 3. */
const change = () =>
	writeNotice({
		scope: "onward",
		month: "2026-11",
		limitMinor: 700000,
		before: FOOD,
		saved: SAVED,
		formats: IN,
	});
const created = () =>
	writeNotice({
		scope: "onward",
		month: "2026-11",
		limitMinor: 300000,
		before: null,
		saved: budgetAnswer("food", { id: "new-id", version: 1 }),
		formats: IN,
	});

describe("the notice's life (BR-F04-29)", () => {
	test("there is none to begin with", () => {
		const { result } = renderNotices();
		expect(result.current.notice).toBeNull();
		expect(result.current.isUndoing).toBe(false);
		expect(result.current.isRemoving).toBe(false);
	});

	test("show sets it, with its month and no failure", () => {
		const { result } = renderNotices("2026-10");
		act(() => result.current.show(change()));
		expect(result.current.notice).toMatchObject({
			category: "food",
			text: "Food limit is now ₹7,000.00 from November 2026.",
			month: "2026-10",
			failure: null,
			inPanel: true,
		});
	});

	test("the next write replaces it with one of its own", () => {
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		const first = result.current.notice?.id;
		act(() => result.current.show(deletionNotice("food", RULES)));
		expect(result.current.notice?.text).toBe("Food Budget deleted.");
		expect(result.current.notice?.id).not.toBe(first);
	});

	test("Dismiss ends it", () => {
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		act(() => result.current.dismiss());
		expect(result.current.notice).toBeNull();
	});

	test("a change of month ends it, for good", () => {
		const { result, rerender } = renderNotices("2026-10");
		act(() => result.current.show(change()));
		rerender({ month: "2026-09" });
		expect(result.current.notice).toBeNull();
		rerender({ month: "2026-10" });
		expect(result.current.notice).toBeNull();
	});

	test("a notice stays while the month does", () => {
		const { result, rerender } = renderNotices("2026-10");
		act(() => result.current.show(change()));
		rerender({ month: "2026-10" });
		expect(result.current.notice).not.toBeNull();
	});
});

describe("Undo sends what the notice's plan says", () => {
	// AC-F04-25
	test("after a create: DELETE at the version it returned, then the notice ends", async () => {
		const deletes = route(
			network,
			"delete",
			"/api/budgets/:id",
			() => new HttpResponse(null, { status: 204 }),
		);
		const { result } = renderNotices();
		act(() => result.current.show(created()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.notice).toBeNull());
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.path).toBe("/api/budgets/new-id");
		expect(deletes[0]?.headers.get("if-match")).toBe('"1"');
		expect(isUuidV7(deletes[0]?.headers.get("idempotency-key"))).toBe(true);
	});

	test("after a change: a restoring PATCH at the version the change returned", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			ok(budgetAnswer("food", { version: 4 })),
		);
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.notice).toBeNull());
		expect(patches[0]?.path).toBe(`/api/budgets/${SAVED.id}`);
		expect(patches[0]?.headers.get("if-match")).toBe('"3"');
		expect(patches[0]?.body).toEqual({
			schedule: FOOD.schedule,
			overrides: [],
			currency: "INR",
		});
	});

	test("after a delete: a restoring POST with the rules and a new id", async () => {
		const posts = route(network, "post", "/api/budgets", () =>
			ok(budgetAnswer("food", { version: 1 }), 201),
		);
		const { result } = renderNotices();
		act(() => result.current.show(deletionNotice("food", RULES)));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.notice).toBeNull());
		const body = posts[0]?.body as Record<string, unknown>;
		expect(body).toEqual({
			id: expect.any(String),
			category: "food",
			schedule: FOOD.schedule,
			overrides: [],
			currency: "INR",
		});
		expect(isUuidV7(body["id"] as string)).toBe(true);
		expect(body["id"]).not.toBe(FOOD.id);
		expect(isUuidV7(posts[0]?.headers.get("idempotency-key"))).toBe(true);
	});

	test("a delete's Undo that finds the Budget gone counts as done", async () => {
		route(network, "delete", "/api/budgets/:id", () => refuse(404, "not_found"));
		const { result } = renderNotices();
		act(() => result.current.show(created()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.notice).toBeNull());
	});

	test("does nothing with no notice", () => {
		const { result } = renderNotices();
		act(() => result.current.undo());
		expect(result.current.isUndoing).toBe(false);
	});

	test("while it is sent, isUndoing is true and a second press sends nothing", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", async () => {
			await delay(80);
			return ok(budgetAnswer("food", { version: 4 }));
		});
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.isUndoing).toBe(true));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.notice).toBeNull());
		expect(patches).toHaveLength(1);
		expect(result.current.isUndoing).toBe(false);
	});
});

describe("when Undo is refused (BR-F04-29, section 8)", () => {
	async function undoWith(answer: () => Response) {
		route(network, "patch", "/api/budgets/:id", answer);
		const view = renderNotices();
		act(() => view.result.current.show(change()));
		act(() => view.result.current.undo());
		return view;
	}

	test("no answer: the notice reads the failure and has no Undo left", async () => {
		const { result } = await undoWith(() => HttpResponse.error());
		await waitFor(() => expect(result.current.notice?.failure).not.toBeNull());
		expect(result.current.notice?.failure).toBe(
			"The Budget could not be saved. Check your connection and try again.",
		);
		expect(result.current.notice?.undo).toBeNull();
		expect(result.current.notice?.category).toBe("food");
	});

	test("a 404: the Budget was deleted on another device", async () => {
		const { result } = await undoWith(() => refuse(404, "not_found"));
		await waitFor(() =>
			expect(result.current.notice?.failure).toBe(
				"This Budget was deleted on another device.",
			),
		);
	});

	test("a server error reads the failure too", async () => {
		const { result } = await undoWith(() => refuse(500, "internal"));
		await waitFor(() => expect(result.current.notice?.failure).not.toBeNull());
	});

	test("a refusal with its own words shows them", async () => {
		const { result } = await undoWith(() =>
			refuse(422, "validation_failed", {
				message: "Use the profile's currency.",
			}),
		);
		await waitFor(() =>
			expect(result.current.notice?.failure).toBe(
				"Use the profile's currency.",
			),
		);
	});

	test("a 401 is the app's to answer: the notice stays as it was, with its Undo", async () => {
		const { result } = await undoWith(() => refuse(401, "unauthorized"));
		await waitFor(() => expect(result.current.isUndoing).toBe(false));
		expect(result.current.notice?.failure).toBeNull();
		expect(result.current.notice?.undo).not.toBeNull();
	});

	test("Undo does nothing once it has failed", async () => {
		const patches = route(network, "patch", "/api/budgets/:id", () =>
			HttpResponse.error(),
		);
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.notice?.failure).not.toBeNull());
		act(() => result.current.undo());
		expect(patches).toHaveLength(1);
	});
});

describe("an answer that comes late", () => {
	test("a confirmed Undo leaves a newer notice alone", async () => {
		route(network, "patch", "/api/budgets/:id", async () => {
			await delay(80);
			return ok(budgetAnswer("food", { version: 4 }));
		});
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.isUndoing).toBe(true));
		act(() => result.current.show(deletionNotice("shopping", RULES)));
		await waitFor(() => expect(result.current.isUndoing).toBe(false));
		expect(result.current.notice?.text).toBe("Shopping Budget deleted.");
	});

	test("a failed Undo leaves a newer notice alone", async () => {
		route(network, "patch", "/api/budgets/:id", async () => {
			await delay(80);
			return HttpResponse.error();
		});
		const { result } = renderNotices();
		act(() => result.current.show(change()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.isUndoing).toBe(true));
		act(() => result.current.show(deletionNotice("shopping", RULES)));
		await waitFor(() => expect(result.current.isUndoing).toBe(false));
		expect(result.current.notice?.text).toBe("Shopping Budget deleted.");
		expect(result.current.notice?.failure).toBeNull();
	});

	test("an Undo answered after a change of month ends nothing that is there", async () => {
		route(network, "patch", "/api/budgets/:id", async () => {
			await delay(80);
			return ok(budgetAnswer("food", { version: 4 }));
		});
		const { result, rerender } = renderNotices("2026-10");
		act(() => result.current.show(change()));
		act(() => result.current.undo());
		await waitFor(() => expect(result.current.isUndoing).toBe(true));
		rerender({ month: "2026-09" });
		expect(result.current.notice).toBeNull();
		act(() => result.current.show(deletionNotice("food", RULES)));
		await waitFor(() => expect(result.current.isUndoing).toBe(false));
		expect(result.current.notice?.text).toBe("Food Budget deleted.");
	});
});

describe("remove (BR-F04-25, BR-F04-29)", () => {
	const WITH_LIMIT = {
		...goldenBudget("food"),
		overrides: [{ month: "2026-10", limitMinor: 800000 }],
	};
	const REMOVE_PATH = `/api/budgets/${FOOD.id}/overrides/2026-10`;

	test("sends DELETE for the month at the Budget's version and shows the removal notice with Undo", async () => {
		const deletes = route(network, "delete", REMOVE_PATH, () =>
			ok(budgetAnswer("food", { version: 3 })),
		);
		const { result } = renderNotices();
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() => expect(result.current.notice).not.toBeNull());
		expect(deletes[0]?.headers.get("if-match")).toBe('"2"');
		expect(isUuidV7(deletes[0]?.headers.get("idempotency-key"))).toBe(true);
		expect(result.current.notice).toMatchObject({
			text: "One-month limit for October 2026 removed.",
			category: "food",
			failure: null,
			undo: {
				kind: "restore",
				version: 3,
				rules: {
					schedule: FOOD.schedule,
					overrides: [{ month: "2026-10", limitMinor: 800000 }],
				},
			},
		});
	});

	test("a refusal shows its failure for that category, with no Undo", async () => {
		route(network, "delete", REMOVE_PATH, () => refuse(404, "not_found"));
		const { result } = renderNotices();
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() => expect(result.current.notice).not.toBeNull());
		expect(result.current.notice).toMatchObject({
			category: "food",
			failure: "This Budget was deleted on another device.",
			undo: null,
			inPanel: true,
		});
	});

	test("no answer reads the failure", async () => {
		route(network, "delete", REMOVE_PATH, () => HttpResponse.error());
		const { result } = renderNotices();
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() =>
			expect(result.current.notice?.failure).toBe(
				"The Budget could not be saved. Check your connection and try again.",
			),
		);
	});

	test("a 401 shows nothing", async () => {
		route(network, "delete", REMOVE_PATH, () => refuse(401, "unauthorized"));
		const { result } = renderNotices();
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() => expect(result.current.isRemoving).toBe(false));
		expect(result.current.notice).toBeNull();
	});

	test("isRemoving holds while it is sent, and a second press sends nothing", async () => {
		const deletes = route(network, "delete", REMOVE_PATH, async () => {
			await delay(80);
			return ok(budgetAnswer("food", { version: 3 }));
		});
		const { result } = renderNotices();
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() => expect(result.current.isRemoving).toBe(true));
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() => expect(result.current.notice).not.toBeNull());
		expect(deletes).toHaveLength(1);
	});

	test("the notice belongs to the month it was shown in", async () => {
		route(network, "delete", REMOVE_PATH, () =>
			ok(budgetAnswer("food", { version: 3 })),
		);
		const { result, rerender } = renderNotices("2026-10");
		act(() => result.current.remove(WITH_LIMIT, "2026-10"));
		await waitFor(() => expect(result.current.notice).not.toBeNull());
		rerender({ month: "2026-09" });
		expect(result.current.notice).toBeNull();
	});
});

describe("the conflict view after a 409 (BR-F04-23, AC-F04-25, AC-F04-30)", () => {
	const SAVED = budgetAnswer("food", {
		version: 5,
		schedule: [...FOOD.schedule, { from: "2026-11", limitMinor: 550000 }],
	});
	const NEWER = budgetAnswer("food", {
		version: 6,
		schedule: [...SAVED.schedule, { from: "2027-01", limitMinor: 450000 }],
	});
	const conflict = (current = SAVED) =>
		refuse(409, "version_conflict", { details: { current } });
	const WITH_LIMIT = {
		...goldenBudget("food"),
		overrides: [{ month: "2026-10", limitMinor: 800000 }],
	};
	const REMOVE_PATH = `/api/budgets/${FOOD.id}/overrides/2026-10`;

	/** Shows the change's notice and presses Undo against `answer`. */
	async function undoMet(
		answer: (index: number) => Response | Promise<Response>,
		notice = change(),
		method: "patch" | "delete" | "post" = "patch",
		path = "/api/budgets/:id",
	) {
		const seen = route(network, method, path, (_, index) => answer(index));
		const view = renderNotices();
		act(() => view.result.current.show(notice));
		act(() => view.result.current.undo());
		await waitFor(() => expect(view.result.current.conflict).not.toBeNull());
		return { ...view, seen };
	}

	describe("on Undo", () => {
		test("after a change: the rules Undo puts back beside the saved Budget, with the Undo line", async () => {
			const { result } = await undoMet(() => conflict());
			expect(result.current.conflict).toEqual({
				current: SAVED,
				yours: { schedule: FOOD.schedule, overrides: [] },
				line: "Keep mine puts the Budget back as it was before your change.",
				isDelete: false,
			});
			// The notice stays, with its Undo, until a choice is made.
			expect(result.current.notice?.undo).not.toBeNull();
			expect(result.current.notice?.failure).toBeNull();
			expect(result.current.isUndoing).toBe(false);
		});

		test("after a create: the view for a delete, with the Budget the create made and no line", async () => {
			const { result } = await undoMet(() => conflict(), created(), "delete");
			expect(result.current.conflict).toMatchObject({
				isDelete: true,
				line: null,
				yours: { schedule: FOOD.schedule, overrides: [] },
				current: SAVED,
			});
		});

		test("after a delete: a Budget made for the category meanwhile meets it the same way", async () => {
			const { result } = await undoMet(
				() => conflict(),
				deletionNotice("food", RULES),
				"post",
				"/api/budgets",
			);
			expect(result.current.conflict).toMatchObject({
				isDelete: false,
				line: "Keep mine puts the Budget back as it was before your change.",
				yours: RULES,
				current: SAVED,
			});
		});

		test("a budget_exists answer opens it too", async () => {
			const { result } = await undoMet(
				() => refuse(409, "budget_exists", { details: { current: SAVED } }),
				deletionNotice("food", RULES),
				"post",
				"/api/budgets",
			);
			expect(result.current.conflict?.current).toEqual(SAVED);
		});

		test("Keep mine after a change restores at the saved version, then the notice ends", async () => {
			const { result, seen } = await undoMet((index) =>
				index === 0 ? conflict() : ok(budgetAnswer("food", { version: 6 })),
			);
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.conflict).toBeNull());
			expect(seen).toHaveLength(2);
			expect(seen[1]?.path).toBe(`/api/budgets/${SAVED.id}`);
			expect(seen[1]?.headers.get("if-match")).toBe('"5"');
			expect(seen[1]?.body).toEqual({
				schedule: FOOD.schedule,
				overrides: [],
				currency: "INR",
			});
			expect(seen[1]?.headers.get("idempotency-key")).not.toBe(
				seen[0]?.headers.get("idempotency-key"),
			);
			expect(result.current.notice).toBeNull();
		});

		test("Delete anyway after a create deletes at the saved version", async () => {
			const { result, seen } = await undoMet(
				(index) =>
					index === 0 ? conflict() : (
						new HttpResponse(null, { status: 204 })
					),
				created(),
				"delete",
			);
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.notice).toBeNull());
			expect(seen[1]?.path).toBe(`/api/budgets/${SAVED.id}`);
			expect(seen[1]?.headers.get("if-match")).toBe('"5"');
			expect(result.current.conflict).toBeNull();
		});

		test("Keep mine after a delete restores the Budget that was made meanwhile, never a second create", async () => {
			const patches = route(network, "patch", "/api/budgets/:id", () =>
				ok(budgetAnswer("food", { version: 6 })),
			);
			const posts = route(network, "post", "/api/budgets", () =>
				refuse(409, "budget_exists", { details: { current: SAVED } }),
			);
			const { result } = renderNotices();
			act(() => result.current.show(deletionNotice("food", RULES)));
			act(() => result.current.undo());
			await waitFor(() => expect(result.current.conflict).not.toBeNull());
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.notice).toBeNull());
			expect(posts).toHaveLength(1);
			expect(patches).toHaveLength(1);
			expect(patches[0]?.path).toBe(`/api/budgets/${SAVED.id}`);
			expect(patches[0]?.headers.get("if-match")).toBe('"5"');
			expect(patches[0]?.body).toEqual({
				schedule: FOOD.schedule,
				overrides: [],
				currency: "INR",
			});
		});

		test("another 409 shows the newer version, with the notice still there", async () => {
			const { result, seen } = await undoMet((index) =>
				index === 0 ? conflict(SAVED) : conflict(NEWER),
			);
			act(() => result.current.keepMine());
			await waitFor(() =>
				expect(result.current.conflict?.current).toEqual(NEWER),
			);
			expect(seen).toHaveLength(2);
			expect(result.current.notice?.undo).not.toBeNull();
			act(() => result.current.keepMine());
			await waitFor(() => expect(seen).toHaveLength(3));
			expect(seen[2]?.headers.get("if-match")).toBe('"6"');
		});

		test.each([
			[
				"a 404",
				() => refuse(404, "not_found"),
				"This Budget was deleted on another device.",
			],
			[
				"no answer",
				() => HttpResponse.error(),
				"The Budget could not be saved. Check your connection and try again.",
			],
		])(
			"Keep mine meeting %s closes the view and the notice reads the failure",
			async (_, answer, message) => {
				const { result } = await undoMet((index) =>
					index === 0 ? conflict() : answer(),
				);
				act(() => result.current.keepMine());
				await waitFor(() => expect(result.current.conflict).toBeNull());
				await waitFor(() =>
					expect(result.current.notice?.failure).toBe(message),
				);
				expect(result.current.notice?.undo).toBeNull();
			},
		);

		test("Keep theirs sends nothing, reads the saved Budget again and ends the notice", async () => {
			const { result, seen, queryClient } = await undoMet(() => conflict());
			const invalidate = vi.spyOn(queryClient, "invalidateQueries");
			act(() => result.current.keepTheirs());
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice).toBeNull();
			expect(seen).toHaveLength(1);
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["budgets"] });
		});

		test("closing the view without a choice sends nothing and leaves the notice", async () => {
			const { result, seen } = await undoMet(() => conflict());
			act(() => result.current.closeConflict());
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice?.text).toBe(
				"Food limit is now ₹7,000.00 from November 2026.",
			);
			expect(result.current.notice?.undo).not.toBeNull();
			expect(seen).toHaveLength(1);
			// Undo can be pressed again, and meets the conflict again.
			act(() => result.current.undo());
			await waitFor(() => expect(result.current.conflict).not.toBeNull());
			expect(seen).toHaveLength(2);
		});

		test("a 409 that arrives after the notice was replaced is not shown", async () => {
			route(network, "patch", "/api/budgets/:id", async () => {
				await delay(80);
				return conflict();
			});
			const { result } = renderNotices();
			act(() => result.current.show(change()));
			act(() => result.current.undo());
			await waitFor(() => expect(result.current.isUndoing).toBe(true));
			act(() => result.current.show(deletionNotice("shopping", RULES)));
			await waitFor(() => expect(result.current.isUndoing).toBe(false));
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice?.text).toBe("Shopping Budget deleted.");
		});

		test("a 409 that arrives after the notice was dismissed is not shown", async () => {
			route(network, "patch", "/api/budgets/:id", async () => {
				await delay(80);
				return conflict();
			});
			const { result } = renderNotices();
			act(() => result.current.show(change()));
			act(() => result.current.undo());
			await waitFor(() => expect(result.current.isUndoing).toBe(true));
			act(() => result.current.dismiss());
			await waitFor(() => expect(result.current.isUndoing).toBe(false));
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice).toBeNull();
		});

		test("a 409 that arrives after a change of month is not shown", async () => {
			route(network, "patch", "/api/budgets/:id", async () => {
				await delay(80);
				return conflict();
			});
			const { result, rerender } = renderNotices("2026-10");
			act(() => result.current.show(change()));
			act(() => result.current.undo());
			await waitFor(() => expect(result.current.isUndoing).toBe(true));
			rerender({ month: "2026-09" });
			await waitFor(() => expect(result.current.isUndoing).toBe(false));
			expect(result.current.conflict).toBeNull();
		});

		test("Keep mine is sent once however often it is pressed", async () => {
			const { result, seen } = await undoMet(async (index) => {
				if (index === 0) return conflict();
				await delay(80);
				return ok(budgetAnswer("food", { version: 6 }));
			});
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.isUndoing).toBe(true));
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.notice).toBeNull());
			expect(seen).toHaveLength(2);
		});

		test("a result after the notice was replaced leaves the newer one alone", async () => {
			const { result } = await undoMet((index) =>
				index === 0 ? conflict() : (
					delay(80).then(() => ok(budgetAnswer("food", { version: 6 })))
				),
			);
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.isUndoing).toBe(true));
			act(() => result.current.show(deletionNotice("shopping", RULES)));
			await waitFor(() => expect(result.current.isUndoing).toBe(false));
			expect(result.current.notice?.text).toBe("Shopping Budget deleted.");
		});
	});

	describe("on Remove", () => {
		async function removeMet(
			answer: (index: number) => Response | Promise<Response>,
		) {
			const seen = route(network, "delete", REMOVE_PATH, (_, index) =>
				answer(index),
			);
			const view = renderNotices();
			act(() => view.result.current.remove(WITH_LIMIT, "2026-10"));
			await waitFor(() => expect(view.result.current.conflict).not.toBeNull());
			return { ...view, seen };
		}

		test("shows the Budget without that one-month limit beside the saved one, and no notice", async () => {
			const { result } = await removeMet(() => conflict());
			expect(result.current.conflict).toEqual({
				current: SAVED,
				yours: { schedule: FOOD.schedule, overrides: [] },
				line: "Keep mine applies your change, the removal of the one-month limit for October 2026, to the saved Budget.",
				isDelete: false,
			});
			expect(result.current.notice).toBeNull();
			expect(result.current.isRemoving).toBe(false);
		});

		test("Keep mine removes it at the saved version and shows the removal notice over the saved Budget", async () => {
			const { result, seen } = await removeMet((index) =>
				index === 0 ? conflict() : ok(budgetAnswer("food", { version: 6 })),
			);
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.notice).not.toBeNull());
			expect(seen[1]?.path).toBe(`/api/budgets/${SAVED.id}/overrides/2026-10`);
			expect(seen[1]?.headers.get("if-match")).toBe('"5"');
			expect(seen[1]?.headers.get("idempotency-key")).not.toBe(
				seen[0]?.headers.get("idempotency-key"),
			);
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice).toMatchObject({
				text: "One-month limit for October 2026 removed.",
				undo: {
					kind: "restore",
					version: 6,
					rules: {
						schedule: SAVED.schedule,
						overrides: SAVED.overrides,
					},
				},
			});
		});

		test("another 409 shows the newer version", async () => {
			const { result, seen } = await removeMet((index) =>
				index === 0 ? conflict(SAVED) : conflict(NEWER),
			);
			act(() => result.current.keepMine());
			await waitFor(() =>
				expect(result.current.conflict?.current).toEqual(NEWER),
			);
			act(() => result.current.keepMine());
			await waitFor(() => expect(seen).toHaveLength(3));
			expect(seen[2]?.headers.get("if-match")).toBe('"6"');
		});

		test.each([
			[
				"a 404",
				() => refuse(404, "not_found"),
				"This Budget was deleted on another device.",
			],
			[
				"no answer",
				() => HttpResponse.error(),
				"The Budget could not be saved. Check your connection and try again.",
			],
		])(
			"Keep mine meeting %s closes the view and a failure notice shows",
			async (_, answer, message) => {
				const { result } = await removeMet((index) =>
					index === 0 ? conflict() : answer(),
				);
				act(() => result.current.keepMine());
				await waitFor(() => expect(result.current.conflict).toBeNull());
				await waitFor(() =>
					expect(result.current.notice?.failure).toBe(message),
				);
				expect(result.current.notice).toMatchObject({
					category: "food",
					undo: null,
					inPanel: true,
				});
			},
		);

		test("Keep mine meeting a 401 closes the view and shows nothing", async () => {
			const { result } = await removeMet((index) =>
				index === 0 ? conflict() : refuse(401, "unauthorized"),
			);
			act(() => result.current.keepMine());
			await waitFor(() => expect(result.current.conflict).toBeNull());
			expect(result.current.notice).toBeNull();
		});

		test("a 409 that arrives after a change of month is not shown", async () => {
			route(network, "delete", REMOVE_PATH, async () => {
				await delay(80);
				return conflict();
			});
			const { result, rerender } = renderNotices("2026-10");
			act(() => result.current.remove(WITH_LIMIT, "2026-10"));
			await waitFor(() => expect(result.current.isRemoving).toBe(true));
			rerender({ month: "2026-09" });
			await waitFor(() => expect(result.current.isRemoving).toBe(false));
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice).toBeNull();
		});

		test("Keep theirs sends nothing and reads the saved Budget again", async () => {
			const { result, seen, queryClient } = await removeMet(() => conflict());
			const invalidate = vi.spyOn(queryClient, "invalidateQueries");
			act(() => result.current.keepTheirs());
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice).toBeNull();
			expect(seen).toHaveLength(1);
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["budgets"] });
		});

		test("closing the view without a choice sends nothing", async () => {
			const { result, seen } = await removeMet(() => conflict());
			act(() => result.current.closeConflict());
			expect(result.current.conflict).toBeNull();
			expect(result.current.notice).toBeNull();
			expect(seen).toHaveLength(1);
		});

		test("a 409 with no Budget in it is only a failure", async () => {
			route(network, "delete", REMOVE_PATH, () =>
				refuse(409, "version_conflict"),
			);
			const { result } = renderNotices();
			act(() => result.current.remove(WITH_LIMIT, "2026-10"));
			await waitFor(() =>
				expect(result.current.notice?.failure).not.toBeNull(),
			);
			expect(result.current.conflict).toBeNull();
		});
	});

	test("Keep mine and Keep theirs do nothing with no conflict", () => {
		const { result } = renderNotices();
		act(() => result.current.keepMine());
		act(() => result.current.keepTheirs());
		act(() => result.current.closeConflict());
		expect(result.current.conflict).toBeNull();
		expect(result.current.notice).toBeNull();
	});
});
