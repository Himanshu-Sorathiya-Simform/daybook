import { screen, waitFor } from "@testing-library/react";
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

	test("a 409 says the delete failed until the conflict view comes", async () => {
		route(network, "delete", "/api/budgets/:id", () =>
			refuse(409, "version_conflict", {
				details: { current: budgetAnswer("food", { version: 5 }) },
			}),
		);
		const { user, onClose } = renderDelete();
		await user.click(confirm());
		expect(
			await screen.findByText(/^The Budget could not be deleted/),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
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
