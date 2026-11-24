import { onlineManager } from "@tanstack/react-query";
import { screen } from "@testing-library/react";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import {
	GOLDEN_BLOCK,
	meFor,
	renderInApp,
} from "@/components/app/__tests__/helpers";
import { ok, route } from "../../hooks/__tests__/helpers";
import { fieldsOf } from "../../lib/conflict";
import {
	listPage,
	subscriptionAnswer,
	subscriptionItem,
} from "../../lib/__tests__/fixtures";
import {
	type OpenDialog,
	SubscriptionDialogs,
	type SubscriptionDialogsProps,
} from "../SubscriptionDialogs";
import { FORMATS } from "./rows";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const NETFLIX = subscriptionItem("netflix");
const LOCALE = {
	...FORMATS,
	timezone: "Asia/Kolkata",
	weekStart: "monday" as const,
};

const NO_CONFLICT: SubscriptionDialogsProps["notices"] = {
	conflict: null,
	isUndoing: false,
	closeConflict: vi.fn(),
	keepMine: vi.fn(),
	keepTheirs: vi.fn(),
};

function setup(
	dialog: OpenDialog | null,
	notices: SubscriptionDialogsProps["notices"] = NO_CONFLICT,
) {
	// What the dialogs read: the profile, the payees an Add lists and a Subscription's charges.
	route(network, "get", "/api/me", () => ok(meFor("u1", GOLDEN_BLOCK)));
	route(network, "get", "/api/payees", () => ok({ items: [], currency: "INR" }));
	route(network, "get", "/api/transactions", () => ok(listPage([])));
	return renderInApp(
		<SubscriptionDialogs
			dialog={dialog}
			items={[NETFLIX]}
			locale={LOCALE}
			onClose={vi.fn()}
			onSaved={vi.fn()}
			onCancelInstead={vi.fn()}
			notices={notices}
		/>,
	);
}

describe("the dialog the page has open", () => {
	test("none open shows nothing", () => {
		setup(null);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("Add opens the Subscription dialog for nobody", async () => {
		setup({ kind: "add", item: null });
		expect(
			await screen.findByRole("dialog", { name: "Add a Subscription" }),
		).toBeVisible();
	});

	test.each([
		["edit", "Edit Netflix"],
		["cancel", "Cancel Netflix?"],
		["resume", "Resume Netflix?"],
		["pause", "Pause Netflix"],
	] as const)(
		"%s opens its dialog for its Subscription, and only that one",
		async (kind, title) => {
			setup({ kind, item: NETFLIX });
			expect(await screen.findByRole("dialog", { name: title })).toBeVisible();
			expect(screen.getAllByRole("dialog")).toHaveLength(1);
		},
	);

	test("delete opens its confirmation for its Subscription", async () => {
		setup({ kind: "delete", item: NETFLIX });
		expect(
			await screen.findByRole("alertdialog", { name: "Delete Netflix?" }),
		).toBeVisible();
	});

	test.each(["cancel", "resume", "pause", "delete"] as const)(
		"%s with no Subscription opens nothing",
		(kind) => {
			setup({ kind, item: null });
			expect(screen.queryByRole("dialog")).toBeNull();
			expect(screen.queryByRole("alertdialog")).toBeNull();
		},
	);

	test("a conflict opens its view beside no dialog", async () => {
		setup(null, {
			...NO_CONFLICT,
			conflict: {
				current: subscriptionAnswer("netflix"),
				yours: fieldsOf(NETFLIX),
				line: "Keep mine puts it back.",
				isDelete: false,
			},
		});
		expect(
			await screen.findByRole("dialog", {
				name: "This Subscription changed on another device",
			}),
		).toBeVisible();
		expect(screen.getAllByRole("dialog")).toHaveLength(1);
		expect(screen.getByText("Keep mine puts it back.")).toBeVisible();
	});
});
