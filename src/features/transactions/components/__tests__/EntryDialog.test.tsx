import { onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
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

import { renderInApp } from "@/components/app/__tests__/helpers";
import { isUuidV7 } from "@/lib/ids";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import type { EntryLocale } from "../../lib/entry";
import { GOLDEN_CATEGORIES, GOLDEN_PAYEES, row } from "../../lib/__tests__/fixtures";
import { EntryDialog, type EntryDialogProps } from "../EntryDialog";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
// The golden clock (TST-3): 2026-11-02 12:00 in Asia/Kolkata. React Aria reads the device
// clock for its own "Today" label, so only `Date` is frozen; timers stay real for user-event.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
});
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const IN: EntryLocale = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
};

/** `/api/payees` on golden data. */
const payees = () =>
	route(network, "get", "/api/payees", () =>
		ok({ items: GOLDEN_PAYEES, categories: GOLDEN_CATEGORIES }),
	);

/** `POST /api/transactions`, answering `respond`, or the row it was sent. */
function creates(
	respond: Parameters<typeof route>[3] = ({ body }) =>
		ok(row(body as Partial<ReturnType<typeof row>>), 201),
) {
	return route(network, "post", "/api/transactions", respond);
}

function renderDialog(props: Partial<EntryDialogProps> = {}) {
	payees();
	const onClose = vi.fn();
	const onCreated = vi.fn();
	const onEdited = props.onEdited ?? vi.fn();
	function Harness() {
		const [isOpen, setOpen] = useState(true);
		return (
			<EntryDialog
				locale={IN}
				firstDayOfWeek="monday"
				onCreated={onCreated}
				{...props}
				onEdited={onEdited}
				isOpen={props.isOpen ?? isOpen}
				onClose={() => {
					onClose();
					setOpen(false);
				}}
			/>
		);
	}
	const view = renderInApp(
		<I18nProvider locale="en-IN">
			<Harness />
		</I18nProvider>,
	);
	return { ...view, onClose, onCreated, onEdited, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

// The payee's open list, like any popover, hides the rest of the dialog from screen readers,
// so the field helpers look past it; tests of what is shown query without them.
const hidden = { hidden: true } as const;
const dialog = () =>
	screen.getByRole("dialog", { name: "New Transaction", ...hidden });
const amount = () => screen.getByRole("textbox", { name: "Amount", ...hidden });
const payee = () => screen.getByRole("combobox", { name: "Payee", ...hidden });
const radio = (name: string) => screen.getByRole("radio", { name, ...hidden });
const tile = (name: string) => radio(name).closest("label") as HTMLElement;
const group = (name: string) => screen.getByRole("radiogroup", { name, ...hidden });
const typeRadio = (name: string) =>
	within(group("Type")).getByRole("radio", { name, ...hidden });
const dateButton = () => screen.getByRole("button", { name: /^Date /, ...hidden });
const timePart = (type: "hour" | "minute" | "am/pm") =>
	screen.getByRole("spinbutton", { name: `${type}, Time`, ...hidden });
const textbox = (name: string) => screen.getByRole("textbox", { name, ...hidden });
const button = (name: string) => screen.getByRole("button", { name, ...hidden });
const tileNames = () =>
	within(group("Category"))
		.getAllByRole("radio", hidden)
		.map((each) => each.closest("label")?.textContent);
const described = (element: HTMLElement) =>
	(element.getAttribute("aria-describedby") ?? "")
		.split(" ")
		.map((id) => document.getElementById(id)?.textContent)
		.filter(Boolean)
		.join(" ");

/** Chooses a payee suggestion, typing `text` in place of what the field held. */
async function choosePayee(user: User, text: string, option: RegExp) {
	await user.clear(payee());
	await user.keyboard(text);
	await user.click(await screen.findByRole("option", { name: option }));
	await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

/** Types a payee no suggestion names, and leaves the field. */
async function typePayee(user: User, text: string) {
	await user.click(payee());
	await user.keyboard(text);
	await user.keyboard("{Escape}");
}

/** A valid expense: 640.00 to Kirana for Food, today at 12:00. */
async function fillValid(user: User) {
	await user.click(amount());
	await user.keyboard("640");
	await typePayee(user, "Kirana");
	await user.click(tile("Food"));
}

describe("the dialog (BR-F03-48)", () => {
	test("is titled New Transaction and is the large size, a bottom sheet on phones", async () => {
		renderDialog();

		expect(
			await screen.findByRole("heading", { name: "New Transaction" }),
		).toBeInTheDocument();
		expect(dialog().closest(".max-w-160")).not.toBeNull();
	});

	test("shows its fields in order, with Amount focused", async () => {
		renderDialog();

		await waitFor(() => expect(amount()).toHaveFocus());
		const order = [
			group("Type"),
			amount(),
			payee(),
			group("Category"),
			dateButton(),
			screen.getByRole("group", { name: "Time" }),
			textbox("Description"),
			button("Add a note"),
		];
		for (let index = 1; index < order.length; index++) {
			expect(
				order[index - 1]!.compareDocumentPosition(order[index]!)
					& Node.DOCUMENT_POSITION_FOLLOWING,
			).toBeTruthy();
		}
	});

	// BR-F03-07
	test("starts as an expense today at the current minute, with nothing else filled", async () => {
		renderDialog();

		expect(typeRadio("Expense")).toBeChecked();
		expect(amount()).toHaveValue("");
		expect(payee()).toHaveValue("");
		for (const each of within(group("Category")).getAllByRole("radio"))
			expect(each).not.toBeChecked();
		expect(dateButton()).toHaveAccessibleName("Date Today, 2 Nov");
		expect(timePart("hour")).toHaveAttribute("aria-valuetext", "12 pm");
		expect(timePart("minute")).toHaveAttribute("aria-valuenow", "0");
	});

	// D-241
	test("offers Expense, Income and Refund, and no Goal types until M2", () => {
		renderDialog();

		expect(
			within(group("Type"))
				.getAllByRole("radio")
				.map((each) => each.closest("label")?.textContent),
		).toEqual(["Expense", "Income", "Refund"]);
		expect(group("Type")).toHaveClass("w-full");
	});

	// AC-F03-62
	test("Expense shows golden data's 7 tiles and + 8 more", async () => {
		renderDialog();

		await waitFor(() =>
			expect(tileNames()).toEqual([
				"Food",
				"Entertainment",
				"Housing",
				"Shopping",
				"Transportation",
				"Health",
				"Utilities",
			]),
		);
		expect(button("+ 8 more categories")).toBeInTheDocument();
	});

	// AC-F03-62
	test("Income shows the 5 income tiles and no + N more", async () => {
		const { user } = renderDialog();

		await user.click(typeRadio("Income").closest("label")!);

		expect(tileNames()).toEqual([
			"Salary",
			"Freelance",
			"Investments",
			"Gifts",
			"Other income",
		]);
		expect(screen.queryByRole("button", { name: /more categories/ })).toBeNull();
	});

	test("the date's hint and the calendar's note", async () => {
		const { user } = renderDialog();

		expect(described(dateButton())).toBe("Today or one of the 10 days before.");
		await user.click(dateButton());
		const calendar = await screen.findByRole("dialog", {
			name: "Choose a date",
		});

		expect(calendar).toHaveAccessibleDescription(
			"You can choose today or one of the 10 days before. Arrow keys move, Enter picks.",
		);
	});

	// AC-F03-62, AC-F03-65
	test("the calendar enables 23 Oct to 2 Nov only", async () => {
		const { user } = renderDialog();

		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		const day = (name: RegExp) =>
			screen.getByRole("button", { name, hidden: true });

		expect(day(/Today, Monday, 2 November 2026/)).not.toHaveAttribute(
			"aria-disabled",
		);
		expect(day(/, 3 November 2026/)).toHaveAttribute("aria-disabled", "true");
		await user.click(button("Previous month"));
		await waitFor(() =>
			expect(day(/, 23 October 2026/)).not.toHaveAttribute("aria-disabled"),
		);
		expect(day(/, 22 October 2026/)).toHaveAttribute("aria-disabled", "true");
	});

	test("choosing a day changes the button", async () => {
		const { user } = renderDialog();

		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		await user.click(
			screen.getByRole("button", { name: /, 1 November 2026/, hidden: true }),
		);

		await waitFor(() =>
			expect(dateButton()).toHaveAccessibleName("Date Yesterday, 1 Nov"),
		);
	});

	test("the description has its hint, and its counter from 91 characters", async () => {
		const { user } = renderDialog();
		const description = screen.getByRole("textbox", {
			name: "Description",
		});

		expect(description).toHaveAccessibleDescription(
			"Shown under the payee in your list.",
		);
		await user.click(description);
		await user.paste("a".repeat(90));
		expect(screen.queryByText("90 / 120")).toBeNull();
		await user.keyboard("a");

		expect(screen.getByText("91 / 120")).toBeInTheDocument();
	});

	// AC-F03-62
	test("the payee's counter shows from 61 characters", async () => {
		const { user } = renderDialog();

		await user.click(payee());
		await user.paste("a".repeat(60));
		expect(screen.queryByText("60 / 80")).toBeNull();
		await user.keyboard("a");

		expect(screen.getByText("61 / 80")).toBeInTheDocument();
	});

	test("Add a note shows the note, focused, with its hint and counter", async () => {
		const { user } = renderDialog();

		await user.click(button("Add a note"));
		const note = textbox("Note");

		expect(note).toHaveFocus();
		expect(note.tagName).toBe("TEXTAREA");
		expect(note).toHaveAccessibleDescription(
			"Only shown in the details. Line breaks are fine.",
		);
		expect(screen.getByText("0 / 500")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
		await user.keyboard("a{Enter}b");
		expect(note).toHaveValue("a\nb");
		expect(screen.getByText("3 / 500")).toBeInTheDocument();
	});
});

describe("the footer (BR-F03-48, D-551)", () => {
	// AC-F03-62: desktop shows Cancel and the hint; the phone sheet neither
	test("Cancel and Ctrl Enter to save show from 768 px only", () => {
		renderDialog();

		expect(screen.getByText("Ctrl Enter to save")).toHaveClass("max-md:hidden");
		expect(button("Cancel")).toHaveClass("max-md:hidden");
		expect(button("Save and add another")).not.toHaveClass("max-md:hidden");
		expect(button("Save")).not.toHaveClass("max-md:hidden");
	});

	test("on macOS the hint reads ⌘ Enter to save", () => {
		vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
		renderDialog();

		expect(screen.getByText("⌘ Enter to save")).toBeInTheDocument();
	});

	test("has no Delete or Duplicate on a create", () => {
		renderDialog();

		expect(
			screen.queryByRole("button", { name: /Delete|Duplicate/ }),
		).toBeNull();
	});
});

describe("type (BR-F03-02, BR-F03-45)", () => {
	test("Income clears the category; back to Expense shows the expense tiles again", async () => {
		const { user } = renderDialog();

		await user.click(tile("Food"));
		await user.click(typeRadio("Income").closest("label")!);
		expect(
			within(group("Category"))
				.getAllByRole("radio")
				.some((each) => (each as HTMLInputElement).checked),
		).toBe(false);
		await user.click(typeRadio("Expense").closest("label")!);

		expect(tileNames()[0]).toBe("Food");
		expect(radio("Food")).not.toBeChecked();
	});

	test("Expense to Refund keeps the category", async () => {
		const { user } = renderDialog();

		await user.click(tile("Shopping"));
		await user.click(typeRadio("Refund").closest("label")!);

		expect(radio("Shopping")).toBeChecked();
	});

	test("a type change that clears the category also closes + N more", async () => {
		const { user } = renderDialog();

		await user.click(button("+ 8 more categories"));
		await user.click(typeRadio("Income").closest("label")!);
		await user.click(typeRadio("Expense").closest("label")!);

		expect(tileNames()).toHaveLength(7);
	});

	test("the arrow keys change the type", async () => {
		const { user } = renderDialog();

		typeRadio("Expense").focus();
		await user.keyboard("{ArrowRight}");

		expect(typeRadio("Income")).toBeChecked();
	});
});

describe("the payee fills the category (BR-F03-45, D-89, D-225)", () => {
	// AC-F03-20
	test("with Expense and Shopping chosen, choosing Swiggy sets Food with the hint", async () => {
		const { user } = renderDialog();

		await user.click(tile("Shopping"));
		await choosePayee(user, "swi", /^Swiggy/);

		expect(payee()).toHaveValue("Swiggy");
		expect(radio("Food")).toBeChecked();
		expect(group("Category")).toHaveAccessibleDescription(
			"From your last Swiggy Transaction",
		);
	});

	// AC-F03-20
	test("with Income, choosing Swiggy fills only the payee", async () => {
		const { user } = renderDialog();

		await user.click(typeRadio("Income").closest("label")!);
		await choosePayee(user, "swi", /^Swiggy/);

		expect(payee()).toHaveValue("Swiggy");
		expect(
			within(group("Category"))
				.getAllByRole("radio")
				.some((each) => (each as HTMLInputElement).checked),
		).toBe(false);
		expect(screen.queryByText(/From your last/)).toBeNull();
	});

	// AC-F03-20
	test("picking another category by hand removes the hint", async () => {
		const { user } = renderDialog();

		await choosePayee(user, "swi", /^Swiggy/);
		await user.click(tile("Health"));

		expect(radio("Health")).toBeChecked();
		expect(screen.queryByText(/From your last/)).toBeNull();
	});

	test("a type change that clears the category removes the hint", async () => {
		const { user } = renderDialog();

		await choosePayee(user, "swi", /^Swiggy/);
		await user.click(typeRadio("Income").closest("label")!);

		expect(screen.queryByText(/From your last/)).toBeNull();
	});

	test("a type change within expense and refund keeps the category and the hint", async () => {
		const { user } = renderDialog();

		await choosePayee(user, "swi", /^Swiggy/);
		await user.click(typeRadio("Refund").closest("label")!);

		expect(radio("Food")).toBeChecked();
		expect(
			screen.getByText("From your last Swiggy Transaction"),
		).toBeInTheDocument();
	});

	test("a payee whose last category is outside the tiles adds its tile", async () => {
		const { user } = renderDialog();

		await choosePayee(user, "myn", /^Myntra/);
		expect(radio("Shopping")).toBeChecked();
		await user.click(typeRadio("Income").closest("label")!);
		await choosePayee(user, "studio", /^Studio Nine/);

		expect(radio("Freelance")).toBeChecked();
		expect(
			screen.getByText("From your last Studio Nine Transaction"),
		).toBeInTheDocument();
	});

	test("Use “X” as a new payee keeps the text and leaves the category", async () => {
		const { user } = renderDialog();

		await user.click(tile("Health"));
		await user.click(payee());
		await user.keyboard("Kirana");
		await user.click(await screen.findByRole("option", { name: /new payee/ }));

		expect(payee()).toHaveValue("Kirana");
		expect(radio("Health")).toBeChecked();
		expect(screen.queryByText(/From your last/)).toBeNull();
	});
});

describe("amount (BR-F03-04)", () => {
	test("is re-formatted with grouping on blur", async () => {
		const { user } = renderDialog();

		await user.click(amount());
		await user.keyboard("123456.5");
		await user.tab();

		expect(amount()).toHaveValue("1,23,456.50");
	});

	test("text that is not an amount stays as typed on blur", async () => {
		const { user } = renderDialog();

		await user.click(amount());
		await user.keyboard("12a");
		await user.tab();

		expect(amount()).toHaveValue("12a");
		expect(amount()).not.toHaveAttribute("aria-invalid");
	});
});

describe("checks on Save (F03 section 8)", () => {
	test("an empty Save puts each message under its field and focuses Amount, sending nothing", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await user.click(button("Save"));

		await waitFor(() => expect(amount()).toHaveFocus());
		expect(amount()).toHaveAccessibleDescription("Enter an amount.");
		expect(payee()).toHaveAccessibleDescription(
			"Enter who you paid, or who paid you.",
		);
		expect(group("Category")).toHaveAccessibleDescription("Choose a category.");
		expect(sent).toHaveLength(0);
	});

	test("nothing is checked before the first Save", async () => {
		const { user } = renderDialog();

		await user.click(amount());
		await user.keyboard("abc");
		await user.tab();

		expect(amount()).not.toHaveAttribute("aria-invalid");
	});

	test("after a refused Save, each change checks again", async () => {
		const { user } = renderDialog();

		await user.click(button("Save"));
		await waitFor(() =>
			expect(amount()).toHaveAttribute("aria-invalid", "true"),
		);
		await user.click(amount());
		await user.keyboard("6");

		await waitFor(() => expect(amount()).not.toHaveAttribute("aria-invalid"));
		await user.keyboard("a");
		await waitFor(() =>
			expect(amount()).toHaveAccessibleDescription(
				"Enter a number, like 1,240.50.",
			),
		);
	});

	test("the focus goes to the first field with a message: Category", async () => {
		const { user } = renderDialog();

		await user.click(amount());
		await user.keyboard("640");
		await typePayee(user, "Kirana");
		await user.click(button("Save"));

		await waitFor(() => expect(radio("Food")).toHaveFocus());
	});

	// D-540
	test("a time later than now today gets The time can't be in the future.", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(timePart("minute"));
		await user.keyboard("{ArrowUp}");
		await user.click(button("Save"));

		await waitFor(() =>
			expect(timePart("hour")).toHaveAttribute("aria-invalid", "true"),
		);
		expect(
			screen.getByText("The time can't be in the future."),
		).toBeInTheDocument();
		expect(sent).toHaveLength(0);
	});

	test("the same time on an earlier day saves", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(timePart("minute"));
		await user.keyboard("{ArrowUp}");
		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		await user.click(
			screen.getByRole("button", { name: /, 1 November 2026/, hidden: true }),
		);
		await user.click(button("Save"));

		await waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]!.body).toMatchObject({
			occurredOn: "2026-11-01",
			occurredAt: "2026-11-01T06:31:00Z",
		});
	});

	// D-549
	// AC-F03-70
	test("an emptied time gets Enter a time.", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(timePart("hour"));
		await user.keyboard("{Backspace}{Backspace}");
		await user.click(timePart("minute"));
		await user.keyboard("{Backspace}{Backspace}");
		await user.click(timePart("am/pm"));
		await user.keyboard("{Backspace}");
		await user.click(button("Save"));

		await waitFor(() =>
			expect(screen.getByText("Enter a time.")).toBeInTheDocument(),
		);
		expect(sent).toHaveLength(0);
	});

	// D-551
	test("past midnight, Save refuses a date that left the window", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		await user.click(button("Previous month"));
		await user.click(
			await screen.findByRole("button", {
				name: /, 23 October 2026/,
				hidden: true,
			}),
		);
		vi.setSystemTime(new Date("2026-11-02T18:31:00.000Z"));
		await user.click(button("Save"));

		await waitFor(() => expect(dateButton()).toHaveFocus());
		expect(described(dateButton())).toBe(
			"Choose today or one of the 10 days before.",
		);
		expect(dateButton()).toHaveAttribute("data-invalid", "true");
		expect(sent).toHaveLength(0);
	});

	test("a long description gets its message", async () => {
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(textbox("Description"));
		await user.paste("a".repeat(121));
		await user.click(button("Save"));

		await waitFor(() =>
			expect(textbox("Description")).toHaveAccessibleDescription(
				"Use 120 characters or fewer.",
			),
		);
	});

	test("a long note gets its message rather than being cut", async () => {
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Add a note"));
		await user.paste("a".repeat(501));
		await user.click(button("Save"));

		const note = textbox("Note");
		await waitFor(() =>
			expect(note).toHaveAccessibleDescription("Use 500 characters or fewer."),
		);
		expect(note).toHaveValue("a".repeat(501));
	});
});

