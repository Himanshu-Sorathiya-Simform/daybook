import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import {
	GOLDEN_BLOCK,
	meFor,
	renderInApp,
} from "@/components/app/__tests__/helpers";
import { isUuidV7 } from "@/lib/ids";
import type { PayeeItem, PayeesAnswer } from "@/lib/transactions/answers";
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import {
	charge,
	listPage,
	subscriptionAnswer,
	subscriptionItem,
	subscriptionList,
} from "../../lib/__tests__/fixtures";
import type { SubscriptionItem, SubscriptionsLocale } from "../../lib/types";
import {
	SubscriptionDialog,
	type SubscriptionDialogProps,
} from "../SubscriptionDialog";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

/** The golden profile at the golden clock: 2 November 2026 in `en-IN`. */
const IN: SubscriptionsLocale = {
	currency: "INR",
	numberLocale: "en-IN",
	dateLocale: "en-IN",
	today: "2026-11-02",
	timezone: "Asia/Kolkata",
	weekStart: "monday",
};
const ITEMS = subscriptionList().items;
const NETFLIX = subscriptionItem("netflix");
const SUNRISE = subscriptionItem("sunrise");

const payee = (
	name: string,
	count: number,
	amountMinor: number,
	category: PayeeItem["lastCategory"] = "entertainment",
): PayeeItem => ({
	payee: name,
	count,
	lastUsedOn: "2026-10-05",
	lastType: "expense",
	lastCategory: category,
	lastExpense: { amountMinor, category },
});

const PAYEES: PayeesAnswer = {
	items: [
		payee("Netflix", 3, 64900),
		payee("Hulu", 1, 39900, "entertainment"),
		payee("Rent", 5, 1800000, "housing"),
		{ ...payee("Employer", 2, 0), lastType: "income", lastExpense: null },
	],
	currency: "INR",
};

const paid = (item: SubscriptionItem, dueOn: string, edited = false) =>
	charge({
		subscriptionId: item.id,
		dueOn,
		occurredOn: dueOn,
		amountMinor: item.amountMinor,
		edited,
	});

type Setup = {
	charges?: ReturnType<typeof charge>[] | "fail";
	duplicates?: ReturnType<typeof charge>[];
	payees?: PayeesAnswer;
};

/** The reads the dialog makes: the payees, a Subscription's charges and an Add's duplicates. */
function reads({ charges = [], duplicates = [], payees = PAYEES }: Setup = {}) {
	route(network, "get", "/api/me", () => ok(meFor("u1", GOLDEN_BLOCK)));
	route(network, "get", "/api/payees", () => ok(payees));
	return route(network, "get", "/api/transactions", ({ path }) => {
		if (path.includes("q=")) return ok(listPage(duplicates));
		return charges === "fail" ?
				refuse(500, "internal_error")
			:	ok(listPage(charges));
	});
}

function renderDialog(
	item: SubscriptionItem | null,
	props: Partial<SubscriptionDialogProps> = {},
	setup: Setup = {},
) {
	const calls = reads(setup);
	const handlers = { onClose: vi.fn(), onSaved: vi.fn() };
	const element = (extra: Partial<SubscriptionDialogProps> = {}) => (
		<SubscriptionDialog
			isOpen
			item={item}
			items={ITEMS}
			locale={IN}
			{...handlers}
			{...props}
			{...extra}
		/>
	);
	const view = renderInApp(element());
	return {
		...view,
		...handlers,
		calls,
		again: (extra: Partial<SubscriptionDialogProps>) =>
			view.rerender(
				<AppProviders
					navigate={vi.fn()}
					queryClient={view.queryClient}
				>
					{element(extra)}
				</AppProviders>,
			),
		user: userEvent.setup(),
	};
}

/** An Add with its payee list closed: focused while empty it opens, as the Transaction field's
 * does, and while it is open React Aria hides the rest of the dialog from the tree. */
async function openAdd(
	item: SubscriptionItem | null = null,
	props: Partial<SubscriptionDialogProps> = {},
	setup: Setup = {},
) {
	const view = renderDialog(item, props, setup);
	// The list opens once the payees have loaded; Escape before that would reach the dialog.
	await screen.findAllByRole("option", {}, { timeout: 4000 });
	await view.user.keyboard("{Escape}");
	await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
	return view;
}

const dialog = () => screen.getByRole("dialog");
const nameBox = () => screen.getByRole("combobox", { name: "Name" });
const textName = () => screen.getByRole("textbox", { name: "Name" });
const amountBox = () => screen.getByRole("textbox", { name: "Amount" });
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const tile = (name: string | RegExp) => screen.getByRole("radio", { name });
const addButton = () => button("Add Subscription");
const saveButton = () => button("Save changes");

