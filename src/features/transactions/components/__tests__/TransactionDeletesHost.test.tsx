import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
import { toast } from "sonner";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
	vi,
} from "vitest";

import {
	GOLDEN_BLOCK,
	meFor,
	renderInApp,
} from "@/components/app/__tests__/helpers";
import { Toaster } from "@/components/feedback/Toaster";
import { isUuidV7 } from "@/lib/ids";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import {
	type RestoredAnswer,
	useDeletedRows,
	useRestoredAnswer,
	useTransactionDeletes,
} from "../../hooks/useTransactionDeletes";
import { idOf, row } from "../../lib/__tests__/fixtures";
import type { TransactionAnswer } from "../../lib/types";
import { TransactionDeletesHost, UNDO_MS } from "../TransactionDeletesHost";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
// The golden clock (TST-3). Timers are fake but keep moving, so user-event and React Aria run,
// and the Undo window is crossed with `advanceTimersByTime`.
beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
	vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
	route(network, "get", "/api/me", () => ok(meFor("u1")));
});
afterEach(() => {
	// Unmount while the timers are still fake, so a waiting delete's timer is cleared by the
	// clock that set it and never reaches the next test.
	cleanup();
	act(() => {
		toast.dismiss();
	});
	network.resetHandlers();
	vi.useRealTimers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

// Golden #24 and #25 as the API answers them.
const SWIGGY = row();
const ZOMATO = row({
	id: idOf(25),
	payee: "Zomato",
	amountMinor: 38000,
	version: 3,
});

/** `DELETE /api/transactions/[id]`, answering `respond`, or 204. */
function deletes(
	id: string,
	respond: Parameters<typeof route>[3] = () =>
		new HttpResponse(null, { status: 204 }),
) {
	return route(network, "delete", `/api/transactions/${id}`, respond);
}

/** A page with a Delete button per row, the rows it leaves out, and an answer for returns. */
function Page({
	rows,
	onRestore,
}: {
	rows: TransactionAnswer[];
	onRestore?: RestoredAnswer;
}) {
	const { remove } = useTransactionDeletes();
	const deleted = useDeletedRows();
	return (
		<>
			{onRestore && <Answer answer={onRestore} />}
			{rows.map((each) => (
				<button
					key={each.id}
					type="button"
					onClick={() => remove(each)}
				>
					Delete {each.payee}
				</button>
			))}
			<p data-testid="deleted">{[...deleted].join(",")}</p>
		</>
	);
}

function Answer({ answer }: { answer: RestoredAnswer }) {
	useRestoredAnswer(answer);
	return null;
}

function renderHost(rows = [SWIGGY], onRestore?: RestoredAnswer) {
	function Harness() {
		const [mounted, setMounted] = useState(true);
		return (
			<>
				<button
					type="button"
					onClick={() => setMounted(false)}
				>
					Close tab
				</button>
				{mounted && (
					<TransactionDeletesHost profile={GOLDEN_BLOCK}>
						<Page
							rows={rows}
							{...(onRestore ? { onRestore } : {})}
						/>
					</TransactionDeletesHost>
				)}
				<Toaster />
			</>
		);
	}
	const view = renderInApp(<Harness />);
	return {
		...view,
		user: userEvent.setup({ advanceTimers: vi.advanceTimersByTime.bind(vi) }),
	};
}

const deletedIds = () => screen.getByTestId("deleted").textContent;

type User = ReturnType<typeof userEvent.setup>;
const confirmView = () =>
	screen.findByRole("alertdialog", { name: "Delete this Transaction?" });

/** Presses a row's Delete, then Delete in the confirm (D-84). */
async function confirmDelete(user: User, payee: string) {
	await user.click(screen.getByRole("button", { name: `Delete ${payee}` }));
	await user.click(
		within(await confirmView()).getByRole("button", { name: "Delete" }),
	);
	await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
}
const endWindow = () =>
	act(() => {
		vi.advanceTimersByTime(UNDO_MS);
	});
const conflict = () =>
	screen.findByRole("dialog", {
		name: "This Transaction changed on another device",
	});

describe("delete with Undo (BR-F03-26)", () => {
	// D-84
	test("Undo is offered for 5 seconds", () => {
		expect(UNDO_MS).toBe(5000);
	});

	// D-84
	test("asks first, showing the row as the list does, with focus on Cancel", async () => {
		const { user } = renderHost();

		await user.click(screen.getByRole("button", { name: "Delete Swiggy" }));
		const view = await confirmView();

		expect(view).toHaveTextContent("Swiggy");
		expect(view).toHaveTextContent("Food · Mon, 19 Oct · 10:15 pm");
		expect(view).toHaveTextContent("−₹640.00");
		expect(view).toHaveTextContent(
			"It leaves your list now. You can undo for 5 seconds.",
		);
		await waitFor(() =>
			expect(
				within(view).getByRole("button", { name: "Cancel" }),
			).toHaveFocus(),
		);
		expect(deletedIds()).toBe("");
	});

	test("Cancel keeps the row and sends nothing", async () => {
		const sent = deletes(SWIGGY.id);
		const { user } = renderHost();

		await user.click(screen.getByRole("button", { name: "Delete Swiggy" }));
		await user.click(
			within(await confirmView()).getByRole("button", { name: "Cancel" }),
		);
		endWindow();

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(deletedIds()).toBe("");
		expect(sent).toEqual([]);
		expect(screen.queryByText("Transaction deleted.")).toBeNull();
	});

	test("Escape is Cancel too", async () => {
		const { user } = renderHost();

		await user.click(screen.getByRole("button", { name: "Delete Swiggy" }));
		await confirmView();
		await user.keyboard("{Escape}");

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(deletedIds()).toBe("");
	});

	test("the caller hears the confirm, and only the confirm", async () => {
		deletes(SWIGGY.id);
		const onConfirmed = vi.fn();
		function Caller() {
			const { remove } = useTransactionDeletes();
			return (
				<button
					type="button"
					onClick={() => remove(SWIGGY, { onConfirmed })}
				>
					Delete with caller
				</button>
			);
		}
		renderInApp(
			<>
				<TransactionDeletesHost profile={GOLDEN_BLOCK}>
					<Caller />
				</TransactionDeletesHost>
				<Toaster />
			</>,
		);
		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime.bind(vi),
		});

		await user.click(screen.getByRole("button", { name: "Delete with caller" }));
		await user.click(
			within(await confirmView()).getByRole("button", { name: "Cancel" }),
		);
		expect(onConfirmed).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Delete with caller" }));
		await user.click(
			within(await confirmView()).getByRole("button", { name: "Delete" }),
		);
		expect(onConfirmed).toHaveBeenCalledOnce();
	});

	test("while the confirm asks about one row, a delete of another is ignored", async () => {
		const { user } = renderHost([SWIGGY, ZOMATO]);
		// The confirm hides the page, so the second button is found before it opens.
		const zomato = screen.getByRole("button", { name: "Delete Zomato" });

		await user.click(screen.getByRole("button", { name: "Delete Swiggy" }));
		await confirmView();
		act(() => {
			zomato.click();
		});

		expect(await confirmView()).toHaveTextContent("Swiggy");
		expect(screen.getAllByRole("alertdialog")).toHaveLength(1);
	});

	test("the row leaves at once, and Transaction deleted. offers Undo for 5 seconds", async () => {
		const sent = deletes(SWIGGY.id);
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");

		expect(deletedIds()).toBe(SWIGGY.id);
		expect(await screen.findByText("Transaction deleted.")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
		act(() => {
			// Short of the end by more than the real time a test takes, which the clock also counts.
			vi.advanceTimersByTime(UNDO_MS - 500);
		});
		expect(sent).toEqual([]);
	});

	// BR-F03-26, AC-F03-73
	test("Undo brings the row back, tells the page, and nothing is ever sent", async () => {
		const sent = deletes(SWIGGY.id);
		const restored = vi.fn();
		const { user } = renderHost([SWIGGY], restored);

		await confirmDelete(user, "Swiggy");
		await user.click(await screen.findByRole("button", { name: "Undo" }));
		endWindow();
		endWindow();

		expect(deletedIds()).toBe("");
		expect(restored).toHaveBeenCalledWith(SWIGGY);
		expect(sent).toEqual([]);
		await waitFor(() =>
			expect(screen.queryByText("Transaction deleted.")).toBeNull(),
		);
	});

	test("after 5 seconds it sends the delete at the row's version and closes the toast", async () => {
		const sent = deletes(ZOMATO.id);
		const { user } = renderHost([ZOMATO]);

		await confirmDelete(user, "Zomato");
		endWindow();

		await waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]!.method).toBe("DELETE");
		expect(sent[0]!.body).toEqual({});
		expect(sent[0]!.headers.get("If-Match")).toBe('"3"');
		expect(isUuidV7(sent[0]!.headers.get("Idempotency-Key") ?? "")).toBe(true);
		await waitFor(() =>
			expect(screen.queryByText("Transaction deleted.")).toBeNull(),
		);
		expect(deletedIds()).toBe(ZOMATO.id);
	});

	// BR-F03-17
	test("a linked charge sends its Subscription and due date; an unlinked one sends nothing", async () => {
		const linked = row({
			id: idOf(16),
			payee: "Netflix",
			source: "subscription",
			subscriptionId: idOf(900),
			dueOn: "2026-10-05",
		});
		const unlinked = row({
			id: idOf(5),
			payee: "Hotstar",
			source: "subscription",
			subscriptionId: null,
			dueOn: "2026-09-05",
		});
		const first = deletes(linked.id);
		const second = deletes(unlinked.id);
		const { user } = renderHost([linked, unlinked]);

		await confirmDelete(user, "Netflix");
		await confirmDelete(user, "Hotstar");
		endWindow();

		await waitFor(() => expect(second).toHaveLength(1));
		expect(first[0]!.body).toEqual({
			subscriptionId: idOf(900),
			dueOn: "2026-10-05",
		});
		expect(second[0]!.body).toEqual({});
	});

	test("two deletes run apart: undoing one leaves the other", async () => {
		const swiggy = deletes(SWIGGY.id);
		const zomato = deletes(ZOMATO.id);
		const { user } = renderHost([SWIGGY, ZOMATO]);

		await confirmDelete(user, "Swiggy");
		await confirmDelete(user, "Zomato");
		await waitFor(() =>
			expect(screen.getAllByRole("button", { name: "Undo" })).toHaveLength(2),
		);
		await user.click(screen.getAllByRole("button", { name: "Undo" })[0]!);
		endWindow();

		await waitFor(() => expect(zomato.length + swiggy.length).toBe(1));
		expect(deletedIds()?.split(",")).toHaveLength(1);
	});

	test("a second delete of a row still waiting does nothing, not even ask", async () => {
		const sent = deletes(SWIGGY.id);
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		await user.click(screen.getByRole("button", { name: "Delete Swiggy" }));
		expect(screen.queryByRole("alertdialog")).toBeNull();
		endWindow();

		await waitFor(() => expect(sent).toHaveLength(1));
		expect(screen.getAllByText("Transaction deleted.")).toHaveLength(1);
	});

	test("closing the tab within the 5 seconds cancels the delete", async () => {
		const sent = deletes(SWIGGY.id);
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		await user.click(screen.getByRole("button", { name: "Close tab" }));
		endWindow();

		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(sent).toEqual([]);
	});
});