describe("Save (BR-F03-20, BR-F03-21)", () => {
	test("sends the create, then answers the row and closes", async () => {
		const sent = creates();
		const { user, onCreated, onClose } = renderDialog();

		await fillValid(user);
		await user.click(textbox("Description"));
		await user.keyboard(" Weekly shop ");
		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(1);
		const body = sent[0]!.body as Record<string, unknown>;
		expect(body).toEqual({
			id: body["id"],
			type: "expense",
			amountMinor: 64000,
			currency: "INR",
			occurredAt: "2026-11-02T06:30:00Z",
			occurredOn: "2026-11-02",
			createdAt: "2026-11-02T06:30:00.000Z",
			category: "food",
			goalId: null,
			payee: "Kirana",
			description: "Weekly shop",
			note: null,
		});
		expect(isUuidV7(body["id"] as string)).toBe(true);
		expect(isUuidV7(sent[0]!.headers.get("idempotency-key"))).toBe(true);
		expect(onCreated).toHaveBeenCalledExactlyOnceWith(
			expect.objectContaining({ id: body["id"], payee: "Kirana" }),
			"save",
		);
	});

	test("a refund sends its own type", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await user.click(typeRadio("Refund").closest("label")!);
		await fillValid(user);
		await user.click(button("Save"));

		await waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]!.body).toMatchObject({ type: "refund", category: "food" });
	});

	test("while it saves, Save shows it is busy and nothing else can be pressed", async () => {
		let answer: (value: Response) => void = () => {};
		creates(() => new Promise<Response>((resolve) => (answer = resolve)));
		const { user, onClose } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		await waitFor(() =>
			expect(button("Save")).toHaveAttribute("aria-disabled", "true"),
		);
		expect(button("Save and add another")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		expect(button("Cancel")).toHaveAttribute("aria-disabled", "true");
		expect(amount()).toBeDisabled();
		await user.keyboard("{Escape}");
		expect(onClose).not.toHaveBeenCalled();
		await act(async () => answer(ok(row(), 201)));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	test("two quick presses send one create", async () => {
		let answer: (value: Response) => void = () => {};
		const sent = creates(
			() => new Promise<Response>((resolve) => (answer = resolve)),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));
		await waitFor(() => expect(sent).toHaveLength(1));
		await user.click(button("Save"));
		await user.keyboard("{Control>}{Enter}{/Control}");
		await act(async () => answer(ok(row(), 201)));

		expect(sent).toHaveLength(1);
	});

	// BR-F03-52
	test("Ctrl Enter saves from inside a text field", async () => {
		const sent = creates();
		const { user, onClose } = renderDialog();

		await fillValid(user);
		await user.click(amount());
		await user.keyboard("{Control>}{Enter}{/Control}");

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(1);
	});

	test("Enter alone in a field does not save", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(amount());
		await user.keyboard("{Enter}");
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(sent).toHaveLength(0);
	});

	test("a submit of the form itself sends nothing and keeps the page", async () => {
		const sent = creates();
		renderDialog();

		const form = screen.getByRole("form", {
			name: "New Transaction",
			hidden: true,
		});
		const event = new Event("submit", { bubbles: true, cancelable: true });
		act(() => {
			form.dispatchEvent(event);
		});

		expect(event.defaultPrevented).toBe(true);
		expect(sent).toHaveLength(0);
	});

	test("a closed dialog does not save on Ctrl Enter", async () => {
		const sent = creates();
		const { user } = renderDialog({ isOpen: false });

		await user.keyboard("{Control>}{Enter}{/Control}");
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(sent).toHaveLength(0);
	});
});

