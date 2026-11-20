import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { chargeTimeline, type TimelineLine } from "../../lib/panel";
import { charge, subscriptionItem } from "../../lib/__tests__/fixtures";
import { ChargeTimeline } from "../ChargeTimeline";
import { FORMATS } from "./rows";

const NETFLIX = subscriptionItem("netflix");

const paid = (dueOn: string, changes: Parameters<typeof charge>[0] = {}) =>
	charge({ dueOn, occurredOn: dueOn, ...changes });

function setup(
	lines: TimelineLine[],
	props: Partial<Parameters<typeof ChargeTimeline>[0]> = {},
) {
	const handlers = { onShowAllChange: vi.fn(), onUndoSkip: vi.fn() };
	const view = render(
		<ChargeTimeline
			lines={lines}
			showAll={false}
			canUndoSkip={false}
			{...handlers}
			{...props}
		/>,
	);
	return { ...handlers, ...view, user: userEvent.setup() };
}

const golden = () =>
	chargeTimeline(NETFLIX, [paid("2026-09-05"), paid("2026-10-05")], FORMATS);
const items = () => screen.getAllByRole("listitem");

describe("ChargeTimeline (BR-F05-40, AC-F05-37)", () => {
	test("lists the lines newest first with their dates, amounts and captions", () => {
		setup(golden());
		expect(items().map((li) => li.textContent)).toEqual([
			"5 Dec 2026₹649.00After that",
			"5 Nov 2026₹649.00Next. Added to Transactions on the day.",
			"5 Oct 2026₹649.00Charged",
			"5 Sept 2026₹649.00Charged",
		]);
	});

	test("an edited charge reads Charged · edited", () => {
		setup(
			chargeTimeline(NETFLIX, [paid("2026-10-05", { edited: true })], FORMATS),
		);
		expect(screen.getByText("Charged · edited")).toBeVisible();
	});

	test("a skipped line is struck through and says why", () => {
		const cult = subscriptionItem("cultGym");
		setup(chargeTimeline(cult, [], FORMATS));
		const skipped = screen.getByText("Skipped");
		expect(skipped).toHaveClass("line-through");
		expect(
			screen.getByText("You deleted this charge. Daybook won't add it again."),
		).toBeVisible();
	});

	test("a paused line reads Paused, struck, with Not added while paused", () => {
		const paused = subscriptionItem("netflix", {
			status: "paused",
			pause: { from: "2026-11-05", until: "2027-01-05" },
			nextDueOn: "2027-01-05",
		});
		setup(chargeTimeline(paused, [], FORMATS));
		expect(screen.getAllByText("Paused")[0]).toHaveClass("line-through");
		expect(screen.getAllByText("Not added while paused").length).toBeGreaterThan(
			0,
		);
	});

	test("a live amount is not struck through", () => {
		setup(golden());
		for (const amount of screen.getAllByText("₹649.00")) {
			expect(amount).not.toHaveClass("line-through");
		}
	});

	test("a line the calendar marks is highlighted", () => {
		setup(
			chargeTimeline(NETFLIX, [paid("2026-10-05")], FORMATS, {
				selectedDue: "2026-10-05",
			}),
		);
		const marked = items().find((li) => li.textContent?.includes("5 Oct 2026"));
		expect(marked).toHaveClass("bg-accent-soft");
		expect(items()[0]).not.toHaveClass("bg-accent-soft");
	});

	describe("Undo skip", () => {
		const skippedAhead = () =>
			chargeTimeline(
				subscriptionItem("netflix", { skips: ["2026-11-05"] }),
				[],
				FORMATS,
			);

		test("is left out until the Undo notices exist", () => {
			setup(skippedAhead());
			expect(screen.getByText("You skipped it.")).toBeVisible();
			expect(screen.queryByRole("button", { name: "Undo skip" })).toBeNull();
		});

		test("when allowed, a future skip offers it, and it names that date", async () => {
			const { user, onUndoSkip } = setup(skippedAhead(), {
				canUndoSkip: true,
			});
			await user.click(screen.getByRole("button", { name: "Undo skip" }));
			expect(onUndoSkip).toHaveBeenCalledExactlyOnceWith("2026-11-05");
		});

		test("a past deleted charge never offers it", () => {
			setup(chargeTimeline(subscriptionItem("cultGym"), [], FORMATS), {
				canUndoSkip: true,
			});
			expect(screen.queryByRole("button", { name: "Undo skip" })).toBeNull();
		});
	});

	describe("Show all (BR-F05-40)", () => {
		const charges = Array.from({ length: 9 }, (_, i) =>
			paid(`2026-0${i + 1 > 9 ? 9 : i + 1}-01`),
		);
		const many = () =>
			chargeTimeline(
				subscriptionItem("netflix", { nextDueOn: "2026-11-05" }),
				charges,
				FORMATS,
			);

		test("shows 7 lines and Show all with the total", () => {
			const lines = many();
			setup(lines);
			expect(items()).toHaveLength(7);
			expect(
				screen.getByRole("button", { name: `Show all ${lines.length}` }),
			).toBeVisible();
		});

		test("pressing it asks for all, and with all shown the button reads Show fewer", async () => {
			const lines = many();
			const { user, onShowAllChange, rerender } = setup(lines);
			await user.click(screen.getByRole("button", { name: /Show all/ }));
			expect(onShowAllChange).toHaveBeenCalledExactlyOnceWith(true);
			rerender(
				<ChargeTimeline
					lines={lines}
					showAll
					canUndoSkip={false}
					onShowAllChange={onShowAllChange}
					onUndoSkip={vi.fn()}
				/>,
			);
			expect(items()).toHaveLength(lines.length);
			await user.click(screen.getByRole("button", { name: "Show fewer" }));
			expect(onShowAllChange).toHaveBeenLastCalledWith(false);
		});

		test("with 7 lines or fewer there is no button", () => {
			setup(golden());
			expect(screen.queryByRole("button")).toBeNull();
			expect(
				within(screen.getByRole("list")).getAllByRole("listitem"),
			).toHaveLength(4);
		});
	});
});
