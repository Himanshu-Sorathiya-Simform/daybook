import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { ok, route } from "../../hooks/__tests__/helpers";
import type { LabelLocale } from "../../lib/labels";
import type { PanelSelection } from "../../lib/panel";
import { CHECK_A_SUMMARY, row } from "../../lib/__tests__/fixtures";
import { TransactionPanel, type TransactionPanelProps } from "../TransactionPanel";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

// The golden profile (IN, INR) on the golden clock's day (TST-3).
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

const SHOWN: PanelSelection = { state: "shown", row: row() };

function renderPanel(props: Partial<TransactionPanelProps> = {}) {
	route(network, "get", "/api/payees/history", () =>
		ok({ count: 4, inMinor: 0, outMinor: 329000, usualDay: 3, currency: "INR" }),
	);
	const handlers = {
		onClose: vi.fn(),
		onEdit: vi.fn(),
		onDuplicate: vi.fn(),
		onDelete: vi.fn(),
	};
	const view = renderInApp(
		<TransactionPanel
			isDocked
			selection={null}
			summary={CHECK_A_SUMMARY}
			isSummaryPending={false}
			locale={IN}
			isOnline
			{...handlers}
			{...props}
		/>,
	);
	return { ...view, ...handlers, user: userEvent.setup() };
}

describe("TransactionPanel docked (BR-F03-70)", () => {
	// AC-F03-56
	test("with nothing selected it is a named column showing the summary", () => {
		renderPanel();

		const panel = screen.getByRole("complementary", {
			name: "Transaction details",
		});
		expect(panel).toHaveTextContent("11 Transactions");
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("the summary shows skeleton lines while it loads", () => {
		renderPanel({ summary: undefined, isSummaryPending: true });

		expect(
			screen.getByRole("status", { name: "Loading the summary" }),
		).toBeInTheDocument();
	});

	test("a selected row takes the summary's place", () => {
		renderPanel({ selection: SHOWN });

		expect(
			screen.getByRole("heading", { name: "Transaction" }),
		).toBeInTheDocument();
		expect(screen.queryByText("11 Transactions")).toBeNull();
	});

	test("a row loading alone shows skeleton lines in place of the summary", () => {
		renderPanel({ selection: { state: "loading" } });

		expect(
			screen.getByRole("status", { name: "Loading the Transaction" }),
		).toBeInTheDocument();
		expect(screen.queryByText("11 Transactions")).toBeNull();
	});

	test("a row that failed to load says so, and Retry asks again", async () => {
		const onRetry = vi.fn();
		const { user } = renderPanel({ selection: { state: "failed", onRetry } });

		expect(
			screen.getByText("This Transaction could not be loaded."),
		).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Retry" }));

		expect(onRetry).toHaveBeenCalledOnce();
	});

	test("Close, Edit and Duplicate hand the row to the page", async () => {
		const { user, onClose, onEdit, onDuplicate } = renderPanel({
			selection: SHOWN,
		});

		await user.click(screen.getByRole("button", { name: "Edit" }));
		await user.click(screen.getByRole("button", { name: "Duplicate" }));
		await user.click(screen.getByRole("button", { name: "Close details" }));

		expect(onEdit).toHaveBeenCalledWith(SHOWN.state === "shown" && SHOWN.row);
		expect(onDuplicate).toHaveBeenCalledWith(
			SHOWN.state === "shown" && SHOWN.row,
		);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("is hidden below 1180 px by the dock breakpoint until the page knows the width", () => {
		renderPanel();

		expect(screen.getByRole("complementary")).toHaveClass("max-dock:hidden");
	});
});

describe("TransactionPanel as a drawer (BR-F03-70)", () => {
	// AC-F03-56
	test("with nothing selected nothing shows", () => {
		renderPanel({ isDocked: false });

		expect(screen.queryByRole("complementary")).toBeNull();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByText("11 Transactions")).toBeNull();
	});

	// AC-F03-56
	test("a selected row opens the drawer named Transaction details", async () => {
		renderPanel({ isDocked: false, selection: SHOWN });

		const drawer = await screen.findByRole("dialog", {
			name: "Transaction details",
		});
		expect(drawer).toHaveTextContent("Swiggy");
		expect(drawer).toHaveTextContent("Mon, 19 Oct, 2026 · 10:15 pm");
	});

	// AC-F03-56
	test("Close details, Escape and the scrim each clear the selection", async () => {
		const { user, onClose } = renderPanel({ isDocked: false, selection: SHOWN });
		await screen.findByRole("dialog");

		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(onClose).toHaveBeenCalledTimes(1);

		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledTimes(2);

		const scrim = screen.getByRole("dialog").closest(".bg-scrim")!;
		await user.pointer({ keys: "[MouseLeft]", target: scrim });
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
	});

	test("a row loading alone shows skeleton lines in the drawer", async () => {
		renderPanel({ isDocked: false, selection: { state: "loading" } });

		expect(
			await screen.findByRole("status", { name: "Loading the Transaction" }),
		).toBeInTheDocument();
	});
});
