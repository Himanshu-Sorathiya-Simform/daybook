import { act } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
	changedAnswer,
	IN_LOCALE,
	subscriptionAnswer,
	subscriptionItem,
} from "../../lib/__tests__/fixtures";
import { type DialogValues, startValues } from "../../lib/dialog";
import { ok, refuse, renderHookInApp, route, testNetwork } from "./helpers";
import { useSubscriptionSave } from "../useSubscriptionSave";

const network = testNetwork();

const NETFLIX = subscriptionItem("netflix");
const PATH = `/api/subscriptions/${NETFLIX.id}`;
const CREATED = {
	...subscriptionAnswer("netflix", { name: "Hulu" }),
	chargesCreated: 0,
};

const ADD: DialogValues = {
	...startValues(null, IN_LOCALE),
	name: "Hulu",
	amount: "399",
	category: "entertainment",
};

function setup(edited: typeof NETFLIX | null) {
	const handlers = {
		onClose: vi.fn(),
		onSaved: vi.fn(),
		onFieldsRefused: vi.fn(),
	};
	const view = renderHookInApp(() =>
		useSubscriptionSave({
			edited,
			items: edited ? [edited] : [],
			locale: IN_LOCALE,
			charges: [],
			...handlers,
		}),
	);
	const save = (values: DialogValues) =>
		act(async () => {
			await view.result.current.save(values);
		});
	return { ...view, ...handlers, save };
}

describe("useSubscriptionSave, an Add (BR-F05-24)", () => {
	test("posts the body with a new id and key, reports it and closes", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED, 201),
		);
		const { save, onSaved, onClose } = setup(null);
		await save(ADD);
		expect(posts).toHaveLength(1);
		expect(posts[0]?.body).toMatchObject({
			name: "Hulu",
			amountMinor: 39900,
			category: "entertainment",
			backfill: false,
		});
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "add" }),
		);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("keeps its id through a second save, so a retry is the same Subscription", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			refuse(500, "internal_error"),
		);
		const { save } = setup(null);
		await save(ADD);
		await save(ADD);
		const ids = posts.map((post) => (post.body as { id: string }).id);
		expect(ids[0]).toBe(ids[1]);
	});

	test("sends nothing while the body cannot be made", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED, 201),
		);
		const { save, onClose } = setup(null);
		await save({ ...ADD, category: null });
		expect(posts).toHaveLength(0);
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a refusal naming fields keeps the dialog open and asks for focus on the first", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(422, "validation_failed", { fields: { name: "Name is taken." } }),
		);
		const { save, result, onClose, onFieldsRefused } = setup(null);
		await save(ADD);
		expect(result.current.refusal.fields.name).toBe("Name is taken.");
		expect(onFieldsRefused).toHaveBeenCalledOnce();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a failed request shows the dialog's own line", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(500, "internal_error"),
		);
		const { save, result } = setup(null);
		await save(ADD);
		expect(result.current.refusal.failure).toMatch(/could not be saved/);
		expect(result.current.busy).toBe(false);
	});
});

describe("useSubscriptionSave, an Edit (BR-F05-46)", () => {
	const renamed = {
		...startValues(NETFLIX, IN_LOCALE),
		name: "Netflix India",
	};

	test("patches only what changed, at the version the dialog opened with", async () => {
		const patches = route(network, "patch", PATH, () =>
			ok(
				changedAnswer(
					subscriptionAnswer("netflix", { name: "Netflix India" }),
				),
			),
		);
		const { save, onSaved, onClose } = setup(NETFLIX);
		await save(renamed);
		expect(patches).toHaveLength(1);
		expect(patches[0]?.body).toMatchObject({ name: "Netflix India" });
		expect(patches[0]?.body).not.toHaveProperty("amountMinor");
		expect(patches[0]?.headers.get("if-match")).toBeTruthy();
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ kind: "edit", before: NETFLIX }),
		);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("with nothing changed it only closes", async () => {
		const patches = route(network, "patch", PATH, () =>
			ok(changedAnswer(CREATED)),
		);
		const { save, onSaved, onClose } = setup(NETFLIX);
		await save(startValues(NETFLIX, IN_LOCALE));
		expect(patches).toHaveLength(0);
		expect(onSaved).not.toHaveBeenCalled();
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a 409 opens the conflict view and keeps the dialog open", async () => {
		const current = subscriptionAnswer("netflix", {
			version: 3,
			name: "Netflix HD",
		});
		route(network, "patch", PATH, () =>
			refuse(409, "version_conflict", { details: { current } }),
		);
		const { save, result, onClose } = setup(NETFLIX);
		await save(renamed);
		expect(result.current.conflictView?.conflict.current).toEqual(current);
		expect(onClose).not.toHaveBeenCalled();
	});
});
