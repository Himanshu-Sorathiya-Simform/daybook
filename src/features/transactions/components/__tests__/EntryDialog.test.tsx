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
	function Harness() {
		const [isOpen, setOpen] = useState(true);
		return (
			<EntryDialog
				locale={IN}
				firstDayOfWeek="monday"
				onCreated={onCreated}
				{...props}
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
	return { ...view, onClose, onCreated, user: userEvent.setup() };
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
