import { onlineManager } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { type ReactNode, useState } from "react";
import { I18nProvider } from "react-aria-components";
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
import { type AddSlot, AddSlotContext } from "@/hooks/useAddSlot";
import { ok, route } from "../../hooks/__tests__/helpers";
import {
	type CreatedAnswer,
	type GoneAnswer,
	useCreatedAnswer,
	useEntryDialog,
	useEntryDialogOpen,
	useGoneAnswer,
} from "../../hooks/useEntryDialog";
import { GOLDEN_CATEGORIES, GOLDEN_PAYEES, row } from "../../lib/__tests__/fixtures";
import { EntryDialogHost } from "../EntryDialogHost";
import { TransactionDeletesHost } from "../TransactionDeletesHost";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
// The golden clock (TST-3); only `Date` is frozen, so user-event's timers stay real.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
});
afterEach(() => {
	// Sonner keeps its toasts in a module, so one test's toast would reach the next.
	act(() => {
		toast.dismiss();
	});
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

/** The reads the dialog makes, and the create, answering the row it was sent. */
function serve(profile = GOLDEN_BLOCK) {
	route(network, "get", "/api/me", () => ok(meFor("u1", profile)));
	route(network, "get", "/api/payees", () =>
		ok({ items: GOLDEN_PAYEES, categories: GOLDEN_CATEGORIES }),
	);
	return route(network, "post", "/api/transactions", ({ body }) =>
		ok(row(body as Partial<ReturnType<typeof row>>), 201),
	);
}

/** A page button that opens the dialog, telling `onClose` when it closes. */
function Opener({ onClose }: { onClose?: () => void }) {
	const { openNew } = useEntryDialog();
	return (
		<button
			type="button"
			onClick={() => openNew(onClose ? { onClose } : undefined)}
		>
			Open
		</button>
	);
}

/** A page that answers creates while it is shown. */
function Answerer({ answer }: { answer: CreatedAnswer }) {
	useCreatedAnswer(answer);
	return <p>Answering page</p>;
}

function renderHost(children: ReactNode = <Opener />, slot?: AddSlot) {
	const sent = serve();
	const host = (
		<I18nProvider locale="en-IN">
			<TransactionDeletesHost profile={GOLDEN_BLOCK}>
				<EntryDialogHost profile={GOLDEN_BLOCK}>
					<input aria-label="Page search" />
					{children}
				</EntryDialogHost>
			</TransactionDeletesHost>
			<Toaster />
		</I18nProvider>
	);
	const view = renderInApp(
		slot ? <AddSlotContext value={slot}>{host}</AddSlotContext> : host,
	);
	return { ...view, sent, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

const dialogs = () =>
	screen.queryAllByRole("dialog", { name: "New Transaction", hidden: true });
const opened = () => screen.findByRole("dialog", { name: "New Transaction" });
const closed = () => waitFor(() => expect(dialogs()).toHaveLength(0));
const amount = () => screen.getByRole("textbox", { name: "Amount", hidden: true });

/** Fills a valid expense and saves it. */
async function save(user: User, how = "Save") {
	await user.click(amount());
	await user.keyboard("640");
	await user.click(screen.getByRole("combobox", { name: "Payee", hidden: true }));
	await user.keyboard("Kirana{Escape}");
	await user.click(
		screen.getByRole("radio", { name: "Food", hidden: true }).closest("label")!,
	);
	await user.click(screen.getByRole("button", { name: how, hidden: true }));
}

describe("opening (BR-F03-48, D-548)", () => {
	test("renders the page, with no dialog until asked", () => {
		renderHost();

		expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
		expect(dialogs()).toHaveLength(0);
	});

	test("useEntryDialog opens a new Transaction", async () => {
		const { user } = renderHost();

		await user.click(screen.getByRole("button", { name: "Open" }));

		expect(await opened()).toBeInTheDocument();
		await waitFor(() => expect(amount()).toHaveFocus());
	});

	// BR-F03-52
	test("N on the page opens it", async () => {
		const { user } = renderHost();

		await user.keyboard("n");

		expect(await opened()).toBeInTheDocument();
	});

	test("N in a text field types the letter and opens nothing", async () => {
		const { user } = renderHost();

		await user.click(screen.getByRole("textbox", { name: "Page search" }));
		await user.keyboard("n");

		expect(screen.getByRole("textbox", { name: "Page search" })).toHaveValue(
			"n",
		);
		expect(dialogs()).toHaveLength(0);
	});

	test("N with Ctrl or Cmd does nothing", async () => {
		const { user } = renderHost();

		await user.keyboard("{Control>}n{/Control}{Meta>}n{/Meta}");

		expect(dialogs()).toHaveLength(0);
	});

	test("while it is open, N and another open make no second dialog", async () => {
		const { user } = renderHost();

		await user.keyboard("n");
		await opened();
		screen.getByRole("button", { name: "Add a note", hidden: true }).focus();
		await user.keyboard("n");

		expect(dialogs()).toHaveLength(1);
		expect(
			screen.queryByRole("textbox", { name: "Note", hidden: true }),
		).toBeNull();
	});

	test("two opens in one event make one dialog, and only the first's close is told", async () => {
		const first = vi.fn();
		const second = vi.fn();
		function Twice() {
			const { openNew } = useEntryDialog();
			return (
				<button
					type="button"
					onClick={() => {
						openNew({ onClose: first });
						openNew({ onClose: second });
					}}
				>
					Twice
				</button>
			);
		}
		const { user } = renderHost(<Twice />);

		await user.click(screen.getByRole("button", { name: "Twice" }));
		await opened();
		await user.keyboard("{Escape}");
		await closed();

		expect(first).toHaveBeenCalledOnce();
		expect(second).not.toHaveBeenCalled();
	});

	test("fills the shell's Add slot, so Add opens it", async () => {
		let add: (() => void) | undefined;
		const slot: AddSlot = {
			register: (open) => {
				add = open;
				return () => {
					add = undefined;
				};
			},
		};
		renderHost(<Opener />, slot);

		await waitFor(() => expect(add).toBeDefined());
		add!();

		expect(await opened()).toBeInTheDocument();
	});

	test("outside the host, useEntryDialog says what is missing", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() => render(<Opener />)).toThrow(
			"useEntryDialog needs the EntryDialogHost above it.",
		);
	});
});

describe("closing", () => {
	test("tells the opener once it closes untouched", async () => {
		const onClose = vi.fn();
		const { user } = renderHost(<Opener onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Open" }));
		await opened();
		await user.keyboard("{Escape}");
		await closed();

		expect(onClose).toHaveBeenCalledOnce();
	});

	test("tells the opener once it closes after a save", async () => {
		const onClose = vi.fn();
		const { user } = renderHost(<Opener onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Open" }));
		await opened();
		await save(user);
		await closed();

		expect(onClose).toHaveBeenCalledOnce();
	});

	test("an opening without onClose closes quietly, and the next one's onClose is its own", async () => {
		const onClose = vi.fn();
		function Both() {
			const { openNew } = useEntryDialog();
			return (
				<>
					<button
						type="button"
						onClick={() => openNew()}
					>
						Plain
					</button>
					<button
						type="button"
						onClick={() => openNew({ onClose })}
					>
						Told
					</button>
				</>
			);
		}
		const { user } = renderHost(<Both />);

		await user.click(screen.getByRole("button", { name: "Told" }));
		await opened();
		await user.keyboard("{Escape}");
		await closed();
		await user.click(screen.getByRole("button", { name: "Plain" }));
		await opened();
		await user.keyboard("{Escape}");
		await closed();

		expect(onClose).toHaveBeenCalledOnce();
	});

	test("each opening starts fresh", async () => {
		const { user } = renderHost();

		await user.keyboard("n");
		await opened();
		await user.click(amount());
		await user.keyboard("640");
		await user.keyboard("{Escape}");
		await user.click(await screen.findByRole("button", { name: "Discard" }));
		await closed();
		await user.click(screen.getByRole("button", { name: "Open" }));
		await opened();

		expect(amount()).toHaveValue("");
	});

	test("it opens again after closing", async () => {
		const { user } = renderHost();

		for (let time = 0; time < 2; time++) {
			await user.click(screen.getByRole("button", { name: "Open" }));
			await opened();
			await user.keyboard("{Escape}");
			await closed();
		}
		await user.keyboard("n");

		expect(await opened()).toBeInTheDocument();
	});
});

describe("answering a create (BR-F03-21, D-548)", () => {
	test("with no page answering, says Transaction saved.", async () => {
		const { user, sent } = renderHost();

		await user.keyboard("n");
		await opened();
		await save(user);

		expect(await screen.findByText("Transaction saved.")).toBeInTheDocument();
		expect(sent).toHaveLength(1);
	});

	test("Save and add another says it too, and the dialog stays", async () => {
		const { user } = renderHost();

		await user.keyboard("n");
		await opened();
		await save(user, "Save and add another");

		expect(await screen.findByText("Transaction saved.")).toBeInTheDocument();
		expect(dialogs()).toHaveLength(1);
	});

	test("a page that answers takes the row and how it was saved, in place of the toast", async () => {
		const answer = vi.fn();
		const { user } = renderHost(
			<>
				<Opener />
				<Answerer answer={answer} />
			</>,
		);

		await user.keyboard("n");
		await opened();
		await save(user, "Save and add another");
		await waitFor(() => expect(answer).toHaveBeenCalledOnce());
		await user.click(amount());
		await save(user);

		await waitFor(() => expect(answer).toHaveBeenCalledTimes(2));
		expect(answer.mock.calls.map(([, kind]) => kind)).toEqual(["again", "save"]);
		expect(answer.mock.calls[0]![0]).toMatchObject({ payee: "Kirana" });
		expect(screen.queryByText("Transaction saved.")).toBeNull();
	});

	test("once the answering page is gone, the toast comes back", async () => {
		const answer = vi.fn();
		function Toggle() {
			const [shown, setShown] = useState(true);
			return (
				<>
					<Opener />
					<button
						type="button"
						onClick={() => setShown(false)}
					>
						Leave
					</button>
					{shown && <Answerer answer={answer} />}
				</>
			);
		}
		const { user } = renderHost(<Toggle />);

		await user.click(screen.getByRole("button", { name: "Leave" }));
		await user.keyboard("n");
		await opened();
		await save(user);

		expect(await screen.findByText("Transaction saved.")).toBeInTheDocument();
		expect(answer).not.toHaveBeenCalled();
	});

	test("a page that stops answering leaves a newer one in place", async () => {
		const older = vi.fn();
		const newer = vi.fn();
		function Pages() {
			const [olderShown, setOlderShown] = useState(true);
			return (
				<>
					{olderShown && <Answerer answer={older} />}
					<Answerer answer={newer} />
					<button
						type="button"
						onClick={() => setOlderShown(false)}
					>
						Drop older
					</button>
				</>
			);
		}
		const { user } = renderHost(<Pages />);

		await user.click(screen.getByRole("button", { name: "Drop older" }));
		await user.keyboard("n");
		await opened();
		await save(user);

		await waitFor(() => expect(newer).toHaveBeenCalledOnce());
		expect(older).not.toHaveBeenCalled();
	});
});

describe("the profile (BR-F02-18)", () => {
	test("uses /api/me's profile once it answers", async () => {
		network.resetHandlers();
		const user = userEvent.setup();
		serve({ ...GOLDEN_BLOCK, currency: "USD", numberLocale: "en-US-u-nu-latn" });
		renderInApp(
			<I18nProvider locale="en-IN">
				<TransactionDeletesHost profile={GOLDEN_BLOCK}>
					<EntryDialogHost profile={GOLDEN_BLOCK}>
						<Opener />
					</EntryDialogHost>
				</TransactionDeletesHost>
			</I18nProvider>,
		);
		// Let /api/me answer before the dialog opens.
		await new Promise((resolve) => setTimeout(resolve, 50));

		await user.click(screen.getByRole("button", { name: "Open" }));
		const dialog = await opened();

		await waitFor(() =>
			expect(within(dialog).getByText("$")).toBeInTheDocument(),
		);
	});

	test("before /api/me answers, the server's profile serves", async () => {
		const { user } = renderHost();

		await user.click(screen.getByRole("button", { name: "Open" }));
		const dialog = await opened();

		expect(within(dialog).getByText("₹")).toBeInTheDocument();
	});
});

// Golden #24 as the API answers it.
const ROW_24 = row();

/** Page buttons that open #24 as an edit and as a duplicate, and say whether a dialog is open. */
function RowOpener({ onClose }: { onClose?: () => void }) {
	const { openEdit, openDuplicate } = useEntryDialog();
	const isOpen = useEntryDialogOpen();
	const options = onClose ? { onClose } : undefined;
	return (
		<>
			<button
				type="button"
				onClick={() => openEdit(ROW_24, options)}
			>
				Edit row
			</button>
			<button
				type="button"
				onClick={() => openDuplicate(ROW_24, options)}
			>
				Duplicate row
			</button>
			<p>{isOpen ? "Dialog open" : "Dialog closed"}</p>
		</>
	);
}

/** A page that answers deleted rows while it is shown. */
function GoneAnswerer({ answer }: { answer: GoneAnswer }) {
	useGoneAnswer(answer);
	return null;
}

const titled = (name: string) => screen.findByRole("dialog", { name });
const raise = async (user: User) => {
	await user.click(amount());
	await user.clear(amount());
	await user.keyboard("700");
	await user.click(screen.getByRole("button", { name: "Save", hidden: true }));
};

describe("edit and duplicate (BR-F03-23, BR-F03-28)", () => {
	test("openEdit opens Edit Transaction for the row, and its save says Changes saved.", async () => {
		const edits = route(
			network,
			"patch",
			`/api/transactions/${ROW_24.id}`,
			({ body }) => ok({ ...ROW_24, ...(body as object), version: 2 }),
		);
		const onClose = vi.fn();
		const { user } = renderHost(<RowOpener onClose={onClose} />);

		await user.click(screen.getByRole("button", { name: "Edit row" }));
		await titled("Edit Transaction");
		await raise(user);

		expect(await screen.findByText("Changes saved.")).toBeInTheDocument();
		expect(edits).toHaveLength(1);
		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", { name: "Edit Transaction" }),
			).toBeNull(),
		);
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("openDuplicate opens Duplicate Transaction, and its save answers as a create", async () => {
		const answer = vi.fn();
		const { user, sent } = renderHost(
			<>
				<RowOpener />
				<Answerer answer={answer} />
			</>,
		);

		await user.click(screen.getByRole("button", { name: "Duplicate row" }));
		await titled("Duplicate Transaction");
		await user.click(screen.getByRole("button", { name: "Save", hidden: true }));

		await waitFor(() => expect(answer).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(1);
		expect(answer).toHaveBeenCalledWith(
			expect.objectContaining({ payee: "Swiggy", amountMinor: 64000 }),
			"save",
		);
	});

	test("says whether a dialog is open, for the page's shortcuts", async () => {
		const { user } = renderHost(<RowOpener />);
		expect(screen.getByText("Dialog closed")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Edit row" }));
		await titled("Edit Transaction");

		expect(
			screen.getByText("Dialog open", { ignore: false }),
		).toBeInTheDocument();
	});

	test("while one dialog is open, another open does nothing", async () => {
		const { user } = renderHost(<RowOpener />);
		// The open dialog hides the page, so the second button is found before.
		const duplicate = screen.getByRole("button", { name: "Duplicate row" });

		await user.click(screen.getByRole("button", { name: "Edit row" }));
		await titled("Edit Transaction");
		act(() => {
			duplicate.click();
		});

		expect(
			screen.queryByRole("dialog", { name: "Duplicate Transaction" }),
		).toBeNull();
		expect(
			screen.getByRole("dialog", { name: "Edit Transaction" }),
		).toBeInTheDocument();
	});

	// BR-F03-25
	test("an edit whose row was deleted says so and tells the page that answers", async () => {
		route(network, "patch", `/api/transactions/${ROW_24.id}`, () =>
			HttpResponse.json(
				{ error: { code: "not_found", message: "m", requestId: "r" } },
				{ status: 404 },
			),
		);
		const gone = vi.fn();
		const { user } = renderHost(
			<>
				<RowOpener />
				<GoneAnswerer answer={gone} />
			</>,
		);

		await user.click(screen.getByRole("button", { name: "Edit row" }));
		await titled("Edit Transaction");
		await raise(user);

		expect(
			await screen.findByText(
				"This Transaction was deleted on another device.",
			),
		).toBeInTheDocument();
		expect(gone).toHaveBeenCalledWith(ROW_24.id);
		expect(screen.queryByText("Changes saved.")).toBeNull();
	});

	test("with no page answering, a deleted row's message still shows", async () => {
		route(network, "patch", `/api/transactions/${ROW_24.id}`, () =>
			HttpResponse.json(
				{ error: { code: "not_found", message: "m", requestId: "r" } },
				{ status: 404 },
			),
		);
		const { user } = renderHost(<RowOpener />);

		await user.click(screen.getByRole("button", { name: "Edit row" }));
		await titled("Edit Transaction");
		await raise(user);

		expect(
			await screen.findByText(
				"This Transaction was deleted on another device.",
			),
		).toBeInTheDocument();
	});

	test("a page that stops answering deleted rows hands back to the message alone", async () => {
		route(network, "patch", `/api/transactions/${ROW_24.id}`, () =>
			HttpResponse.json(
				{ error: { code: "not_found", message: "m", requestId: "r" } },
				{ status: 404 },
			),
		);
		const gone = vi.fn();
		function Page() {
			const [answering, setAnswering] = useState(true);
			return (
				<>
					<RowOpener />
					{answering && <GoneAnswerer answer={gone} />}
					<button
						type="button"
						onClick={() => setAnswering(false)}
					>
						Leave
					</button>
				</>
			);
		}
		const { user } = renderHost(<Page />);

		await user.click(screen.getByRole("button", { name: "Leave" }));
		await user.click(screen.getByRole("button", { name: "Edit row" }));
		await titled("Edit Transaction");
		await raise(user);

		expect(
			await screen.findByText(
				"This Transaction was deleted on another device.",
			),
		).toBeInTheDocument();
		expect(gone).not.toHaveBeenCalled();
	});
});