// AC-F03-70
describe("Save and add another (BR-F03-21, D-551)", () => {
	test("keeps the type, date and time, empties the rest and focuses Amount", async () => {
		const sent = creates();
		const { user, onCreated, onClose } = renderDialog();

		await user.click(typeRadio("Refund").closest("label")!);
		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		await user.click(button("Previous month"));
		await user.click(
			await screen.findByRole("button", {
				name: /, 30 October 2026/,
				hidden: true,
			}),
		);
		await fillValid(user);
		await user.click(textbox("Description"));
		await user.keyboard("Weekly");
		await user.click(button("Add a note"));
		await user.keyboard("Note");
		await user.click(button("Save and add another"));

		await waitFor(() =>
			expect(onCreated).toHaveBeenCalledWith(expect.anything(), "again"),
		);
		await waitFor(() => expect(amount()).toHaveFocus());
		expect(onClose).not.toHaveBeenCalled();
		expect(typeRadio("Refund")).toBeChecked();
		expect(dateButton()).toHaveAccessibleName("Date Fri, 30 Oct");
		expect(timePart("hour")).toHaveAttribute("aria-valuetext", "12 pm");
		expect(amount()).toHaveValue("");
		expect(payee()).toHaveValue("");
		expect(radio("Food")).not.toBeChecked();
		expect(textbox("Description")).toHaveValue("");
		expect(button("Add a note")).toBeInTheDocument();
		expect(sent).toHaveLength(1);
	});

	test("the next Save sends a new id under a new key", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save and add another"));
		await waitFor(() => expect(amount()).toHaveFocus());
		await fillValid(user);
		await user.click(button("Save"));

		await waitFor(() => expect(sent).toHaveLength(2));
		const [first, second] = sent as [(typeof sent)[0], (typeof sent)[0]];
		expect((first.body as { id: string }).id).not.toBe(
			(second.body as { id: string }).id,
		);
		expect(first.headers.get("idempotency-key")).not.toBe(
			second.headers.get("idempotency-key"),
		);
	});

	test("the emptied form checks only on its own next Save", async () => {
		creates();
		const { user } = renderDialog();

		await user.click(button("Save"));
		await fillValid(user);
		await user.click(button("Save and add another"));
		await waitFor(() => expect(amount()).toHaveFocus());

		expect(amount()).not.toHaveAttribute("aria-invalid");
		expect(payee()).not.toHaveAttribute("aria-invalid");
	});

	// D-551
	test("afterwards, Escape closes without asking: the kept values are the new start", async () => {
		creates();
		const { user, onClose } = renderDialog();

		await user.click(typeRadio("Income").closest("label")!);
		await user.click(amount());
		await user.keyboard("100");
		await typePayee(user, "Acme");
		await user.click(tile("Salary"));
		await user.click(button("Save and add another"));
		await waitFor(() => expect(amount()).toHaveFocus());
		await user.keyboard("{Escape}");

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});
});