describe("after the window (BR-F03-26, D-239)", () => {
	test("a 404 counts as done, with no message, and the row stays out", async () => {
		deletes(SWIGGY.id, () => refuse(404, "not_found"));
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();

		await waitFor(() =>
			expect(screen.queryByText("Transaction deleted.")).toBeNull(),
		);
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(deletedIds()).toBe(SWIGGY.id);
		expect(screen.queryByRole("dialog")).toBeNull();
	});

	test("no answer brings the row back with Couldn't delete.", async () => {
		deletes(SWIGGY.id, () => HttpResponse.error());
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();

		expect(
			await screen.findByText(
				"Couldn't delete. Check your connection and try again.",
			),
		).toBeInTheDocument();
		expect(deletedIds()).toBe("");
	});

	test("a 5xx brings the row back with Couldn't delete. too", async () => {
		deletes(SWIGGY.id, () => refuse(500, "internal"));
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();

		expect(
			await screen.findByText(
				"Couldn't delete. Check your connection and try again.",
			),
		).toBeInTheDocument();
		expect(deletedIds()).toBe("");
	});

	test("offline it is still sent, fails at once and brings the row back", async () => {
		const sent = deletes(SWIGGY.id, () => HttpResponse.error());
		const { user } = renderHost();
		const { onlineManager } = await import("@tanstack/react-query");
		onlineManager.setOnline(false);

		await confirmDelete(user, "Swiggy");
		endWindow();

		expect(
			await screen.findByText(
				"Couldn't delete. Check your connection and try again.",
			),
		).toBeInTheDocument();
		expect(sent).toHaveLength(1);
		onlineManager.setOnline(true);
	});

	test("another refusal brings the row back with its reason", async () => {
		deletes(SWIGGY.id, () =>
			refuse(422, "goal_read_only", {
				message:
					"Vacation is completed, so its Transactions can't be changed.",
			}),
		);
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();

		expect(
			await screen.findByText(
				"Vacation is completed, so its Transactions can't be changed.",
			),
		).toBeInTheDocument();
		expect(deletedIds()).toBe("");
	});

	test("a signed-out answer brings the row back and leaves the message to the app", async () => {
		deletes(SWIGGY.id, () => refuse(401, "unauthenticated"));
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();

		await waitFor(() => expect(deletedIds()).toBe(""));
		expect(
			screen.queryByText(
				"Couldn't delete. Check your connection and try again.",
			),
		).toBeNull();
	});
});

