import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import type { EditView } from "../../lib/edit-plan";
import { WhatChanges, type WhatChangesProps } from "../WhatChanges";

const VIEW: EditView = {
	body: { changedAt: "2026-11-02T06:30:00.000Z" },
	preview: true,
	noteOnly: false,
	nextDates: [],
	strip: [
		{ kind: "kept", label: "5 Oct", amount: "₹649.00" },
		{ kind: "today", label: "Today" },
		{ kind: "new", label: "5 Dec", amount: "₹799.00" },
		{ kind: "more", label: "" },
	],
	scheduleChanged: false,
	values: null,
	doubleCharge: null,
	passed: null,
	alsoPast: 0,
	costLine: null,
};

function setup(view: Partial<EditView> = {}, props: Partial<WhatChangesProps> = {}) {
	const handlers = { onSkipDoubleChange: vi.fn(), onAlsoPastChange: vi.fn() };
	renderInApp(
		<WhatChanges
			view={{ ...VIEW, ...view }}
			skipDouble
			alsoPast={false}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, user: userEvent.setup() };
}

describe("What changes (BR-F05-24)", () => {
	test("is a section with its heading and the strip", () => {
		setup();
		expect(screen.getByRole("region", { name: "What changes" })).toBeVisible();
		expect(screen.getByRole("heading", { name: "What changes" })).toBeVisible();
		expect(
			screen.getByRole("list", { name: "Charges around today" }),
		).toBeVisible();
	});

	test("a plain change shows nothing else", () => {
		setup();
		expect(screen.queryByRole("checkbox")).toBeNull();
		expect(screen.queryByText(/Past charges stay/)).toBeNull();
	});

	test("a schedule change says past charges stay and the new schedule starts tomorrow", () => {
		setup({ scheduleChanged: true });
		expect(
			screen.getByText(
				"Past charges stay as they are. The new schedule applies from tomorrow.",
			),
		).toBeVisible();
	});

	test("shows the value sentence", () => {
		setup({
			values: "Charges up to today keep their amount. Later ones use the new amount.",
		});
		expect(
			screen.getByText(
				"Charges up to today keep their amount. Later ones use the new amount.",
			),
		).toBeVisible();
	});

	test("shows the passed line", () => {
		setup({
			passed: "20 Oct has passed, so nothing is charged until Fri, 20 Nov.",
		});
		expect(
			screen.getByText(
				"20 Oct has passed, so nothing is charged until Fri, 20 Nov.",
			),
		).toBeVisible();
	});

	test("shows the cost line", () => {
		setup({
			costLine:
				"Monthly cost ₹20,273.92 → ₹21,773.92 · Yearly ₹2,43,287.00 → ₹2,61,287.00",
		});
		expect(
			screen.getByText(/^Monthly cost ₹20,273\.92 → ₹21,773\.92/),
		).toBeVisible();
	});
});

describe("the double-charge choice (BR-F05-31)", () => {
	const double = {
		skipOn: "2026-11-04",
		title: "Skip 4 Nov, so it isn't charged twice",
		description:
			"5 Oct was already charged, less than one month before it. The first charge on the new date is 4 Dec.",
	};

	test("is a checkbox with its sentence, ticked as given", () => {
		setup({ doubleCharge: double });
		const box = screen.getByRole("checkbox", {
			name: /Skip 4 Nov, so it isn't charged twice/,
		});
		expect(box).toBeChecked();
		expect(box).toHaveAccessibleDescription(double.description);
	});

	test("unticked when the dialog says so", () => {
		setup({ doubleCharge: double }, { skipDouble: false });
		expect(
			screen.getByRole("checkbox", { name: /Skip 4 Nov/ }),
		).not.toBeChecked();
	});

	test("pressing it reports the new state", async () => {
		const { user, onSkipDoubleChange } = setup({ doubleCharge: double });
		await user.click(screen.getByRole("checkbox", { name: /Skip 4 Nov/ }));
		expect(onSkipDoubleChange).toHaveBeenCalledWith(false);
	});

	test("Space on the keyboard toggles it", async () => {
		const { user, onSkipDoubleChange } = setup({ doubleCharge: double });
		await user.tab();
		await user.keyboard(" ");
		expect(onSkipDoubleChange).toHaveBeenCalledWith(false);
	});

	test("is not there without a double charge", () => {
		setup();
		expect(screen.queryByRole("checkbox", { name: /Skip/ })).toBeNull();
	});
});

describe("also changing the past charges (BR-F05-30)", () => {
	test("offers the count, off by default, with its explanation", () => {
		setup({ alsoPast: 2 });
		const box = screen.getByRole("checkbox", {
			name: /Also change the 2 past charges/,
		});
		expect(box).not.toBeChecked();
		expect(box).toHaveAccessibleDescription(
			"Name and category only. Past amounts never change.",
		);
	});

	test("one reads 1 past charge", () => {
		setup({ alsoPast: 1 });
		expect(
			screen.getByRole("checkbox", { name: /Also change the 1 past charge$/ }),
		).toBeVisible();
	});

	test("pressing it reports the new state", async () => {
		const { user, onAlsoPastChange } = setup({ alsoPast: 2 });
		await user.click(screen.getByRole("checkbox", { name: /Also change/ }));
		expect(onAlsoPastChange).toHaveBeenCalledWith(true);
	});

	test("shows ticked when given", () => {
		setup({ alsoPast: 2 }, { alsoPast: true });
		expect(screen.getByRole("checkbox", { name: /Also change/ })).toBeChecked();
	});

	test("is not there with no past charge to change", () => {
		setup({ alsoPast: 0 });
		expect(screen.queryByRole("checkbox", { name: /Also change/ })).toBeNull();
	});

	test("both choices can show together, each its own", () => {
		setup({
			alsoPast: 2,
			doubleCharge: {
				skipOn: "2026-11-04",
				title: "Skip 4 Nov, so it isn't charged twice",
				description: "x",
			},
		});
		expect(screen.getAllByRole("checkbox")).toHaveLength(2);
	});

	test("a disabled section cannot be changed", () => {
		setup({ alsoPast: 2 }, { isDisabled: true });
		expect(screen.getByRole("checkbox", { name: /Also change/ })).toBeDisabled();
	});
});