describe("a refused save (flow 7.1, F03 section 8)", () => {
	test("no answer keeps the dialog open with the values and Your change wasn't saved.", async () => {
		creates(() => HttpResponse.error());
		const { user, onClose, onCreated } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Your change wasn't saved. Try again.",
		);
		expect(onClose).not.toHaveBeenCalled();
		expect(onCreated).not.toHaveBeenCalled();
		expect(amount()).toHaveValue("640.00");
		expect(payee()).toHaveValue("Kirana");
	});

	test("a 500 says the same", async () => {
		creates(() => refuse(500, "internal", { message: "Something broke." }));
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Your change wasn't saved. Try again.",
		);
	});

	test("Save again sends a new id under a new key, and a success clears the line", async () => {
		const sent = creates((_request, index) =>
			index === 0 ? HttpResponse.error() : ok(row(), 201),
		);
		const { user, onClose } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));
		await screen.findByRole("alert");
		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent[0]!.headers.get("idempotency-key")).not.toBe(
			sent[1]!.headers.get("idempotency-key"),
		);
	});

	test("a 422 puts each message under its field and focuses the first", async () => {
		creates(() =>
			refuse(422, "validation_failed", {
				fields: {
					payee: "Remove unsupported characters.",
					occurredAt: "The time can't be in the future.",
				},
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		await waitFor(() => expect(payee()).toHaveFocus());
		expect(payee()).toHaveAccessibleDescription(
			"Remove unsupported characters.",
		);
		expect(
			screen.getByText("The time can't be in the future."),
		).toBeInTheDocument();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	test("a field's refusal goes when that field changes", async () => {
		creates(() =>
			refuse(422, "validation_failed", {
				fields: { payee: "Remove unsupported characters." },
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));
		await waitFor(() => expect(payee()).toHaveFocus());
		await user.keyboard("s");

		expect(payee()).not.toHaveAttribute("aria-invalid");
	});

	test("a window refusal on a create keeps its own words under Date", async () => {
		creates(() =>
			refuse(422, "date_out_of_window", {
				fields: { occurredOn: "Choose today or one of the 10 days before." },
				details: { firstOn: "2026-10-23", lastOn: "2026-11-02" },
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		await waitFor(() => expect(dateButton()).toHaveFocus());
		expect(described(dateButton())).toBe(
			"Choose today or one of the 10 days before.",
		);
	});

	test("a refusal of a field the dialog does not show is the line at the top", async () => {
		creates(() =>
			refuse(422, "validation_failed", {
				fields: { createdAt: "The recording time can't be in the future." },
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"The recording time can't be in the future.",
		);
	});

	test("a field message and a hidden one show both", async () => {
		creates(() =>
			refuse(422, "validation_failed", {
				fields: {
					amountMinor: "Enter an amount above zero.",
					goalId: "Only Goal Transactions have a Goal.",
				},
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Only Goal Transactions have a Goal.",
		);
		expect(amount()).toHaveAccessibleDescription("Enter an amount above zero.");
	});

	test("currency_mismatch shows its message", async () => {
		creates(() =>
			refuse(422, "currency_mismatch", {
				message: "Not saved: your currency changed after this was made.",
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Not saved: your currency changed after this was made.",
		);
	});

	test("a 409 on a create reads as a failed save", async () => {
		creates(() =>
			refuse(409, "version_conflict", {
				message: "Changed elsewhere.",
				details: { current: row() },
			}),
		);
		const { user } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));

		expect(await screen.findByRole("alert")).toHaveTextContent(
			"Your change wasn't saved. Try again.",
		);
	});

	test("a 401 shows nothing in the dialog: the app's banner answers it", async () => {
		creates(() => refuse(401, "unauthorized"));
		const { user, onClose } = renderDialog();

		await fillValid(user);
		await user.click(button("Save"));
		await waitFor(() =>
			expect(button("Save")).not.toHaveAttribute("aria-disabled"),
		);

		expect(screen.queryByRole("alert")).toBeNull();
		expect(onClose).not.toHaveBeenCalled();
	});
});

describe("offline (D-241)", () => {
	test("Save is disabled, with You are offline. Connect to save.", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => onlineManager.setOnline(false));
		const sent = creates();
		const { user } = renderDialog();

		expect(
			screen.getByText("You are offline. Connect to save."),
		).toBeInTheDocument();
		expect(button("Save")).toHaveAttribute("aria-disabled", "true");
		expect(button("Save and add another")).toHaveAttribute(
			"aria-disabled",
			"true",
		);
		await fillValid(user);
		await user.keyboard("{Control>}{Enter}{/Control}");
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(sent).toHaveLength(0);
	});

	test("going offline while open disables Save, and coming back enables it", async () => {
		const { user } = renderDialog();
		const online = vi.spyOn(navigator, "onLine", "get");

		online.mockReturnValue(false);
		act(() => window.dispatchEvent(new Event("offline")));
		await waitFor(() =>
			expect(button("Save")).toHaveAttribute("aria-disabled", "true"),
		);
		online.mockReturnValue(true);
		act(() => window.dispatchEvent(new Event("online")));

		await waitFor(() =>
			expect(button("Save")).not.toHaveAttribute("aria-disabled"),
		);
		expect(screen.queryByText("You are offline. Connect to save.")).toBeNull();
		await user.click(amount());
	});
});

describe("closing (BR-F03-49, D-551)", () => {
	// AC-F03-70: Escape on an untouched dialog closes it
	test.each([
		["Escape", async (user: User) => user.keyboard("{Escape}")],
		["Cancel", async (user: User) => user.click(button("Cancel"))],
		["Close", async (user: User) => user.click(button("Close"))],
	])("untouched, %s closes at once", async (_name, close) => {
		const { user, onClose } = renderDialog();

		await close(user);

		expect(onClose).toHaveBeenCalledOnce();
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	test.each([
		["Escape", async (user: User) => user.keyboard("{Escape}")],
		["Cancel", async (user: User) => user.click(button("Cancel"))],
		["Close", async (user: User) => user.click(button("Close"))],
	])("with a change, %s asks Discard changes?", async (_name, close) => {
		const { user, onClose } = renderDialog();

		await user.click(amount());
		await user.keyboard("6");
		await close(user);

		const confirm = await screen.findByRole("alertdialog", {
			name: "Discard changes?",
		});
		expect(confirm).toHaveTextContent("What you've typed here won't be saved.");
		expect(onClose).not.toHaveBeenCalled();
	});

	// AC-F03-70
	test("changing only the date asks too", async () => {
		const { user } = renderDialog();

		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		await user.click(
			screen.getByRole("button", { name: /, 1 November 2026/, hidden: true }),
		);
		await waitFor(() =>
			expect(dateButton()).toHaveAccessibleName("Date Yesterday, 1 Nov"),
		);
		// Focus comes back to the button a moment after the calendar closes.
		await waitFor(() => expect(dateButton()).toHaveFocus());
		await user.keyboard("{Escape}");

		expect(
			await screen.findByRole("alertdialog", { name: "Discard changes?" }),
		).toBeInTheDocument();
	});

	test("a change undone closes without asking", async () => {
		const { user, onClose } = renderDialog();

		await user.click(amount());
		await user.keyboard("6{Backspace}");
		await user.keyboard("{Escape}");

		expect(onClose).toHaveBeenCalledOnce();
	});

	test("Keep editing returns to the dialog with the values", async () => {
		const { user, onClose } = renderDialog();

		await user.click(amount());
		await user.keyboard("640");
		await user.keyboard("{Escape}");
		await user.click(
			await screen.findByRole("button", { name: "Keep editing" }),
		);

		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(onClose).not.toHaveBeenCalled();
		expect(amount()).toHaveValue("640.00");
	});

	test("Discard closes the dialog", async () => {
		const { user, onClose } = renderDialog();

		await user.click(amount());
		await user.keyboard("640");
		await user.keyboard("{Escape}");
		await user.click(await screen.findByRole("button", { name: "Discard" }));

		expect(onClose).toHaveBeenCalledOnce();
	});

	test("Ctrl Enter while the confirm is open does not save", async () => {
		const sent = creates();
		const { user } = renderDialog();

		await fillValid(user);
		await user.keyboard("{Escape}");
		const confirm = await screen.findByRole("alertdialog");
		// Off its buttons, as after a click on its text; on a button, Enter presses it.
		act(() => confirm.focus());
		await user.keyboard("{Control>}{Enter}{/Control}");
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(sent).toHaveLength(0);
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
	});

	test("Escape in the payee's open list closes the list, not the dialog", async () => {
		const { user, onClose } = renderDialog();

		await user.click(payee());
		await screen.findByRole("listbox");
		await user.keyboard("{Escape}");

		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
		expect(onClose).not.toHaveBeenCalled();
	});
});

// Golden #24 as the API answers it: Swiggy 640.00 on 19 Oct at 10:15 pm, recorded a minute
// later, so its own window runs from 9 Oct to 19 Oct.
const ROW_24 = row();
const ROW_24_PATH = `/api/transactions/${ROW_24.id}`;

/** `PATCH /api/transactions/[id]`, answering `respond`, or the row with the change applied
 * and its version raised. */
function edits(
	respond: Parameters<typeof route>[3] = ({ body }) =>
		ok({ ...ROW_24, ...(body as object), version: ROW_24.version + 1 }),
	path = ROW_24_PATH,
) {
	return route(network, "patch", path, respond);
}

const titled = (name: string) => screen.getByRole("dialog", { name, ...hidden });
const conflictView = () =>
	screen.getByRole("dialog", {
		name: "This Transaction changed on another device",
	});

/** Raises the amount to 700 and saves. */
async function raiseAmount(user: User) {
	await user.click(amount());
	await user.clear(amount());
	await user.keyboard("700");
	await user.click(button("Save"));
}

describe("editing a row (BR-F03-23, flow 7.3)", () => {
	test("opens as Edit Transaction with the row's values", async () => {
		renderDialog({ mode: { kind: "edit", row: ROW_24 } });

		expect(
			await screen.findByRole("heading", { name: "Edit Transaction" }),
		).toBeInTheDocument();
		expect(typeRadio("Expense")).toBeChecked();
		expect(amount()).toHaveValue("640.00");
		expect(payee()).toHaveValue("Swiggy");
		expect(radio("Food")).toBeChecked();
		expect(dateButton()).toHaveAccessibleName("Date Mon, 19 Oct");
		expect(timePart("hour")).toHaveAttribute("aria-valuetext", "10 pm");
		expect(timePart("minute")).toHaveAttribute("aria-valuenow", "15");
		expect(textbox("Description")).toHaveValue("");
		expect(button("Add a note")).toBeInTheDocument();
	});

	// AC-F03-62
	test("shows Save and Cancel, and no Save and add another or Duplicate", async () => {
		renderDialog({ mode: { kind: "edit", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(button("Save")).toBeInTheDocument();
		expect(button("Cancel")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", {
				name: "Save and add another",
				...hidden,
			}),
		).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Duplicate", ...hidden }),
		).toBeNull();
	});

	// AC-F03-62
	test("Delete hands the row over and closes, changes and all, once the delete is confirmed", async () => {
		const onDelete = vi.fn();
		const sent = edits();
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onDelete,
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(amount());
		await user.keyboard("9");
		await user.click(button("Delete"));

		// The host's confirm asks first; the dialog stays until it is confirmed (D-84).
		expect(onDelete).toHaveBeenCalledWith(ROW_24, expect.any(Function));
		expect(onClose).not.toHaveBeenCalled();
		act(() => {
			(onDelete.mock.calls[0]![1] as () => void)();
		});
		expect(onClose).toHaveBeenCalledOnce();
		expect(screen.queryByRole("alertdialog")).toBeNull();
		expect(sent).toEqual([]);
	});

	test("Delete waits while a save runs", async () => {
		let release = () => {};
		edits(
			() =>
				new Promise((resolve) => {
					release = () =>
						resolve(ok({ ...ROW_24, amountMinor: 70000, version: 2 }));
				}),
		);
		const onDelete = vi.fn();
		const { user } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onDelete,
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);
		await waitFor(() =>
			expect(button("Delete")).toHaveAttribute("aria-disabled", "true"),
		);
		await user.click(button("Delete"));

		expect(onDelete).not.toHaveBeenCalled();
		release();
	});

	test("a new Transaction and a duplicate have no Delete", async () => {
		const onDelete = vi.fn();
		const first = renderDialog({ onDelete });
		await screen.findByRole("heading", { name: "New Transaction" });
		expect(
			screen.queryByRole("button", { name: "Delete", ...hidden }),
		).toBeNull();
		first.unmount();

		renderDialog({ mode: { kind: "duplicate", row: ROW_24 }, onDelete });
		await screen.findByRole("heading", { name: "Duplicate Transaction" });
		expect(
			screen.queryByRole("button", { name: "Delete", ...hidden }),
		).toBeNull();
	});

	test("a row with a note opens with the note showing", async () => {
		renderDialog({
			mode: {
				kind: "edit",
				row: row({ note: "Team lunch", description: "Office" }),
			},
		});

		expect(await screen.findByRole("textbox", { name: "Note" })).toHaveValue(
			"Team lunch",
		);
		expect(textbox("Description")).toHaveValue("Office");
		expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	});

	test("the date has no hint, and its calendar offers the row's own window", async () => {
		const { user } = renderDialog({ mode: { kind: "edit", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(described(dateButton())).toBe("");
		await user.click(dateButton());
		const calendar = await screen.findByRole("dialog", {
			name: "Choose a date",
		});

		expect(calendar).toHaveTextContent(
			"You can choose a date from 9 Oct to 19 Oct. Arrow keys move, Enter picks.",
		);
		expect(
			screen.getByRole("button", { name: /, 9 October 2026/, hidden: true }),
		).not.toHaveAttribute("aria-disabled");
		expect(
			screen.getByRole("button", { name: /, 8 October 2026/, hidden: true }),
		).toHaveAttribute("aria-disabled", "true");
		expect(
			screen.getByRole("button", { name: /, 20 October 2026/, hidden: true }),
		).toHaveAttribute("aria-disabled", "true");
	});

	// BR-F03-23
	test("Save sends only the changed amount, with its currency, at the row's version", async () => {
		const sent = edits();
		const { user, onEdited, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onEdited: vi.fn(),
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(1);
		expect(sent[0]!.body).toEqual({ amountMinor: 70000, currency: "INR" });
		expect(sent[0]!.headers.get("If-Match")).toBe('"1"');
		expect(isUuidV7(sent[0]!.headers.get("Idempotency-Key") ?? "")).toBe(true);
		expect(onEdited).toHaveBeenCalledWith(
			expect.objectContaining({
				id: ROW_24.id,
				amountMinor: 70000,
				version: 2,
			}),
		);
	});

	// D-552, AC-F03-72
	test("Save with nothing changed closes and sends nothing", async () => {
		const sent = edits();
		const onEdited = vi.fn();
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onEdited,
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(0);
		expect(onEdited).not.toHaveBeenCalled();
	});

	test("a new time alone sends the date and time together, the date kept", async () => {
		const sent = edits();
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(timePart("hour"));
		await user.keyboard("9");
		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent[0]!.body).toEqual({
			occurredAt: "2026-10-19T15:45:00Z",
			occurredOn: "2026-10-19",
		});
	});

	// BR-F03-02
	test("Income clears the category, and Save sends the type and the new category", async () => {
		const sent = edits();
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(typeRadio("Income"));
		expect(radio("Salary")).not.toBeChecked();
		await user.click(tile("Salary"));
		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent[0]!.body).toEqual({ type: "income", category: "salary" });
	});

	test("Refund keeps the category and sends the type alone", async () => {
		const sent = edits();
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(typeRadio("Refund"));
		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent[0]!.body).toEqual({ type: "refund" });
	});

	test("Escape with nothing changed closes at once; after a change it asks first", async () => {
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(amount());
		await user.keyboard("1");
		await user.keyboard("{Escape}");

		expect(
			await screen.findByRole("alertdialog", { name: "Discard changes?" }),
		).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("Escape on an unchanged edit closes without asking", async () => {
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await waitFor(() => expect(amount()).toHaveFocus());

		await user.keyboard("{Escape}");

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(screen.queryByRole("alertdialog")).toBeNull();
	});

	// D-499
	test("a refused date names the row's window from the server's details", async () => {
		edits(() =>
			refuse(422, "date_out_of_window", {
				fields: {
					occurredOn: "Choose a date in this Transaction's entry window.",
				},
				details: { firstOn: "2026-10-06", lastOn: "2026-10-16" },
			}),
		);
		const { user } = renderDialog({ mode: { kind: "edit", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });
		await user.click(
			screen.getByRole("button", { name: /, 18 October 2026/, hidden: true }),
		);
		await user.click(button("Save"));

		await waitFor(() =>
			expect(described(dateButton())).toBe(
				"Choose a date from 6 Oct to 16 Oct.",
			),
		);
		expect(dateButton()).toHaveAttribute("data-invalid", "true");
	});

	test("a failed save keeps the dialog open with the line", async () => {
		edits(() => refuse(500, "internal"));
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);

		expect(
			await screen.findByText("Your change wasn't saved. Try again."),
		).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	// BR-F03-25
	test("a 404 tells the page the row is gone and closes", async () => {
		edits(() => refuse(404, "not_found"));
		const onGone = vi.fn();
		const onEdited = vi.fn();
		const { user, onClose, queryClient } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onGone,
			onEdited,
		});
		queryClient.setQueryData(["transactions", "detail", ROW_24.id], ROW_24);
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(onGone).toHaveBeenCalledWith(ROW_24.id);
		expect(onEdited).not.toHaveBeenCalled();
	});

	test("offline, Save is disabled with the message", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		renderDialog({ mode: { kind: "edit", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(
			screen.getByText("You are offline. Connect to save."),
		).toBeInTheDocument();
		expect(button("Save")).toHaveAttribute("aria-disabled", "true");
	});
});

describe("the conflict view (BR-F03-24, flow 7.4)", () => {
	const CURRENT = { ...ROW_24, amountMinor: 66000, note: "Split", version: 2 };

	// AC-F03-19
	test("a 409 opens both versions; Keep mine resends the change at the saved version", async () => {
		const sent = edits((request, index) =>
			index === 0 ?
				refuse(409, "version_conflict", { details: { current: CURRENT } })
			:	ok({ ...CURRENT, ...(request.body as object), version: 3 }),
		);
		const onEdited = vi.fn();
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onEdited,
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);
		const view = await screen.findByRole("dialog", {
			name: "This Transaction changed on another device",
		});
		const amountRow = within(view)
			.getByRole("rowheader", { name: /^Amount/ })
			.closest("tr")!;
		expect(
			within(amountRow)
				.getAllByRole("cell")
				.map((each) => each.textContent),
		).toEqual(["₹700.00", "₹660.00"]);
		expect(view).toHaveTextContent(
			"Keep mine saves your change to Amount and keeps the rest as it is saved now.",
		);
		await user.click(within(view).getByRole("button", { name: "Keep mine" }));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(2);
		expect(sent[1]!.body).toEqual({ amountMinor: 70000, currency: "INR" });
		expect(sent[1]!.headers.get("If-Match")).toBe('"2"');
		expect(sent[1]!.headers.get("Idempotency-Key")).not.toBe(
			sent[0]!.headers.get("Idempotency-Key"),
		);
		expect(onEdited).toHaveBeenCalledWith(
			expect.objectContaining({
				amountMinor: 70000,
				note: "Split",
				version: 3,
			}),
		);
	});

	test("Keep theirs sends nothing, shows the saved row and closes", async () => {
		const sent = edits(() =>
			refuse(409, "version_conflict", { details: { current: CURRENT } }),
		);
		const onEdited = vi.fn();
		const { user, onClose, queryClient } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
			onEdited,
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);
		await user.click(
			within(
				await screen.findByRole("dialog", {
					name: "This Transaction changed on another device",
				}),
			).getByRole("button", { name: "Keep theirs" }),
		);

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent).toHaveLength(1);
		expect(onEdited).not.toHaveBeenCalled();
		expect(
			queryClient.getQueryData(["transactions", "detail", ROW_24.id]),
		).toEqual(CURRENT);
	});

	test("another 409 on Keep mine shows the newer saved version", async () => {
		const NEWER = { ...CURRENT, amountMinor: 68000, version: 3 };
		const sent = edits((_, index) =>
			refuse(409, "version_conflict", {
				details: { current: index === 0 ? CURRENT : NEWER },
			}),
		);
		const { user } = renderDialog({ mode: { kind: "edit", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);
		await user.click(
			within(
				await screen.findByRole("dialog", {
					name: "This Transaction changed on another device",
				}),
			).getByRole("button", { name: "Keep mine" }),
		);

		await waitFor(() => expect(conflictView()).toHaveTextContent("₹680.00"));
		expect(sent[1]!.headers.get("If-Match")).toBe('"2"');
		await user.click(
			within(conflictView()).getByRole("button", { name: "Keep mine" }),
		);
		await waitFor(() => expect(sent).toHaveLength(3));
		expect(sent[2]!.headers.get("If-Match")).toBe('"3"');
	});

	test("a refusal of Keep mine closes the view and shows under its field", async () => {
		edits((_, index) =>
			index === 0 ?
				refuse(409, "version_conflict", { details: { current: CURRENT } })
			:	refuse(422, "validation_failed", {
					fields: {
						amountMinor: "The largest amount is 99,99,99,999.99.",
					},
				}),
		);
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);
		await user.click(
			within(
				await screen.findByRole("dialog", {
					name: "This Transaction changed on another device",
				}),
			).getByRole("button", { name: "Keep mine" }),
		);

		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", {
					name: "This Transaction changed on another device",
				}),
			).toBeNull(),
		);
		expect(
			await screen.findByText("The largest amount is 99,99,99,999.99."),
		).toBeInTheDocument();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("closing the view goes back to the dialog with what was typed", async () => {
		const sent = edits(() =>
			refuse(409, "version_conflict", { details: { current: CURRENT } }),
		);
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_24 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);
		await screen.findByRole("dialog", {
			name: "This Transaction changed on another device",
		});
		await user.keyboard("{Escape}");

		await waitFor(() =>
			expect(
				screen.queryByRole("dialog", {
					name: "This Transaction changed on another device",
				}),
			).toBeNull(),
		);
		expect(titled("Edit Transaction")).toBeInTheDocument();
		expect(amount()).toHaveValue("700.00");
		expect(onClose).not.toHaveBeenCalled();
		expect(sent).toHaveLength(1);
	});

	test("a 409 without the saved row shows the server's message in the dialog", async () => {
		edits(() =>
			refuse(409, "version_conflict", { message: "This changed. Try again." }),
		);
		const { user } = renderDialog({ mode: { kind: "edit", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);

		expect(
			await screen.findByText("This changed. Try again."),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("dialog", {
				name: "This Transaction changed on another device",
			}),
		).toBeNull();
	});
});

describe("editing a charge or a demo row (BR-F03-11, BR-F03-16)", () => {
	// Golden #16 at M1: the unlinked Netflix charge of 5 Oct.
	const ROW_16 = row({
		id: "0192f0c4-7a1e-7c3b-9d2a-000000000016",
		amountMinor: 64900,
		occurredOn: "2026-10-05",
		occurredAt: "2026-10-04T18:30:00.000Z",
		category: "entertainment",
		payee: "Netflix",
		source: "subscription",
		dueOn: "2026-10-05",
	});

	test("a charge has no Type, says why, and shows its date with Auto", async () => {
		renderDialog({ mode: { kind: "edit", row: ROW_16 } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(
			screen.queryByRole("radiogroup", { name: "Type", ...hidden }),
		).toBeNull();
		expect(
			screen.getByText(
				"From a deleted Subscription. Its type, date and time are fixed.",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: /^Date /, ...hidden }),
		).toBeNull();
		expect(screen.queryByRole("group", { name: "Time", ...hidden })).toBeNull();
		const terms = screen
			.getAllByRole("term", hidden)
			.map((term) => [term.textContent, term.nextElementSibling?.textContent]);
		expect(terms).toEqual([
			["Date", "Mon, 5 Oct"],
			["Time", "Auto"],
		]);
	});

	test("a charge's amount, category and text can change, and only they are sent", async () => {
		const sent = edits(
			({ body }) => ok({ ...ROW_16, ...(body as object), version: 2 }),
			`/api/transactions/${ROW_16.id}`,
		);
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_16 },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await raiseAmount(user);

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent[0]!.body).toEqual({ amountMinor: 70000, currency: "INR" });
	});

	test("a fixed date of today reads as its day, not Today", async () => {
		renderDialog({
			mode: {
				kind: "edit",
				row: row({
					demo: true,
					occurredOn: "2026-11-02",
					occurredAt: "2026-11-02T04:00:00.000Z",
					createdAt: "2026-11-02T04:00:00.000Z",
				}),
			},
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(
			screen.getAllByRole("term", hidden)[0]!.nextElementSibling,
		).toHaveTextContent("Mon, 2 Nov");
	});

	test("a linked charge says what editing it does", async () => {
		renderDialog({
			mode: {
				kind: "edit",
				row: {
					...ROW_16,
					subscriptionId: "0192f0c4-7a1e-7c3b-9d2a-000000000001",
				},
			},
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(
			screen.getByText(
				"Auto from Netflix. Its type, date and time are fixed; editing it stops the Subscription from changing this charge.",
			),
		).toBeInTheDocument();
	});

	test("a demo row keeps its Type and shows its date and time as text", async () => {
		renderDialog({ mode: { kind: "edit", row: row({ demo: true }) } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(group("Type")).toBeInTheDocument();
		const terms = screen
			.getAllByRole("term", hidden)
			.map((term) => [term.textContent, term.nextElementSibling?.textContent]);
		expect(terms).toEqual([
			["Date", "Mon, 19 Oct"],
			["Time", "10:15 pm"],
		]);
	});
});

// AC-F03-32
describe("an edit after a time zone change (BR-F03-11, D-238)", () => {
	// Golden #26 in America/Los_Angeles, where the golden clock reads 1 Nov, 11:30 pm.
	const ROW_26 = row({
		id: "0192f0c4-7a1e-7c3b-9d2a-000000000026",
		amountMinor: 42000,
		occurredOn: "2026-11-01",
		occurredAt: "2026-10-31T19:00:00.000Z",
		createdAt: "2026-10-31T19:00:00.000Z",
		updatedAt: "2026-10-31T19:00:00.000Z",
	});
	const LA: EntryLocale = { ...IN, timezone: "America/Los_Angeles" };

	test("row 26 shows 1 November and 12:00 pm; a new time alone keeps 2026-11-01", async () => {
		const sent = edits(
			({ body }) => ok({ ...ROW_26, ...(body as object), version: 2 }),
			`/api/transactions/${ROW_26.id}`,
		);
		const { user, onClose } = renderDialog({
			mode: { kind: "edit", row: ROW_26 },
			locale: LA,
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		expect(dateButton()).toHaveAccessibleName("Date Today, 1 Nov");
		expect(timePart("hour")).toHaveAttribute("aria-valuetext", "12 pm");
		expect(timePart("minute")).toHaveAttribute("aria-valuenow", "0");
		await user.click(timePart("hour"));
		await user.keyboard("11");
		await user.click(timePart("am/pm"));
		await user.keyboard("a");
		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(sent[0]!.body).toEqual({
			occurredAt: "2026-11-01T19:00:00Z",
			occurredOn: "2026-11-01",
		});
	});
});

// AC-F03-32 on Los Angeles's daylight-saving end, where 1:00 to 2:00 am happens twice.
describe("the repeated hour (D-221)", () => {
	test("a new Transaction at 1:30 am on 1 Nov in Los Angeles is saved at the earlier 1:30, in PDT", async () => {
		const sent = creates();
		const { user } = renderDialog({
			locale: { ...IN, timezone: "America/Los_Angeles" },
		});
		await screen.findByRole("heading", { name: "New Transaction" });
		// The golden clock is 11:30 pm on 1 Nov there.
		expect(dateButton()).toHaveAccessibleName("Date Today, 1 Nov");

		await fillValid(user);
		await user.click(timePart("hour"));
		await user.keyboard("1");
		await user.click(timePart("minute"));
		await user.keyboard("30");
		await user.click(timePart("am/pm"));
		await user.keyboard("a");
		await user.click(button("Save"));

		await waitFor(() => expect(sent).toHaveLength(1));
		expect(sent[0]!.body).toMatchObject({
			occurredOn: "2026-11-01",
			occurredAt: "2026-11-01T08:30:00Z",
		});
	});
});

describe("the edit calendar after a time zone change (D-555)", () => {
	test("enables the stored date a day before the row's window, and nothing earlier", async () => {
		// Recorded in Los Angeles on 19 Oct at 10 pm and dated 9 Oct, the first day of its window
		// there; read in Kolkata, the recording date is 20 Oct, so the window starts on 10 Oct.
		const moved = row({
			occurredOn: "2026-10-09",
			occurredAt: "2026-10-09T19:00:00.000Z",
			createdAt: "2026-10-20T05:00:00.000Z",
		});
		const { user } = renderDialog({ mode: { kind: "edit", row: moved } });
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });

		expect(
			await screen.findByRole("button", {
				name: /, 9 October 2026/,
				hidden: true,
			}),
		).not.toHaveAttribute("aria-disabled");
		expect(
			screen.getByRole("button", { name: /, 8 October 2026/, hidden: true }),
		).toHaveAttribute("aria-disabled", "true");
		expect(
			screen.getByRole("button", { name: /, 20 October 2026/, hidden: true }),
		).not.toHaveAttribute("aria-disabled");
		expect(
			screen.getByRole("button", { name: /, 21 October 2026/, hidden: true }),
		).toHaveAttribute("aria-disabled", "true");
	});
});

describe("the edit calendar after a move west (D-555)", () => {
	test("enables the stored date a day after the row's window", async () => {
		// Golden #26 in Los Angeles: stored on 1 Nov, its window there 21 Oct to 31 Oct.
		const shifted = row({
			occurredOn: "2026-11-01",
			occurredAt: "2026-10-31T19:00:00.000Z",
			createdAt: "2026-10-31T19:00:00.000Z",
		});
		const { user } = renderDialog({
			mode: { kind: "edit", row: shifted },
			locale: { ...IN, timezone: "America/Los_Angeles" },
		});
		await screen.findByRole("heading", { name: "Edit Transaction" });

		await user.click(dateButton());
		await screen.findByRole("dialog", { name: "Choose a date" });

		expect(
			await screen.findByRole("button", {
				name: /, 1 November 2026/,
				hidden: true,
			}),
		).not.toHaveAttribute("aria-disabled");
	});
});

describe("duplicating a row (BR-F03-28)", () => {
	test("opens as Duplicate Transaction with the row's values, dated now", async () => {
		renderDialog({
			mode: {
				kind: "duplicate",
				row: row({ description: "Dinner", note: "Team" }),
			},
		});

		expect(
			await screen.findByRole("heading", { name: "Duplicate Transaction" }),
		).toBeInTheDocument();
		expect(amount()).toHaveValue("640.00");
		expect(payee()).toHaveValue("Swiggy");
		expect(radio("Food")).toBeChecked();
		expect(dateButton()).toHaveAccessibleName("Date Today, 2 Nov");
		expect(timePart("hour")).toHaveAttribute("aria-valuetext", "12 pm");
		expect(textbox("Description")).toHaveValue("Dinner");
		expect(textbox("Note")).toHaveValue("Team");
		expect(button("Save and add another")).toBeInTheDocument();
		expect(described(dateButton())).toBe("Today or one of the 10 days before.");
	});

	test("Save creates a new manual row with a new id, even from a charge", async () => {
		const sent = creates();
		const charge = row({
			source: "subscription",
			demo: true,
			dueOn: "2026-10-19",
		});
		const { user, onCreated, onClose } = renderDialog({
			mode: { kind: "duplicate", row: charge },
		});
		await screen.findByRole("heading", { name: "Duplicate Transaction" });

		await user.click(button("Save"));

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		const body = sent[0]!.body as Record<string, unknown>;
		expect(body).toMatchObject({
			type: "expense",
			amountMinor: 64000,
			payee: "Swiggy",
			category: "food",
			occurredOn: "2026-11-02",
			occurredAt: "2026-11-02T06:30:00Z",
		});
		expect(body["id"]).not.toBe(charge.id);
		expect(isUuidV7(body["id"] as string)).toBe(true);
		expect(body).not.toHaveProperty("source");
		expect(body).not.toHaveProperty("demo");
		expect(onCreated).toHaveBeenCalledWith(expect.anything(), "save");
	});

	test("Escape with the copy untouched closes without asking", async () => {
		const { user, onClose } = renderDialog({
			mode: { kind: "duplicate", row: ROW_24 },
		});
		await waitFor(() => expect(amount()).toHaveFocus());

		await user.keyboard("{Escape}");

		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});

	test("Save and add another goes on as a New Transaction", async () => {
		creates();
		const { user } = renderDialog({ mode: { kind: "duplicate", row: ROW_24 } });
		await screen.findByRole("heading", { name: "Duplicate Transaction" });

		await user.click(button("Save and add another"));

		expect(
			await screen.findByRole("heading", { name: "New Transaction" }),
		).toBeInTheDocument();
		expect(amount()).toHaveValue("");
		expect(payee()).toHaveValue("");
	});
});
