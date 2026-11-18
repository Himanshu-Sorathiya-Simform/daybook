import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { goldenBudget } from "@/lib/budgets/__tests__/golden";
import type { BudgetRecord } from "@/lib/budgets/view";
import { isUuidV7 } from "@/lib/ids";
import { refuse, route } from "../../hooks/__tests__/helpers";
import { budgetAnswer } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import { DeleteBudgetDialog } from "../DeleteBudgetDialog";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};

function renderDelete(
	record: BudgetRecord = goldenBudget("food"),
	className?: string,
) {
	const handlers = { onClose: vi.fn(), onDeleted: vi.fn() };
	const view = renderInApp(
		<DeleteBudgetDialog
			isOpen
			record={record}
			formats={IN}
			{...handlers}
			{...(className ? { className } : {})}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

const confirm = () => screen.getByRole("button", { name: "Delete Budget" });

describe("DeleteBudgetDialog (BR-F04-06)", () => {
	test("asks with BR-F04-06's words, with focus on Cancel", () => {
		renderDelete(goldenBudget("transportation"));
		expect(screen.getByRole("alertdialog")).toHaveAccessibleName(
			"Delete the Transportation Budget?",
		);
		expect(
			screen.getByText(
				"Every month, including past ones, loses its Transportation limit.",
			),
		).toBeVisible();
		expect(screen.queryByText(/limit history/)).not.toBeInTheDocument();
		// No empty line stands in for the history.
		expect(
			screen.getByText(/^Every month, including past ones/).parentElement
				?.children,
		).toHaveLength(1);
		expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
	});

	test("a Budget with more than one change names its limit history", () => {
		renderDelete();
		expect(
			screen.getByText(
				"Its limit history (2 changes since September 2026) goes too. To keep it, stop the Budget from a month instead.",
			),
		).toBeVisible();
	});

	// Flow 7.5
	test("Delete Budget sends a delete at the Budget's version, then closes", async () => {
		const food = goldenBudget("food");
		const deletes = route(
			network,
			"delete",
			"/api/budgets/:id",
			() => new HttpResponse(null, { status: 204 }),
		);
		const { user, onClose, onDeleted } = renderDelete();
		await user.click(confirm());
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(deletes[0]?.path).toBe(`/api/budgets/${food.id}`);
		expect(deletes[0]?.headers.get("if-match")).toBe(`"${food.version}"`);
		expect(isUuidV7(deletes[0]?.headers.get("idempotency-key"))).toBe(true);
		expect(onDeleted).toHaveBeenCalledWith(food);
	});

	// D-615: each press builds its own idempotency key, so a second press in the same frame
	// would be a second, distinct delete.
	test("Delete Budget pressed twice in the same frame sends one delete", async () => {
		const deletes = route(network, "delete", "/api/budgets/:id", async () => {
			await delay(60);
			return new HttpResponse(null, { status: 204 });
		});
		const { onClose, onDeleted } = renderDelete();
		const button = confirm();
		act(() => {
			fireEvent.click(button);
			fireEvent.click(button);
		});
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(deletes).toHaveLength(1);
		expect(onDeleted).toHaveBeenCalledOnce();
	});

	// D-569
	test("a 404 counts as done", async () => {
		route(network, "delete", "/api/budgets/:id", () => refuse(404, "not_found"));
		const { user, onClose } = renderDelete();
		await user.click(confirm());
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	// Section 6
	test("no answer keeps it open with the delete's line", async () => {
		route(network, "delete", "/api/budgets/:id", () => HttpResponse.error());
		const { user, onClose } = renderDelete();
		await user.click(confirm());
		expect(
			await screen.findByText(
				"The Budget could not be deleted. Check your connection and try again.",
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a refusal with its own words shows them", async () => {
		route(network, "delete", "/api/budgets/:id", () =>
			refuse(429, "rate_limited", {
				message: "Too many changes. Wait a minute.",
			}),
		);
		const { user } = renderDelete();
		await user.click(confirm());
		expect(
			await screen.findByText("Too many changes. Wait a minute."),
		).toBeVisible();
	});

	describe("a 409 opens the conflict view (BR-F04-23, AC-F04-30)", () => {
		/** The Budget saved now: another device added 5,500.00 from November, as version 5. */
		const saved = () =>
			budgetAnswer("food", {
				version: 5,
				schedule: [
					...goldenBudget("food").schedule,
					{ from: "2026-11", limitMinor: 550000 },
				],
			});
		const conflict = () =>
			refuse(409, "version_conflict", { details: { current: saved() } });
		const view = () =>
			screen.getByRole("dialog", {
				name: "This Budget changed on another device",
			});
		const noView = () =>
			expect(
				screen.queryByRole("dialog", {
					name: "This Budget changed on another device",
				}),
			).not.toBeInTheDocument();

		test("shows the Budget as it was chosen to be deleted beside the one saved now", async () => {
			route(network, "delete", "/api/budgets/:id", () => conflict());
			const { user, onClose } = renderDelete();
			await user.click(confirm());
			expect(
				await screen.findByRole("dialog", {
					name: "This Budget changed on another device",
				}),
			).toBeVisible();
			expect(onClose).not.toHaveBeenCalled();
			const november = within(view())
				.getAllByRole("row")
				.find((row) => /Nov 2026/.test(row.textContent ?? ""))!;
			expect(within(november).getAllByRole("cell")[0]).toHaveTextContent(
				"None",
			);
			expect(within(november).getAllByRole("cell")[1]).toHaveTextContent(
				"₹5,500.00 from Nov 2026",
			);
			expect(november).toHaveAttribute("data-differs", "true");
		});

		test("offers Delete anyway and Keep it, and no Keep mine line", async () => {
			route(network, "delete", "/api/budgets/:id", () => conflict());
			const { user } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			expect(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			).toBeVisible();
			expect(
				within(view()).getByRole("button", { name: "Keep it" }),
			).toBeVisible();
			expect(within(view()).queryByText(/^Keep mine/)).not.toBeInTheDocument();
		});

		test("Delete anyway deletes at the saved version, under a new key, and the notice undoes that Budget", async () => {
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id",
				(_, index) =>
					index === 0 ? conflict() : (
						new HttpResponse(null, { status: 204 })
					),
			);
			const { user, onClose, onDeleted } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
			expect(deletes).toHaveLength(2);
			expect(deletes[1]?.headers.get("if-match")).toBe('"5"');
			expect(deletes[1]?.headers.get("idempotency-key")).not.toBe(
				deletes[0]?.headers.get("idempotency-key"),
			);
			expect(isUuidV7(deletes[1]?.headers.get("idempotency-key"))).toBe(true);
			expect(onDeleted).toHaveBeenCalledWith(
				expect.objectContaining({
					id: goldenBudget("food").id,
					version: 5,
					schedule: saved().schedule,
				}),
			);
			noView();
		});

		test("another 409 shows the newer version", async () => {
			const deletes = route(
				network,
				"delete",
				"/api/budgets/:id",
				(_, index) =>
					index === 0 ? conflict() : (
						refuse(409, "version_conflict", {
							details: {
								current: budgetAnswer("food", {
									version: 6,
									schedule: [
										...saved().schedule,
										{ from: "2027-01", limitMinor: 450000 },
									],
								}),
							},
						})
					),
			);
			const { user, onClose } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			expect(
				await within(view()).findByText("₹4,500.00 from Jan 2027"),
			).toBeVisible();
			expect(onClose).not.toHaveBeenCalled();
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			await waitFor(() => expect(deletes).toHaveLength(3));
			expect(deletes[2]?.headers.get("if-match")).toBe('"6"');
		});

		test("Keep it sends nothing, reads the saved Budget again and closes both", async () => {
			const deletes = route(network, "delete", "/api/budgets/:id", () =>
				conflict(),
			);
			const { user, onClose, onDeleted, queryClient } = renderDelete();
			const invalidate = vi.spyOn(queryClient, "invalidateQueries");
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.click(
				within(view()).getByRole("button", { name: "Keep it" }),
			);
			expect(onClose).toHaveBeenCalledOnce();
			expect(onDeleted).not.toHaveBeenCalled();
			expect(deletes).toHaveLength(1);
			expect(invalidate).toHaveBeenCalledWith({ queryKey: ["budgets"] });
		});

		test("closing it without a choice goes back to the confirmation", async () => {
			const deletes = route(network, "delete", "/api/budgets/:id", () =>
				conflict(),
			);
			const { user, onClose } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.keyboard("{Escape}");
			noView();
			expect(
				screen.getByRole("alertdialog", { name: "Delete the Food Budget?" }),
			).toBeVisible();
			expect(onClose).not.toHaveBeenCalled();
			expect(deletes).toHaveLength(1);
		});

		test("another refusal closes the view and shows its line in the confirmation", async () => {
			route(network, "delete", "/api/budgets/:id", (_, index) =>
				index === 0 ? conflict() : HttpResponse.error(),
			);
			const { user, onClose } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			expect(
				await screen.findByText(/^The Budget could not be deleted/),
			).toBeVisible();
			noView();
			expect(onClose).not.toHaveBeenCalled();
		});

		test("a 404 on Delete anyway counts as done", async () => {
			route(network, "delete", "/api/budgets/:id", (_, index) =>
				index === 0 ? conflict() : refuse(404, "not_found"),
			);
			const { user, onClose, onDeleted } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
			expect(onDeleted).toHaveBeenCalledOnce();
		});

		test("while Delete anyway is sent, both choices wait", async () => {
			route(network, "delete", "/api/budgets/:id", async (_, index) => {
				if (index === 0) return conflict();
				await delay(100);
				return new HttpResponse(null, { status: 204 });
			});
			const { user, onClose } = renderDelete();
			await user.click(confirm());
			await screen.findByRole("dialog", {
				name: "This Budget changed on another device",
			});
			await user.click(
				within(view()).getByRole("button", { name: "Delete anyway" }),
			);
			expect(
				within(view()).getByRole("button", { name: "Keep it" }),
			).toHaveAttribute("aria-disabled", "true");
			await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		});
	});

	test("a 401 is the app's to answer: it stays open, saying nothing more", async () => {
		route(network, "delete", "/api/budgets/:id", () =>
			refuse(401, "unauthenticated"),
		);
		const { user, onClose } = renderDelete();
		await user.click(confirm());
		await waitFor(() => expect(confirm()).not.toHaveAttribute("aria-busy"));
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("while it deletes, Cancel waits", async () => {
		route(network, "delete", "/api/budgets/:id", async () => {
			await delay(100);
			return new HttpResponse(null, { status: 204 });
		});
		const { user, onClose } = renderDelete();
		await user.click(confirm());
		expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	test("Cancel closes it with nothing sent", async () => {
		const deletes = route(
			network,
			"delete",
			"/api/budgets/:id",
			() => new HttpResponse(null, { status: 204 }),
		);
		const { user, onClose } = renderDelete();
		await user.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onClose).toHaveBeenCalledOnce();
		expect(deletes).toHaveLength(0);
	});

	test("takes the caller's classes on its panel", () => {
		renderDelete(goldenBudget("food"), "mt-2");
		expect(screen.getByRole("alertdialog").closest(".mt-2")).not.toBeNull();
	});
});
