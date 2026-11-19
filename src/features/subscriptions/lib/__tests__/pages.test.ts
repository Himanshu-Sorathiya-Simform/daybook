import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";

import { ApiRequestError } from "@/lib/api/client";
import { MAX_PAGES, fetchEveryPage } from "../pages";
import { charge, listPage } from "./fixtures";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const url = (path: string) => new URL(path, window.location.origin).toString();
const ok = (data: unknown) => HttpResponse.json({ data });

/** Serves `pages` from `/api/pages`, one per cursor in order, and records each cursor asked. */
function serve(pages: ReturnType<typeof listPage>[]) {
	const cursors: (string | null)[] = [];
	network.use(
		http.get(url("/api/pages"), ({ request }) => {
			const cursor = new URL(request.url).searchParams.get("cursor");
			cursors.push(cursor);
			return ok(pages[cursors.length - 1]);
		}),
	);
	return cursors;
}

const path = (cursor: string | null) =>
	cursor === null ? "/api/pages" : `/api/pages?cursor=${cursor}`;
const run = (signal = new AbortController().signal) => fetchEveryPage(path, signal);

describe("fetchEveryPage (BR-F05-48, D-617)", () => {
	// AC-F05-33
	test("one page with no next cursor is the whole set, from one request", async () => {
		const rows = [charge(), charge()];
		const cursors = serve([listPage(rows)]);
		expect(await run()).toEqual(rows);
		expect(cursors).toEqual([null]);
	});

	test("an empty set is an empty list, from one request", async () => {
		const cursors = serve([listPage([])]);
		expect(await run()).toEqual([]);
		expect(cursors).toHaveLength(1);
	});

	// AC-F05-33: a month of 130 charges reads 100 and 30.
	test("follows each next cursor, asking for the first page with none", async () => {
		const a = [charge(), charge()];
		const b = [charge()];
		const c = [charge(), charge(), charge()];
		const cursors = serve([listPage(a, "c1"), listPage(b, "c2"), listPage(c)]);
		expect(await run()).toEqual([...a, ...b, ...c]);
		expect(cursors).toEqual([null, "c1", "c2"]);
	});

	test("keeps the server's order across pages", async () => {
		const rows = Array.from({ length: 5 }, () => charge());
		serve([
			listPage(rows.slice(0, 2), "x"),
			listPage(rows.slice(2, 4), "y"),
			listPage(rows.slice(4)),
		]);
		expect((await run()).map((row) => row.id)).toEqual(
			rows.map((row) => row.id),
		);
	});

	test("a page with no rows but a next cursor is followed, not taken for the end", async () => {
		const last = [charge()];
		serve([listPage([], "next"), listPage(last)]);
		expect(await run()).toEqual(last);
	});

	// AC-F05-33: a failing second page is never part of a set.
	test("fails as a whole when a later page fails, handing back nothing from the first", async () => {
		let calls = 0;
		network.use(
			http.get(url("/api/pages"), () => {
				calls += 1;
				return calls === 1 ?
						ok(listPage([charge()], "c1"))
					:	HttpResponse.json(
							{
								error: {
									code: "internal",
									message: "m",
									requestId: "r",
								},
							},
							{ status: 500 },
						);
			}),
		);
		const error = await run().catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ApiRequestError);
		expect((error as ApiRequestError).status).toBe(500);
		expect(calls).toBe(2);
	});

	test("a page that cannot be reached fails the walk", async () => {
		network.use(http.get(url("/api/pages"), () => HttpResponse.error()));
		const error = await run().catch((caught: unknown) => caught);
		expect(error).toBeInstanceOf(ApiRequestError);
		expect((error as ApiRequestError).kind).toBe("network");
	});

	test("stops asking once the signal aborts between pages", async () => {
		const controller = new AbortController();
		let calls = 0;
		network.use(
			http.get(url("/api/pages"), () => {
				calls += 1;
				controller.abort();
				return ok(listPage([charge()], `c${calls}`));
			}),
		);
		const outcome = await run(controller.signal).catch(
			(caught: unknown) => caught,
		);
		expect(outcome).toBeInstanceOf(Error);
		expect(calls).toBe(1);
	});

	test("a signal aborted before the walk asks for nothing", async () => {
		let calls = 0;
		network.use(
			http.get(url("/api/pages"), () => {
				calls += 1;
				return ok(listPage([]));
			}),
		);
		const controller = new AbortController();
		controller.abort();
		await expect(run(controller.signal)).rejects.toBeInstanceOf(Error);
		expect(calls).toBe(0);
	});

	test("a cursor met a second time throws instead of going on for ever", async () => {
		const cursors: (string | null)[] = [];
		network.use(
			http.get(url("/api/pages"), ({ request }) => {
				cursors.push(new URL(request.url).searchParams.get("cursor"));
				return ok(listPage([charge()], "same"));
			}),
		);
		await expect(run()).rejects.toThrow(RangeError);
		// The first page, then the page "same" led to, whose own next cursor repeated it.
		expect(cursors).toEqual([null, "same"]);
	});

	test("a cursor that comes back after another page also throws", async () => {
		const answers = ["a", "b", "a"];
		let at = 0;
		network.use(
			http.get(url("/api/pages"), () =>
				ok(listPage([charge()], answers[at++]!)),
			),
		);
		await expect(run()).rejects.toThrow(RangeError);
		expect(at).toBe(3);
	});

	test("a walk longer than the page limit throws", async () => {
		let n = 0;
		network.use(
			http.get(url("/api/pages"), () => ok(listPage([], `cursor-${n++}`))),
		);
		await expect(run()).rejects.toThrow(RangeError);
		expect(n).toBe(MAX_PAGES);
	});

	test("a walk of exactly the page limit completes", async () => {
		let n = 0;
		network.use(
			http.get(url("/api/pages"), () => {
				n += 1;
				return ok(listPage([], n === MAX_PAGES ? null : `cursor-${n}`));
			}),
		);
		expect(await run()).toEqual([]);
		expect(n).toBe(MAX_PAGES);
	});
});