describe("the conflict view for a delete (BR-F03-26, BR-P1-26, D-556)", () => {
	const CURRENT = { ...SWIGGY, amountMinor: 70000, version: 2 };
	const conflicted = (index: number) =>
		index === 0 ?
			refuse(409, "version_conflict", { details: { current: CURRENT } })
		:	new HttpResponse(null, { status: 204 });

	test("shows the row as deleted beside the saved one, with Delete anyway and Keep it", async () => {
		deletes(SWIGGY.id, (_, index) => conflicted(index));
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();
		const view = await conflict();

		expect(view).toHaveTextContent(
			"It changed after you deleted it. Delete it anyway, or keep it as it is saved now.",
		);
		expect(
			within(view)
				.getAllByRole("columnheader")
				.map((each) => each.textContent),
		).toEqual(["Field", "When you deleted it", "Saved now"]);
		expect(
			within(view)
				.getByRole("rowheader", { name: /^Amount/ })
				.closest("tr"),
		).toHaveTextContent("AmountDiffers₹640.00₹700.00");
		expect(
			within(view).getByRole("button", { name: "Delete anyway" }),
		).toBeInTheDocument();
		expect(
			within(view).getByRole("button", { name: "Keep it" }),
		).toBeInTheDocument();
		expect(deletedIds()).toBe(SWIGGY.id);
	});

	test("Delete anyway deletes at the saved version", async () => {
		const sent = deletes(SWIGGY.id, (_, index) => conflicted(index));
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();
		await user.click(
			within(await conflict()).getByRole("button", { name: "Delete anyway" }),
		);

		await waitFor(() => expect(sent).toHaveLength(2));
		expect(sent[1]!.headers.get("If-Match")).toBe('"2"');
		expect(sent[1]!.headers.get("Idempotency-Key")).not.toBe(
			sent[0]!.headers.get("Idempotency-Key"),
		);
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(deletedIds()).toBe(SWIGGY.id);
	});

	// AC-F03-30
	test("Keep it brings the row back as saved, and the page selects it", async () => {
		const sent = deletes(SWIGGY.id, (_, index) => conflicted(index));
		const restored = vi.fn();
		const { user, queryClient } = renderHost([SWIGGY], restored);

		await confirmDelete(user, "Swiggy");
		endWindow();
		await user.click(
			within(await conflict()).getByRole("button", { name: "Keep it" }),
		);

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(deletedIds()).toBe("");
		expect(restored).toHaveBeenCalledWith(CURRENT);
		expect(sent).toHaveLength(1);
		expect(
			queryClient.getQueryData(["transactions", "detail", SWIGGY.id]),
		).toEqual(CURRENT);
	});

	test("closing the view keeps the row, as Keep it does", async () => {
		const sent = deletes(SWIGGY.id, (_, index) => conflicted(index));
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();
		await conflict();
		await user.keyboard("{Escape}");

		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(deletedIds()).toBe("");
		expect(sent).toHaveLength(1);
	});

	test("Delete anyway meeting another 409 shows the newer version", async () => {
		const NEWER = { ...SWIGGY, amountMinor: 75000, version: 3 };
		deletes(SWIGGY.id, (_, index) =>
			refuse(409, "version_conflict", {
				details: { current: index === 0 ? CURRENT : NEWER },
			}),
		);
		const { user } = renderHost();

		await confirmDelete(user, "Swiggy");
		endWindow();
		await user.click(
			within(await conflict()).getByRole("button", { name: "Delete anyway" }),
		);

		await waitFor(() =>
			expect(screen.getByRole("dialog")).toHaveTextContent("₹750.00"),
		);
	});
});

