import { act, screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";
import type { SetupServer } from "msw/node";
import { describe, expect, type Mock, test, vi } from "vitest";

import type { EditKind } from "../../hooks/useEditWrite";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import { changedAnswer, subscriptionAnswer } from "../../lib/__tests__/fixtures";

type User = ReturnType<typeof userEvent.setup>;

/** One Subscription dialog that sends one `PATCH`, as the shared suites drive it. */
export type WriteDialogHarness = {
	network: SetupServer;
	/** The path the dialog's `PATCH` goes to. */
	patch: string;
	/** What its confirmed write reports itself as. */
	kind: EditKind;
	/** The confirm button's name, as the dialog opens. */
	confirm: string;
	/** The button that closes it without a write. */
	dismiss: string;
	/** Renders the dialog open, on Netflix as the file's tests open it. */
	setup: () => { user: User; onClose: Mock; onSaved: Mock };
	/** Presses confirm once the dialog can save. */
	press: (user: User) => Promise<void>;
};

const conflictAt = (version: number, amountMinor?: number) =>
	refuse(409, "version_conflict", {
		message: "m",
		details: {
			current: subscriptionAnswer("netflix", {
				version,
				...(amountMinor === undefined ? {} : { amountMinor }),
			}),
		},
	});

/**
 * A 409 on the dialog's write (BR-F05-34, AC-F05-54): the conflict view opens over the dialog,
 * Keep mine sends the same change again at the saved version, Keep theirs sends nothing and
 * closes, and closing the view goes back to the dialog.
 */
export function conflictTests(h: WriteDialogHarness) {
	// AC-F05-54
	test("a 409 opens the conflict view over the dialog, which stays", async () => {
		route(h.network, "patch", h.patch, () => conflictAt(9, 79900));
		const { user, onSaved, onClose } = h.setup();
		await h.press(user);
		expect(
			await screen.findByRole("dialog", {
				name: "This Subscription changed on another device",
			}),
		).toBeVisible();
		expect(screen.getByRole("button", { name: "Keep mine" })).toBeVisible();
		expect(screen.getByRole("button", { name: "Keep theirs" })).toBeVisible();
		// The saved amount shows on both sides: the change does not touch it, so it does not differ.
		expect(screen.getAllByText("₹799.00")).toHaveLength(2);
		expect(
			screen.getByText(
				"Keep mine saves your change to the Subscription as it is saved now.",
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		expect(onSaved).not.toHaveBeenCalled();
	});

	// AC-F05-54
	test("Keep mine sends the same change again at the saved version, with its first change time", async () => {
		let at = 0;
		const patches = route(h.network, "patch", h.patch, () =>
			++at === 1 ?
				conflictAt(9)
			:	ok(changedAnswer(subscriptionAnswer("netflix", { version: 10 }))),
		);
		const { user, onSaved, onClose } = h.setup();
		await h.press(user);
		await user.click(await screen.findByRole("button", { name: "Keep mine" }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(2);
		expect(patches[1]?.headers.get("if-match")).toBe('"9"');
		expect(patches[1]?.body).toEqual(patches[0]?.body);
		expect(patches[1]?.headers.get("idempotency-key")).not.toBe(
			patches[0]?.headers.get("idempotency-key"),
		);
		// What Undo puts back is the Subscription as it was saved when Keep mine sent the change.
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: h.kind,
				before: expect.objectContaining({ version: 9 }),
			}),
		);
	});

	// AC-F05-54
	test("Keep theirs sends nothing and closes the dialog", async () => {
		const patches = route(h.network, "patch", h.patch, () => conflictAt(9));
		const { user, onSaved, onClose } = h.setup();
		await h.press(user);
		await user.click(await screen.findByRole("button", { name: "Keep theirs" }));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches).toHaveLength(1);
		expect(onSaved).not.toHaveBeenCalled();
	});

	test("closing the view without a choice goes back to the dialog", async () => {
		route(h.network, "patch", h.patch, () => conflictAt(9));
		const { user, onClose } = h.setup();
		await h.press(user);
		await screen.findByRole("button", { name: "Keep mine" });
		await user.keyboard("{Escape}");
		await waitFor(() =>
			expect(screen.queryByRole("button", { name: "Keep mine" })).toBeNull(),
		);
		expect(onClose).not.toHaveBeenCalled();
	});
}

/** Offline before M5 the dialog says so and sends nothing; its dismiss button and Escape close
 * it without a write. */
export function offlineAndClosingTests(h: WriteDialogHarness) {
	describe("offline, before M5", () => {
		test("says so, disables the button and sends nothing", async () => {
			vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
			const patches = route(h.network, "patch", h.patch, () => ok({}));
			const { user } = h.setup();
			act(() => {
				window.dispatchEvent(new Event("offline"));
			});
			expect(
				screen.getByText("You are offline. Connect to save."),
			).toBeVisible();
			const confirm = screen.getByRole("button", { name: h.confirm });
			await user.click(confirm);
			expect(confirm).toHaveAttribute("aria-disabled", "true");
			expect(patches).toHaveLength(0);
		});
	});

	describe("closing", () => {
		test(`${h.dismiss} closes without a write`, async () => {
			const patches = route(h.network, "patch", h.patch, () => ok({}));
			const { user, onClose } = h.setup();
			await user.click(screen.getByRole("button", { name: h.dismiss }));
			expect(onClose).toHaveBeenCalledOnce();
			expect(patches).toHaveLength(0);
		});

		test("Escape closes it", async () => {
			const { user, onClose } = h.setup();
			await user.keyboard("{Escape}");
			expect(onClose).toHaveBeenCalledOnce();
		});
	});
}