type User = ReturnType<typeof userEvent.setup>;

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

/** Picks a day of the Started on calendar by its date. The calendar names a day with its weekday
 * and the profile's date order, "Sunday, November 1, 2026" by default. */
async function pickStart(user: User, date: string) {
	const [year, month, day] = date.split("-").map(Number) as [
		number,
		number,
		number,
	];
	const name = MONTHS[month - 1];
	await user.click(button(/^Started on/));
	await user.click(
		await screen.findByRole("button", {
			name: new RegExp(`(${name} ${day}, ${year}|${day} ${name} ${year})`),
		}),
	);
}

/** Closes the payee list that focusing the Name opens, such as a refused Save does. */
async function closeList(user: User) {
	await screen.findByRole("listbox", {}, { timeout: 4000 });
	await user.keyboard("{Escape}");
	await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

/** Fills an Add: name, amount and a category tile. */
async function fillAdd(user: User, name = "Hulu", amount = "399") {
	await user.type(nameBox(), name);
	// Moving on closes the payee list that matching names open.
	await user.tab();
	await user.type(amountBox(), amount);
	await user.click(tile("Entertainment"));
}

const CREATED = (over: Record<string, unknown> = {}) => ({
	...subscriptionAnswer("netflix", {
		name: "Hulu",
		id: "0192f1a0-0000-7000-8000-0000000000aa",
	}),
	chargesCreated: 0,
	...over,
});

describe("Add a Subscription (BR-F05-24)", () => {
	test("is a dialog named Add a Subscription with its fields in order", () => {
		renderDialog(null);
		expect(dialog()).toHaveAccessibleName("Add a Subscription");
		const text = dialog().textContent ?? "";
		const order = ["Name", "Amount", "How often", "Category", "Started on"].map(
			(label) => text.indexOf(label),
		);
		expect(order.every((at) => at >= 0)).toBe(true);
		expect(order).toEqual([...order].sort((a, b) => a - b));
		expect(addButton()).toBeVisible();
		expect(button("Cancel")).toBeVisible();
	});

	test("focuses the Name when it opens", () => {
		renderDialog(null);
		expect(nameBox()).toHaveFocus();
	});

	// AC-F05-44
	test("opens monthly, with no category and today as the start", () => {
		renderDialog(null);
		expect(
			screen.getByRole("radio", { checked: true, name: "Monthly" }),
		).toBeVisible();
		for (const radio of within(
			screen.getByRole("radiogroup", { name: "Category" }),
		).getAllByRole("radio")) {
			expect(radio).not.toBeChecked();
		}
		expect(button(/^Started on/)).toHaveTextContent("Mon, 2 Nov");
	});

	test("Started on says what the date is for", () => {
		renderDialog(null);
		expect(
			screen.getByText(
				"The date of the first charge. Daybook repeats from this date.",
			),
		).toBeVisible();
	});

	test("has the payee list, no past-charges choice and no What changes", () => {
		renderDialog(null);
		expect(screen.queryByRole("region", { name: "What changes" })).toBeNull();
		expect(
			screen.queryByRole("radiogroup", {
				name: /Add the charges from before/,
			}),
		).toBeNull();
	});

	test("the note is behind Add a note", async () => {
		const { user } = await openAdd(null);
		expect(screen.queryByRole("textbox", { name: /Note/ })).toBeNull();
		await user.click(button("Add a note"));
		expect(screen.getByRole("textbox", { name: /Note/ })).toBeVisible();
		// The note takes focus, not the Name with its payee list.
		expect(screen.getByRole("textbox", { name: /Note/ })).toHaveFocus();
		expect(screen.queryByRole("listbox")).toBeNull();
		expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	});
});

describe("the Name's payees (BR-F05-24, D-451)", () => {
	// AC-F05-44
	test("lists Payees you've paid that have an expense, and not one with only income", async () => {
		const { user } = renderDialog(null);
		await user.click(nameBox());
		const options = await screen.findAllByRole("option");
		expect(options.map((option) => option.textContent)).toEqual([
			expect.stringContaining("Netflix"),
			expect.stringContaining("Hulu"),
			expect.stringContaining("Rent"),
		]);
		expect(screen.queryByRole("option", { name: /Employer/ })).toBeNull();
	});

	// AC-F05-44
	test("choosing one fills the category and amount of its last expense, with the hint", async () => {
		const { user } = renderDialog(null);
		await user.click(nameBox());
		await user.click(await screen.findByRole("option", { name: /Rent/ }));
		expect(nameBox()).toHaveValue("Rent");
		expect(amountBox()).toHaveValue("18,000.00");
		expect(tile("Housing")).toBeChecked();
		expect(
			screen.getByText(
				"Filled from your last Rent expense: Housing, ₹18,000.00.",
			),
		).toBeVisible();
	});

	// AC-F05-44
	test("the hint goes once the amount changes", async () => {
		const { user } = renderDialog(null);
		await user.click(nameBox());
		await user.click(await screen.findByRole("option", { name: /Netflix/ }));
		expect(
			screen.getByText(/^Filled from your last Netflix expense/),
		).toBeVisible();
		await user.type(amountBox(), "1");
		expect(screen.queryByText(/^Filled from your last/)).toBeNull();
	});

	test("the hint goes once the category changes", async () => {
		const { user } = renderDialog(null);
		await user.click(nameBox());
		await user.click(await screen.findByRole("option", { name: /Netflix/ }));
		await user.click(tile("Shopping"));
		expect(screen.queryByText(/^Filled from your last/)).toBeNull();
	});

	test("the hint goes once the name changes", async () => {
		const { user } = renderDialog(null);
		await user.click(nameBox());
		await user.click(await screen.findByRole("option", { name: /Netflix/ }));
		await user.type(nameBox(), "x");
		expect(screen.queryByText(/^Filled from your last/)).toBeNull();
	});

	test("a name typed that is no payee is kept, with no new-payee entry", async () => {
		const { user } = renderDialog(null);
		await user.type(nameBox(), "Gym");
		expect(nameBox()).toHaveValue("Gym");
		expect(screen.queryByText(/as a new payee/)).toBeNull();
	});
});

describe("the messages (BR-F05-24, section 8)", () => {
	// AC-F05-44
	test("Add with nothing filled says what is missing, sends nothing and focuses the name", async () => {
		const posts = route(network, "post", "/api/subscriptions", () => ok({}));
		const { user } = await openAdd(null);
		await user.click(addButton());
		expect(
			screen.getByText("Enter a name, like Netflix or Rent."),
		).toBeVisible();
		expect(screen.getByText("Enter an amount.")).toBeVisible();
		expect(screen.getByText("Choose a category.")).toBeVisible();
		await waitFor(() => expect(nameBox()).toHaveFocus());
		expect(posts).toHaveLength(0);
	});

	test("messages show only after the first Save, then follow the fields", async () => {
		const { user } = await openAdd(null);
		expect(screen.queryByText("Enter an amount.")).toBeNull();
		await user.click(addButton());
		await closeList(user);
		await user.type(amountBox(), "0");
		expect(screen.getByText("Enter an amount above zero.")).toBeVisible();
		await user.click(tile("Entertainment"));
		expect(screen.queryByText("Choose a category.")).toBeNull();
	});

	test("the first invalid field is focused: the amount when the name is fine", async () => {
		const { user } = await openAdd(null);
		await user.type(nameBox(), "Hulu");
		await user.tab();
		await user.click(tile("Entertainment"));
		await user.click(addButton());
		await waitFor(() => expect(amountBox()).toHaveFocus());
	});

	test("a name over 60 characters is too long", async () => {
		const { user } = await openAdd(null);
		await user.click(addButton());
		await user.click(nameBox());
		await user.paste("n".repeat(61));
		expect(screen.getByText("Use 60 characters or fewer.")).toBeVisible();
	});

	test("a custom number out of range replaces the hint with its message", async () => {
		const { user } = await openAdd(null);
		await user.click(tile("Custom"));
		expect(
			screen.getByText("Every 2 months, every 6 months, every 2 weeks…"),
		).toBeVisible();
		await user.click(addButton());
		await closeList(user);
		const every = screen.getByRole("textbox", { name: "Every" });
		await user.clear(every);
		await user.type(every, "0");
		expect(
			screen.getByText("Enter how many months, from 1 to 24."),
		).toBeVisible();
		expect(
			screen.queryByText("Every 2 months, every 6 months, every 2 weeks…"),
		).toBeNull();
	});

	test("a custom number in weeks says weeks, from 1 to 52", async () => {
		const { user } = await openAdd(null);
		await user.click(tile("Custom"));
		await user.click(addButton());
		await closeList(user);
		await user.click(screen.getByRole("button", { name: /Unit/ }));
		await user.click(screen.getByRole("option", { name: "weeks" }));
		const every = screen.getByRole("textbox", { name: "Every" });
		await user.clear(every);
		await user.type(every, "53");
		expect(
			screen.getByText("Enter how many weeks, from 1 to 52."),
		).toBeVisible();
	});
});

describe("the schedule line and the past charges (BR-F05-24, BR-F05-04)", () => {
	test("the schedule line follows the fields once the amount is valid", async () => {
		const { user } = await openAdd(null);
		expect(screen.getByText("Every month on the 2nd")).toBeVisible();
		await user.type(amountBox(), "649");
		expect(
			screen.getByText("Every month on the 2nd · ₹7,788.00 a year"),
		).toBeVisible();
		expect(
			screen.getByText(/^Next charges: Mon, 2 Nov, Wed, 2 Dec, /),
		).toBeVisible();
	});

	test("a yearly Subscription also shows its monthly equivalent", async () => {
		const { user } = await openAdd(null);
		await user.type(amountBox(), "1499");
		await user.click(tile("Yearly"));
		expect(
			screen.getByText(
				"Every year on 2 Nov · ₹1,499.00 a year · ≈ ₹124.92 a month",
			),
		).toBeVisible();
	});

	test("a custom number out of range hides the line", async () => {
		const { user } = await openAdd(null);
		await user.click(tile("Custom"));
		const every = screen.getByRole("textbox", { name: "Every" });
		await user.clear(every);
		await user.type(every, "0");
		expect(screen.queryByText(/^Every 0/)).toBeNull();
		expect(screen.queryByText(/^Next charges/)).toBeNull();
	});

	// AC-F05-44
	test("a start in the past offers the charges from before, No chosen", async () => {
		const { user } = await openAdd(null);
		await user.type(nameBox(), "Netflix");
		await user.tab();
		await user.type(amountBox(), "649");
		await pickStart(user, "2026-11-01");
		expect(
			await screen.findByRole("radiogroup", {
				name: "Netflix started 1 day before today. Add the charges from before?",
			}),
		).toBeVisible();
		expect(
			within(
				screen.getByRole("radiogroup", {
					name: /Add the charges from before/,
				}),
			).getByRole("radio", { checked: true }),
		).toHaveAccessibleName(/^No, start with the next one/);
		expect(
			screen.getByRole("radio", { name: /^Yes, add 1 past charge, ₹649\.00/ }),
		).toBeVisible();
	});

	test("a start today or later offers nothing from before", () => {
		renderDialog(null);
		expect(
			screen.queryByRole("radiogroup", {
				name: /Add the charges from before/,
			}),
		).toBeNull();
	});

	test("the duplicate note names expenses of the same name in that period", async () => {
		const { user } = await openAdd(
			null,
			{},
			{
				duplicates: [
					charge({
						payee: "Netflix",
						occurredOn: "2026-11-01",
						dueOn: null,
						source: "manual",
					}),
				],
			},
		);
		await user.type(nameBox(), "Netflix");
		await user.tab();
		await pickStart(user, "2026-11-01");
		expect(
			await screen.findByText(
				"You already have 1 Netflix expense in that period, on 1 Nov. Adding past charges would count it twice.",
			),
		).toBeVisible();
	});

	test("a name under 3 characters reads no duplicates", async () => {
		const { user, calls } = await openAdd(null);
		await user.type(nameBox(), "TV");
		await pickStart(user, "2026-11-01");
		await screen.findByRole("radiogroup", {
			name: /Add the charges from before/,
		});
		expect(calls.some((call) => call.path.includes("q="))).toBe(false);
	});
});

describe("saving an Add (section 11)", () => {
	// AC-F05-44
	test("sends a create with a new id and key, then reports it and closes", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onSaved, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(posts).toHaveLength(1);
		const [post] = posts;
		expect(post?.body).toMatchObject({
			name: "Hulu",
			amountMinor: 39900,
			currency: "INR",
			cadence: { unit: "month", every: 1 },
			startDate: "2026-11-02",
			category: "entertainment",
			note: "",
			backfill: false,
		});
		const body = post?.body as { id: string; createdAt: string };
		expect(isUuidV7(body.id)).toBe(true);
		expect(Number.isNaN(Date.parse(body.createdAt))).toBe(false);
		expect(isUuidV7(post?.headers.get("idempotency-key") ?? "")).toBe(true);
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ id: "0192f1a0-0000-7000-8000-0000000000aa" }),
		);
	});

	test("submitting the form saves it, as the Save button does", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		fireEvent.submit(screen.getByRole("form"));
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(posts).toHaveLength(1);
	});

	test("a note is sent with it", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(button("Add a note"));
		await user.type(
			screen.getByRole("textbox", { name: /Note/ }),
			"Family plan",
		);
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({ note: "Family plan" });
	});

	test("the amount is read in the user's own format", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user, "Rent", "1,23,456.50");
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({ amountMinor: 12345650 });
	});

	test("a custom cadence is sent as its number and unit", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(tile("Custom"));
		const every = screen.getByRole("textbox", { name: "Every" });
		await user.clear(every);
		await user.type(every, "7");
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({
			cadence: { unit: "month", every: 7 },
		});
	});

	test("a custom cadence equal to a preset is sent as that preset's cadence", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(tile("Custom"));
		const every = screen.getByRole("textbox", { name: "Every" });
		await user.clear(every);
		await user.type(every, "3");
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({
			cadence: { unit: "month", every: 3 },
		});
	});

	// AC-F05-44
	test("with the past charges chosen the create asks for them", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED({ chargesCreated: 1 }), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await pickStart(user, "2026-11-01");
		await user.click(
			await screen.findByRole("radio", { name: /^Yes, add 1 past charge/ }),
		);
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({
			startDate: "2026-11-01",
			backfill: true,
		});
	});

	// AC-F05-44
	test("with the default No it does not", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await pickStart(user, "2026-11-01");
		await screen.findByRole("radiogroup", {
			name: /Add the charges from before/,
		});
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({ backfill: false });
	});

	test("a Yes left from a start that was moved to today is not sent", async () => {
		const posts = route(network, "post", "/api/subscriptions", () =>
			ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await pickStart(user, "2026-11-01");
		await user.click(await screen.findByRole("radio", { name: /^Yes, add/ }));
		await pickStart(user, "2026-11-02");
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts[0]?.body).toMatchObject({ backfill: false });
	});

	// AC-F05-44
	test("two presses send one request", async () => {
		const posts = route(network, "post", "/api/subscriptions", async () => {
			await delay(60);
			return ok(CREATED(), 201);
		});
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.dblClick(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts).toHaveLength(1);
	});

	test("while it is out the buttons rest and Escape waits", async () => {
		route(network, "post", "/api/subscriptions", async () => {
			await delay(120);
			return ok(CREATED(), 201);
		});
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		expect(button("Cancel")).toHaveAttribute("aria-disabled", "true");
		await user.keyboard("{Escape}");
		expect(onClose).not.toHaveBeenCalled();
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});
});

