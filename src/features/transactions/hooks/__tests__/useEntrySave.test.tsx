import { act } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import type { TransactionCreateInput } from "@/lib/transactions/schemas";
import { idOf, row } from "../../lib/__tests__/fixtures";
import type { EntryLocale } from "../../lib/entry";
import { useEntrySave } from "../useEntrySave";
import { useEntryWrite } from "../useEntryWrite";
import { ok, refuse, renderHookInApp, route } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const LOCALE: EntryLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

const BODY: TransactionCreateInput = {
	id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a1c01",
	type: "expense",
	amountMinor: 64000,
	currency: "INR",
	occurredAt: "2026-10-19T16:45:00Z",
	occurredOn: "2026-10-19",
	createdAt: "2026-10-19T16:46:12Z",
	category: "food",
	payee: "Swiggy",
	description: null,
	note: null,
};
const EDITING = row({ id: idOf(21), version: 1 });
const PATH = `/api/transactions/${EDITING.id}`;
const CHANGE = { amountMinor: 310000, currency: "INR" } as const;

function setup(editing: typeof EDITING | null = null) {
	const handlers = {
		onEdited: vi.fn(),
		onGone: vi.fn(),
		onClose: vi.fn(),
		onFieldsRefused: vi.fn(),
	};
	const view = renderHookInApp(() => {
		const write = useEntryWrite({
			editing,
			locale: LOCALE,
			onClose: handlers.onClose,
			onFieldsRefused: handlers.onFieldsRefused,
		});
		const saving = useEntrySave({
			write,
			editing,
			locale: LOCALE,
			onEdited: handlers.onEdited,
			onGone: handlers.onGone,
			onClose: handlers.onClose,
		});
		return { ...write, ...saving };
	});
	return { ...view, ...handlers };
}

describe("useEntrySave, a create (BR-F03-21)", () => {
	test("posts the body and answers the saved row", async () => {
		const posts = route(network, "post", "/api/transactions", () =>
			ok(row({ id: BODY.id }), 201),
		);
		const { result } = setup();
		let saved: unknown;
		await act(async () => {
			saved = await result.current.sendCreate(BODY);
		});
		expect(posts).toHaveLength(1);
		expect(posts[0]?.body).toMatchObject({
			payee: "Swiggy",
			amountMinor: 64000,
		});
		expect(saved).toMatchObject({ id: BODY.id });
	});

	test("a second press while one is out sends nothing", async () => {
		let release: () => void = () => {};
		const held = new Promise<void>((resolve) => {
			release = resolve;
		});
		const posts = route(network, "post", "/api/transactions", async () => {
			await held;
			return ok(row({ id: BODY.id }), 201);
		});
		const { result } = setup();
		let first: Promise<unknown> = Promise.resolve();
		let second: unknown;
		await act(async () => {
			first = result.current.sendCreate(BODY);
			second = await result.current.sendCreate(BODY);
		});
		expect(second).toBeNull();
		release();
		await act(async () => {
			await first;
		});
		expect(posts).toHaveLength(1);
	});

	test("a 422 puts its message under its field, asks for focus and answers null", async () => {
		route(network, "post", "/api/transactions", () =>
			refuse(422, "validation_failed", {
				fields: { amountMinor: "Too big." },
			}),
		);
		const { result, onFieldsRefused } = setup();
		let saved: unknown = "unset";
		await act(async () => {
			saved = await result.current.sendCreate(BODY);
		});
		expect(saved).toBeNull();
		expect(result.current.server.amount).toBe("Too big.");
		expect(onFieldsRefused).toHaveBeenCalledOnce();
	});

	test("a failed request is one line, and a new press starts clean", async () => {
		route(network, "post", "/api/transactions", () =>
			refuse(500, "internal_error"),
		);
		const { result } = setup();
		await act(async () => {
			await result.current.sendCreate(BODY);
		});
		expect(result.current.failure).toBe("Your change wasn't saved. Try again.");
		act(() => result.current.reset());
		expect(result.current.failure).toBeNull();
		expect(result.current.server).toEqual({});
	});

	test("clear drops one field's message", async () => {
		route(network, "post", "/api/transactions", () =>
			refuse(422, "validation_failed", {
				fields: { amountMinor: "Too big.", payee: "Too long." },
			}),
		);
		const { result } = setup();
		await act(async () => {
			await result.current.sendCreate(BODY);
		});
		act(() => result.current.clear("amount"));
		expect(result.current.server).toEqual({ payee: "Too long." });
	});
});

describe("useEntrySave, an edit (BR-F03-23 to BR-F03-25)", () => {
	test("patches at the row's version, reports it and closes", async () => {
		const patches = route(network, "patch", PATH, () =>
			ok({ ...EDITING, amountMinor: 310000, version: 2 }),
		);
		const { result, onEdited, onClose } = setup(EDITING);
		await act(async () => {
			await result.current.sendEdit(CHANGE, 1);
		});
		expect(patches[0]?.headers.get("if-match")).toBe('"1"');
		expect(onEdited).toHaveBeenCalledWith(
			expect.objectContaining({ version: 2 }),
		);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a 409 opens the conflict view, which stays over the dialog", async () => {
		const current = { ...EDITING, amountMinor: 99900, version: 2 };
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result, onClose } = setup(EDITING);
		await act(async () => {
			await result.current.sendEdit(CHANGE, 1);
		});
		expect(result.current.conflict?.current).toEqual(current);
		expect(result.current.conflict?.change).toEqual(CHANGE);
		expect(onClose).not.toHaveBeenCalled();
		act(() => result.current.closeConflict());
		expect(result.current.conflict).toBeNull();
	});

	test("Keep theirs closes the view and the dialog", async () => {
		const current = { ...EDITING, version: 2 };
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { result, onClose } = setup(EDITING);
		await act(async () => {
			await result.current.sendEdit(CHANGE, 1);
		});
		act(() => result.current.keepTheirs(current));
		expect(result.current.conflict).toBeNull();
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a 404 says the row is gone and closes the dialog", async () => {
		route(network, "patch", PATH, () => refuse(404, "not_found"));
		const { result, onGone, onClose } = setup(EDITING);
		await act(async () => {
			await result.current.sendEdit(CHANGE, 1);
		});
		expect(onGone).toHaveBeenCalledWith(EDITING.id);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a failed request keeps the dialog open with its line", async () => {
		route(network, "patch", PATH, () => refuse(500, "internal_error"));
		const { result, onClose } = setup(EDITING);
		await act(async () => {
			await result.current.sendEdit(CHANGE, 1);
		});
		expect(result.current.failure).toBe("Your change wasn't saved. Try again.");
		expect(onClose).not.toHaveBeenCalled();
	});
});