describe("the page's answer", () => {
	test("a page that stops answering leaves returns unanswered", async () => {
		const restored = vi.fn();
		function Toggle() {
			const [on, setOn] = useState(true);
			return (
				<>
					{on && <Answer answer={restored} />}
					<button
						type="button"
						onClick={() => setOn(false)}
					>
						Leave
					</button>
				</>
			);
		}
		deletes(SWIGGY.id);
		const view = renderInApp(
			<>
				<TransactionDeletesHost profile={GOLDEN_BLOCK}>
					<Page rows={[SWIGGY]} />
					<Toggle />
				</TransactionDeletesHost>
				<Toaster />
			</>,
		);
		const user = userEvent.setup({
			advanceTimers: vi.advanceTimersByTime.bind(vi),
		});

		await user.click(screen.getByRole("button", { name: "Leave" }));
		await confirmDelete(user, "Swiggy");
		await user.click(await screen.findByRole("button", { name: "Undo" }));

		expect(restored).not.toHaveBeenCalled();
		view.unmount();
	});

	test("outside the host, the hook says what it needs", () => {
		function Lost() {
			useTransactionDeletes();
			return null;
		}
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => renderInApp(<Lost />)).toThrow(
			"useTransactionDeletes needs the TransactionDeletesHost above it.",
		);
	});
});
