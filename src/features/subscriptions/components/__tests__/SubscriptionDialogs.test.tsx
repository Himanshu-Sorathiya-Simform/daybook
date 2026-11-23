import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { fieldsOf } from "../../lib/conflict";
import { subscriptionAnswer, subscriptionItem } from "../../lib/__tests__/fixtures";
import {
	type OpenDialog,
	SubscriptionDialogs,
	type SubscriptionDialogsProps,
} from "../SubscriptionDialogs";
import { FORMATS } from "./rows";

// Each dialog is tested on its own; here each is a stub that says it is open and for whom.
vi.mock("../SubscriptionDialog", async () => ({
	SubscriptionDialog: (await import("./stub-dialog")).stubDialog("subscription"),
}));
vi.mock("../CancelDialog", async () => ({
	CancelDialog: (await import("./stub-dialog")).stubDialog("cancel"),
}));
vi.mock("../ResumeDialog", async () => ({
	ResumeDialog: (await import("./stub-dialog")).stubDialog("resume"),
}));
vi.mock("../PauseDialog", async () => ({
	PauseDialog: (await import("./stub-dialog")).stubDialog("pause"),
}));
vi.mock("../DeleteDialog", async () => ({
	DeleteDialog: (await import("./stub-dialog")).stubDialog("delete"),
}));
vi.mock("../ConflictDialog", () => ({
	ConflictDialog: (props: { keepMineLine: string }) => (
		<p>conflict: {props.keepMineLine}</p>
	),
}));

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
	return render(
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
		const view = setup(null);
		expect(view.container).toBeEmptyDOMElement();
	});

	test("Add opens the Subscription dialog for nobody", () => {
		setup({ kind: "add", item: null });
		expect(screen.getByText("subscription for nobody")).toBeVisible();
	});

	test.each([
		["edit", "subscription"],
		["cancel", "cancel"],
		["resume", "resume"],
		["pause", "pause"],
		["delete", "delete"],
	] as const)(
		"%s opens the %s dialog for its Subscription, and only that one",
		(kind, name) => {
			setup({ kind, item: NETFLIX });
			expect(screen.getByText(`${name} for Netflix`)).toBeVisible();
			expect(screen.getAllByText(/ for /)).toHaveLength(1);
		},
	);

	test.each(["cancel", "resume", "pause", "delete"] as const)(
		"%s with no Subscription opens nothing",
		(kind) => {
			const view = setup({ kind, item: null });
			expect(view.container).toBeEmptyDOMElement();
		},
	);

	test("a conflict opens its view beside no dialog", () => {
		setup(null, {
			...NO_CONFLICT,
			conflict: {
				current: subscriptionAnswer("netflix"),
				yours: fieldsOf(NETFLIX),
				line: "Keep mine puts it back.",
				isDelete: false,
			},
		});
		expect(screen.getByText("conflict: Keep mine puts it back.")).toBeVisible();
	});
});
