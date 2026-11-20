import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { isUuidV7 } from "@/lib/ids";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import { subscriptionAnswer, subscriptionItem } from "../../lib/__tests__/fixtures";
import type { SubscriptionItem } from "../../lib/types";
import { DeleteDialog, type DeleteDialogProps } from "../DeleteDialog";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const NETFLIX = subscriptionItem("netflix");
const PATH = `/api/subscriptions/${NETFLIX.id}`;
const DELETED = {
	changeDate: "2026-11-02",
	chargesCreated: 0,
	chargesKept: 2,
	chargesDeleted: 0,
	months: ["2026-09", "2026-10"],
};

function setup(
	item: SubscriptionItem = NETFLIX,
	props: Partial<DeleteDialogProps> = {},
) {
	const handlers = {
		onClose: vi.fn(),
		onCancelInstead: vi.fn(),
		onDeleted: vi.fn(),
	};
	renderInApp(
		<DeleteDialog
			isOpen
			item={item}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

const button = (name: string | RegExp) => screen.getByRole("button", { name });

describe("Delete Netflix? (BR-F05-44)", () => {
	// AC-F05-50
	test("is an alert dialog that says what becomes of its charges, and what Daybook forgets", () => {
		setup();
		expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
			"Delete Netflix?",
		);
		expect(
			screen.getByText(
				"Its 2 charges stay in Transactions as ordinary expenses.",
			),
		).toBeVisible();
		expect(
			screen.getByText(
				/Daybook stops adding charges and forgets the schedule and skipped dates\./,
			),
		).toBeVisible();
	});

	// AC-F05-50
	test("one charge, and none, read as the spec words them", () => {
		setup(subscriptionItem("netflix", { chargeCount: 1 }));
		expect(
			screen.getByText(
				"Its 1 charge stays in Transactions as an ordinary expense.",
			),
		).toBeVisible();
	});

	test("with no charge it says nothing changes in Transactions", () => {
		setup(subscriptionItem("netflix", { chargeCount: 0 }));
		expect(
			screen.getByText(
				"It has no charges yet, so nothing changes in Transactions.",
			),
		).toBeVisible();
	});

	test("the buttons are Keep Netflix and Delete Netflix", () => {
		setup();
		expect(button("Keep Netflix")).toBeVisible();
		expect(button("Delete Netflix")).toBeVisible();
	});

	test("focus starts on Keep, so Enter never deletes by accident", () => {
		setup();
		expect(button("Keep Netflix")).toHaveFocus();
	});
});

describe("cancel it instead (BR-F05-44)", () => {
	test.each(["active", "ending", "paused"] as const)(
		"a %s Subscription offers it",
		(status) => {
			setup(subscriptionItem("netflix", { status }));
			expect(screen.getByText(/To keep it under Ended/)).toBeVisible();
			expect(button("cancel it instead")).toBeVisible();
		},
	);

	test.each(["upcoming", "ended"] as const)(
		"an %s Subscription does not",
		(status) => {
			setup(subscriptionItem("netflix", { status }));
			expect(
				screen.queryByRole("button", { name: "cancel it instead" }),
			).toBeNull();
			expect(screen.queryByText(/To keep it under Ended/)).toBeNull();
		},
	);

	// AC-F05-50
	test("pressing it hands the Subscription on, to open Cancel", async () => {
		const { user, onCancelInstead } = setup();
		await user.click(button("cancel it instead"));
		expect(onCancelInstead).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ id: NETFLIX.id }),
		);
	});
});