describe("a refused Add keeps the dialog open (section 8)", () => {
	// AC-F05-44
	test("a 422 puts its message under the field and focuses it", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(422, "validation_failed", {
				message: "Check the form.",
				fields: { name: "Use 60 characters or fewer." },
			}),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		expect(await screen.findByText("Use 60 characters or fewer.")).toBeVisible();
		await waitFor(() => expect(nameBox()).toHaveFocus());
		expect(onClose).not.toHaveBeenCalled();
		expect(nameBox()).toHaveValue("Hulu");
	});

	test("the message goes when the field changes", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { name: "Use 60 characters or fewer." },
			}),
		);
		const { user } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		await screen.findByText("Use 60 characters or fewer.");
		await user.type(nameBox(), "x");
		expect(screen.queryByText("Use 60 characters or fewer.")).toBeNull();
	});

	test("a message for a field the dialog has no box for is its own line", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: {
					createdAt:
						"This change is too old to apply. Discard it and make it again.",
				},
			}),
		);
		const { user } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		expect(
			await screen.findByText(
				"This change is too old to apply. Discard it and make it again.",
			),
		).toBeVisible();
	});

	// AC-F05-44
	test("a failed request says it could not be saved, and keeps the values", async () => {
		route(network, "post", "/api/subscriptions", () =>
			refuse(500, "internal_error"),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		expect(
			await screen.findByText(
				"The Subscription could not be saved. Check your connection and try again. Your changes are still here.",
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		expect(amountBox()).toHaveValue("399.00");
		expect(tile("Entertainment")).toBeChecked();
	});

	test("Save can be pressed again after a refusal", async () => {
		let at = 0;
		const posts = route(network, "post", "/api/subscriptions", () =>
			++at === 1 ? refuse(500, "internal_error") : ok(CREATED(), 201),
		);
		const { user, onClose } = await openAdd(null);
		await fillAdd(user);
		await user.click(addButton());
		await screen.findByText(/could not be saved/);
		await user.click(addButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(posts).toHaveLength(2);
		// A new key for the new press, the same id for the same Subscription.
		expect(posts[0]?.headers.get("idempotency-key")).not.toBe(
			posts[1]?.headers.get("idempotency-key"),
		);
		expect((posts[0]?.body as { id: string }).id).toBe(
			(posts[1]?.body as { id: string }).id,
		);
	});
});

describe("offline, before M5 (section 10)", () => {
	// AC-F05-44
	test("says so, disables Save and sends nothing", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const posts = route(network, "post", "/api/subscriptions", () => ok({}));
		const { user } = await openAdd(null);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(screen.getByText("You are offline. Connect to save.")).toBeVisible();
		await user.type(nameBox(), "Hulu");
		await user.type(nameBox(), "{Enter}");
		expect(addButton()).toHaveAttribute("aria-disabled", "true");
		expect(posts).toHaveLength(0);
	});

	test("online it shows no such note", () => {
		renderDialog(null);
		expect(screen.queryByText("You are offline. Connect to save.")).toBeNull();
	});
});

describe("closing", () => {
	test("Cancel closes without a write", async () => {
		const posts = route(network, "post", "/api/subscriptions", () => ok({}));
		const { user, onClose } = await openAdd(null);
		await user.click(button("Cancel"));
		expect(onClose).toHaveBeenCalledOnce();
		expect(posts).toHaveLength(0);
	});

	test("Escape closes it", async () => {
		const { user, onClose } = await openAdd(null);
		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("a closed dialog shows nothing", () => {
		renderDialog(null, { isOpen: false });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});

describe("Edit (BR-F05-24)", () => {
	// AC-F05-45
	test("is named Edit Netflix and holds its values, the name as plain text", async () => {
		renderDialog(
			NETFLIX,
			{},
			{ charges: [paid(NETFLIX, "2026-09-05"), paid(NETFLIX, "2026-10-05")] },
		);
		expect(dialog()).toHaveAccessibleName("Edit Netflix");
		expect(textName()).toHaveValue("Netflix");
		expect(screen.queryByRole("combobox", { name: "Name" })).toBeNull();
		expect(amountBox()).toHaveValue("649.00");
		expect(
			screen.getByRole("radio", { checked: true, name: "Monthly" }),
		).toBeVisible();
		expect(tile("Entertainment")).toBeChecked();
		expect(button(/^Started on/)).toHaveTextContent("Sat, 5 Sept");
		expect(saveButton()).toBeVisible();
		await waitFor(() =>
			expect(saveButton()).not.toHaveAttribute("aria-disabled", "true"),
		);
	});

	test("shows its schedule line with the next charges after today", async () => {
		renderDialog(
			NETFLIX,
			{},
			{ charges: [paid(NETFLIX, "2026-09-05"), paid(NETFLIX, "2026-10-05")] },
		);
		expect(
			await screen.findByText("Every month on the 5th · ₹7,788.00 a year"),
		).toBeVisible();
		expect(
			screen.getByText(/^Next charges: Thu, 5 Nov, Sat, 5 Dec/),
		).toBeVisible();
	});

	test("has no past-charges choice, whatever its start", () => {
		renderDialog(NETFLIX);
		expect(
			screen.queryByRole("radiogroup", {
				name: /Add the charges from before/,
			}),
		).toBeNull();
	});

	test("with a note it opens with the note shown", () => {
		renderDialog(subscriptionItem("netflix", { note: "Family plan" }));
		expect(screen.getByRole("textbox", { name: /Note/ })).toHaveValue(
			"Family plan",
		);
		expect(screen.queryByRole("button", { name: "Add a note" })).toBeNull();
	});

	// AC-F05-45
	test("Save rests until the charges have loaded", async () => {
		route(network, "get", "/api/me", () => ok(meFor("u1", GOLDEN_BLOCK)));
		route(network, "get", "/api/payees", () => ok(PAYEES));
		route(network, "get", "/api/transactions", async () => {
			await delay(80);
			return ok(listPage([]));
		});
		renderInApp(
			<SubscriptionDialog
				isOpen
				item={NETFLIX}
				items={ITEMS}
				locale={IN}
				onClose={vi.fn()}
			/>,
		);
		expect(saveButton()).toHaveAttribute("aria-disabled", "true");
		await waitFor(() =>
			expect(saveButton()).not.toHaveAttribute("aria-disabled", "true"),
		);
	});

	// AC-F05-45
	test("failed charges say so with Retry, and Save stays resting until they load", async () => {
		let failing = true;
		route(network, "get", "/api/me", () => ok(meFor("u1", GOLDEN_BLOCK)));
		route(network, "get", "/api/payees", () => ok(PAYEES));
		route(network, "get", "/api/transactions", () =>
			failing ? refuse(500, "internal_error") : ok(listPage([])),
		);
		const user = userEvent.setup();
		renderInApp(
			<SubscriptionDialog
				isOpen
				item={NETFLIX}
				items={ITEMS}
				locale={IN}
				onClose={vi.fn()}
			/>,
		);
		expect(
			await screen.findByText("Charges could not be loaded."),
		).toBeVisible();
		expect(saveButton()).toHaveAttribute("aria-disabled", "true");
		failing = false;
		await user.click(button("Retry"));
		await waitFor(() =>
			expect(saveButton()).not.toHaveAttribute("aria-disabled", "true"),
		);
		expect(screen.queryByText("Charges could not be loaded.")).toBeNull();
	});
});

describe("saving an Edit (BR-F05-46, section 11)", () => {
	const CHARGES = [paid(NETFLIX, "2026-09-05"), paid(NETFLIX, "2026-10-05")];
	const CHANGED = (over: Record<string, unknown> = {}) => ({
		...subscriptionAnswer("netflix", { version: NETFLIX.version + 1 }),
		changeDate: "2026-11-02",
		chargesCreated: 0,
		chargesUpdated: 0,
		chargesDeleted: 0,
		months: [],
		...over,
	});
	const patchPath = `/api/subscriptions/${NETFLIX.id}`;

	/** Waits for the charges, since Save rests until they have loaded. */
	const ready = () =>
		waitFor(() =>
			expect(saveButton()).not.toHaveAttribute("aria-disabled", "true"),
		);

	// AC-F05-45
	test("with nothing changed Save only closes, and sends nothing", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.click(saveButton());
		expect(onClose).toHaveBeenCalledOnce();
		expect(patches).toHaveLength(0);
	});

	// AC-F05-45
	test("a price change shows Was, What changes and sends the amount with its currency at the version", async () => {
		const patches = route(network, "patch", patchPath, () =>
			ok(CHANGED({ chargesUpdated: 1 })),
		);
		const { user, onClose, onSaved } = renderDialog(
			NETFLIX,
			{},
			{ charges: CHARGES },
		);
		await ready();
		await user.clear(amountBox());
		await user.type(amountBox(), "799");
		expect(screen.getByText("Was ₹649.00")).toBeVisible();
		const section = screen.getByRole("region", { name: "What changes" });
		expect(
			within(section).getByText(
				"Charges up to today keep their amount. Later ones use the new amount.",
			),
		).toBeVisible();
		expect(
			within(section).getByRole("list", { name: "Charges around today" }),
		).toBeVisible();
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
		expect(patches[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
		expect(isUuidV7(patches[0]?.headers.get("idempotency-key") ?? "")).toBe(
			true,
		);
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			amountMinor: 79900,
			currency: "INR",
		});
		expect(onSaved).toHaveBeenCalledWith(
			expect.objectContaining({ version: NETFLIX.version + 1 }),
		);
	});

	test("shows the cost line for a price change", async () => {
		const { user } = renderDialog(
			SUNRISE,
			{},
			{ charges: [paid(SUNRISE, "2026-11-01")] },
		);
		await waitFor(() =>
			expect(saveButton()).not.toHaveAttribute("aria-disabled", "true"),
		);
		await user.clear(amountBox());
		await user.type(amountBox(), "19500");
		expect(
			screen.getByText(
				"Monthly cost ₹20,273.92 → ₹21,773.92 · Yearly ₹2,43,287.00 → ₹2,61,287.00",
			),
		).toBeVisible();
	});

	// AC-F05-45
	test("a note-only change says so and shows no What changes", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.click(button("Add a note"));
		await user.type(
			screen.getByRole("textbox", { name: /Note/ }),
			"Family plan",
		);
		expect(
			screen.getByText("Only the note changes. Charges stay as they are."),
		).toBeVisible();
		expect(screen.queryByRole("region", { name: "What changes" })).toBeNull();
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			note: "Family plan",
		});
	});

	// AC-F05-45
	test("a name change offers the past charges, and ticking it asks for them", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.clear(textName());
		await user.type(textName(), "Netflix Premium");
		expect(screen.getByText("Was Netflix")).toBeVisible();
		const also = screen.getByRole("checkbox", {
			name: /Also change the 2 past charges/,
		});
		expect(also).not.toBeChecked();
		await user.click(also);
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			name: "Netflix Premium",
			alsoPastCharges: true,
		});
	});

	test("without ticking it the write does not ask for past charges", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.clear(textName());
		await user.type(textName(), "Netflix Premium");
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).not.toHaveProperty("alsoPastCharges");
	});

	// AC-F05-45
	test("a schedule change that doubles a charge offers the skip, ticked, and sends it", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await pickStart(user, "2026-09-04");
		expect(
			screen.getByText(
				"Past charges stay as they are. The new schedule applies from tomorrow.",
			),
		).toBeVisible();
		const skip = screen.getByRole("checkbox", {
			name: /Skip 4 Nov, so it isn't charged twice/,
		});
		expect(skip).toBeChecked();
		expect(skip).toHaveAccessibleDescription(
			"5 Oct was already charged, less than one month before it. The first charge on the new date is 4 Dec.",
		);
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			startDate: "2026-09-04",
			skipDueOn: "2026-11-04",
		});
	});

	// AC-F05-45
	test("unticking the skip sends the change without it", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await pickStart(user, "2026-09-04");
		await user.click(screen.getByRole("checkbox", { name: /Skip 4 Nov/ }));
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			startDate: "2026-09-04",
		});
	});

	test("a start that has passed says nothing is charged until the next date", async () => {
		const { user } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await pickStart(user, "2026-09-20");
		expect(
			screen.getByText(
				"20 Oct has passed, so nothing is charged until Fri, 20 Nov.",
			),
		).toBeVisible();
	});

	test("a changed cadence shows Was and the moved date", async () => {
		const { user } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.click(tile("Weekly"));
		expect(screen.getByText("Was Monthly")).toBeVisible();
		const strip = screen.getByRole("list", { name: "Charges around today" });
		expect(within(strip).getByText("moves")).toBeVisible();
	});

	test("a custom cadence typed as the stored one changes nothing", async () => {
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.click(tile("Custom"));
		const every = screen.getByRole("textbox", { name: "Every" });
		await user.clear(every);
		await user.type(every, "1");
		expect(screen.queryByText(/^Was /)).toBeNull();
		await user.click(saveButton());
		expect(onClose).toHaveBeenCalledOnce();
	});

	test("an invalid field blocks Save with its message and shows no What changes", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await ready();
		await user.clear(amountBox());
		await user.type(amountBox(), "abc");
		expect(screen.queryByRole("region", { name: "What changes" })).toBeNull();
		await user.click(saveButton());
		expect(screen.getByText("Enter a number, like 1,240.50.")).toBeVisible();
		await waitFor(() => expect(amountBox()).toHaveFocus());
		expect(patches).toHaveLength(0);
	});

	test("the version is the one it opened with, whatever the page reads meanwhile", async () => {
		const patches = route(network, "patch", patchPath, () => ok(CHANGED()));
		const { user, onClose, again } = renderDialog(
			NETFLIX,
			{},
			{ charges: CHARGES },
		);
		await ready();
		again({
			item: subscriptionItem("netflix", { version: NETFLIX.version + 5 }),
		});
		await user.clear(amountBox());
		await user.type(amountBox(), "799");
		await user.click(saveButton());
		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(patches[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
	});
});

