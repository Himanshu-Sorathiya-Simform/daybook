import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { subscriptionItem } from "../../lib/__tests__/fixtures";
import type { SubscriptionItem } from "../../lib/types";
import {
	type SubscriptionShortcutsOptions,
	useSubscriptionShortcuts,
} from "../useSubscriptionShortcuts";

const LOCALE = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
} as const;

function Page(props: SubscriptionShortcutsOptions) {
	useSubscriptionShortcuts(props);
	return <input aria-label="Search" />;
}

function setup(
	item: SubscriptionItem | null = subscriptionItem("netflix"),
	covered = false,
) {
	const handlers = {
		onEdit: vi.fn(),
		onAction: vi.fn(),
		onClear: vi.fn(),
	};
	render(
		<Page
			item={item}
			covered={covered}
			locale={LOCALE}
			{...handlers}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("useSubscriptionShortcuts (BR-F05-45, D-630)", () => {
	test("E edits the selection", async () => {
		const { user, onEdit } = setup();
		await user.keyboard("e");
		expect(onEdit).toHaveBeenCalledExactlyOnceWith(
			subscriptionItem("netflix").id,
		);
	});

	test.each([
		["s", "skip"],
		["p", "pause"],
		["c", "cancel"],
		["{Delete}", "delete"],
		["{Backspace}", "delete"],
	])("%s acts as the menu's %s item", async (key, action) => {
		const { user, onAction } = setup();
		await user.keyboard(key);
		expect(onAction).toHaveBeenCalledExactlyOnceWith(
			action,
			subscriptionItem("netflix").id,
		);
	});

	test("R acts where the menu offers a resume, and does nothing where it offers none", async () => {
		const paused = setup(subscriptionItem("netflix", { status: "paused" }));
		await paused.user.keyboard("r");
		expect(paused.onAction).toHaveBeenCalledExactlyOnceWith(
			"resumeNow",
			subscriptionItem("netflix").id,
		);
	});

	test("a key the selection's menu does not offer does nothing", async () => {
		const { user, onAction } = setup();
		await user.keyboard("r");
		expect(onAction).not.toHaveBeenCalled();
	});

	test("Escape clears the selection", async () => {
		const { user, onClear } = setup();
		await user.keyboard("{Escape}");
		expect(onClear).toHaveBeenCalledOnce();
	});

	test("with nothing selected no key acts", async () => {
		const { user, onEdit, onAction, onClear } = setup(null);
		await user.keyboard("espc{Delete}{Escape}");
		expect(onEdit).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});

	test("while a dialog or the conflict view is up the page behind rests", async () => {
		const { user, onEdit, onAction, onClear } = setup(
			subscriptionItem("netflix"),
			true,
		);
		await user.keyboard("espc{Delete}{Escape}");
		expect(onEdit).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});

	test("typing in a text field is typing, not a shortcut", async () => {
		const { user, onEdit, onAction, onClear } = setup();
		await user.click(screen.getByRole("textbox", { name: "Search" }));
		await user.keyboard("espc{Escape}");
		expect(onEdit).not.toHaveBeenCalled();
		expect(onAction).not.toHaveBeenCalled();
		expect(onClear).not.toHaveBeenCalled();
	});
});