describe("deleting (BR-F05-14, section 11)", () => {
	// AC-F05-50
	test("sends a delete at the version with a new key, then reports it and closes", async () => {
		const deletes = route(network, "delete", PATH, () => ok(DELETED));
		const { user, onDeleted, onClose } = setup();
		await user.click(button("Delete Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.body).toEqual({ changedAt: expect.any(String) });
		expect(deletes[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
		expect(isUuidV7(deletes[0]?.headers.get("idempotency-key") ?? "")).toBe(
			true,
		);
		expect(onDeleted).toHaveBeenCalledWith(
			expect.objectContaining({ id: NETFLIX.id }),
		);
	});

	// AC-F05-50
	test("a 404 counts as done: it is gone either way", async () => {
		route(network, "delete", PATH, () =>
			refuse(404, "not_found", { message: "gone" }),
		);
		const { user, onClose, onDeleted } = setup();
		await user.click(button("Delete Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(onDeleted).toHaveBeenCalled();
	});

	test("two presses send one request", async () => {
		const deletes = route(network, "delete", PATH, async () => {
			await delay(60);
			return ok(DELETED);
		});
		const { user, onClose } = setup();
		await user.dblClick(button("Delete Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(deletes).toHaveLength(1);
	});

	test("Keep closes without a write", async () => {
		const deletes = route(network, "delete", PATH, () => ok(DELETED));
		const { user, onClose } = setup();
		await user.click(button("Keep Netflix"));
		expect(onClose).toHaveBeenCalledOnce();
		expect(deletes).toHaveLength(0);
	});
});

describe("a refused Delete keeps the dialog open (section 8)", () => {
	// AC-F05-50
	test("a failed request says it could not be deleted", async () => {
		route(network, "delete", PATH, () => refuse(500, "internal_error"));
		const { user, onClose, onDeleted } = setup();
		await user.click(button("Delete Netflix"));
		expect(
			await screen.findByText(
				"The Subscription could not be deleted. Check your connection and try again.",
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		expect(onDeleted).not.toHaveBeenCalled();
	});

	test("a refusal with its own words shows them", async () => {
		route(network, "delete", PATH, () =>
			refuse(422, "validation_failed", {
				message: "This change can't be undone any more.",
			}),
		);
		const { user } = setup();
		await user.click(button("Delete Netflix"));
		expect(
			await screen.findByText("This change can't be undone any more."),
		).toBeVisible();
	});

	test("a 409 says it changed on another device", async () => {
		route(network, "delete", PATH, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: { current: subscriptionAnswer("netflix", { version: 9 }) },
			}),
		);
		route(network, "get", "/api/subscriptions", () => ok({}));
		const { user, onClose } = setup();
		await user.click(button("Delete Netflix"));
		expect(
			await screen.findByText(
				/^This Subscription changed on another device\./,
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a 401 shows nothing", async () => {
		route(network, "delete", PATH, () => refuse(401, "unauthenticated"));
		const { user } = setup();
		await user.click(button("Delete Netflix"));
		await waitFor(() =>
			expect(button("Delete Netflix")).not.toHaveAttribute(
				"aria-disabled",
				"true",
			),
		);
		expect(screen.queryByText(/could not be deleted/)).toBeNull();
	});

	test("it can be pressed again after a refusal", async () => {
		let at = 0;
		const deletes = route(network, "delete", PATH, () =>
			++at === 1 ? refuse(500, "internal_error") : ok(DELETED),
		);
		const { user, onClose } = setup();
		await user.click(button("Delete Netflix"));
		await screen.findByText(/could not be deleted/);
		await user.click(button("Delete Netflix"));
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(deletes).toHaveLength(2);
	});
});

describe("offline, before M5", () => {
	// AC-F05-50
	test("says so, disables Delete and sends nothing", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const deletes = route(network, "delete", PATH, () => ok(DELETED));
		const { user } = setup();
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(screen.getByText("You are offline. Connect to save.")).toBeVisible();
		await user.click(button("Delete Netflix"));
		expect(button("Delete Netflix")).toHaveAttribute("aria-disabled", "true");
		expect(deletes).toHaveLength(0);
	});

	test("Keep still works", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user, onClose } = setup();
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		await user.click(button("Keep Netflix"));
		expect(onClose).toHaveBeenCalledOnce();
	});
});