describe("a refused Edit keeps the dialog open (section 8)", () => {
	const CHARGES = [paid(NETFLIX, "2026-09-05"), paid(NETFLIX, "2026-10-05")];
	const patchPath = `/api/subscriptions/${NETFLIX.id}`;

	async function edit(user: User) {
		await waitFor(() =>
			expect(saveButton()).not.toHaveAttribute("aria-disabled", "true"),
		);
		await user.clear(amountBox());
		await user.type(amountBox(), "799");
		await user.click(saveButton());
	}

	test("a 422 puts its message under the field", async () => {
		route(network, "patch", patchPath, () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { amountMinor: "The largest amount is 99,99,99,99,999.99." },
			}),
		);
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await edit(user);
		expect(
			await screen.findByText("The largest amount is 99,99,99,99,999.99."),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	test("a failed request says it could not be saved", async () => {
		route(network, "patch", patchPath, () => refuse(500, "internal_error"));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await edit(user);
		expect(
			await screen.findByText(/^The Subscription could not be saved\./),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
		expect(amountBox()).toHaveValue("799.00");
	});

	// AC-F05-45
	test("a 404 says it was deleted on another device", async () => {
		route(network, "patch", patchPath, () =>
			refuse(404, "not_found", { message: "gone" }),
		);
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await edit(user);
		expect(
			await screen.findByText(
				"This Subscription was deleted on another device.",
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});

	// AC-F05-45
	test("a 409 says it changed on another device and keeps the dialog open", async () => {
		route(network, "patch", patchPath, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: {
					current: subscriptionAnswer("netflix", {
						version: NETFLIX.version + 1,
					}),
				},
			}),
		);
		route(network, "get", "/api/subscriptions", () => ok(subscriptionList()));
		const { user, onClose } = renderDialog(NETFLIX, {}, { charges: CHARGES });
		await edit(user);
		expect(
			await screen.findByText(
				/^This Subscription changed on another device\./,
			),
		).toBeVisible();
		expect(onClose).not.toHaveBeenCalled();
	});
});
