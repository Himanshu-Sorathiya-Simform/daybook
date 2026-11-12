import { onlineManager } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { useState } from "react";
import { I18nProvider } from "react-aria-components";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import type { TransactionFilter } from "@/lib/transactions/url";
import { ok, route, type Seen } from "../../hooks/__tests__/helpers";
import type { FilterLocale } from "../../lib/filter-labels";
import { FilterSheet, type FilterSheetProps } from "../FilterSheet";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const IN: FilterLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

/** Check B's histogram (F03 section 5). */
const CHECK_B_HISTOGRAM = {
	edges: [
		31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000, 200000, 250000,
		315000,
	],
	counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
	currency: "INR",
};

const summary = (count: number) => ({
	count,
	incomeMinor: 0,
	spendingMinor: 0,
	toGoalsMinor: 0,
	firstOn: null,
	lastOn: null,
	currency: "INR",
});

/** The count the summary answers for a request: check B's 4, golden's 27 for all time, one
 * for income, and none for refunds. */
function countFor(request: Seen): number {
	const query = new URL(request.path, "http://x").searchParams;
	if (query.get("type") === "refund") return 0;
	if (query.get("type") === "income") return 1;
	if (query.get("cat") === "food" && query.get("from") === "2026-10-01") return 4;
	return 27;
}

function renderSheet(props: Partial<FilterSheetProps> = {}) {
	const summaries = route(network, "get", "/api/transactions/summary", (request) =>
		ok(summary(countFor(request))),
	);
	const histograms = route(
		network,
		"get",
		"/api/transactions/amount-histogram",
		() => ok(CHECK_B_HISTOGRAM),
	);
	const onApply = vi.fn();
	function Harness() {
		const [filter, setFilter] = useState<TransactionFilter>(props.filter ?? {});
		return (
			<FilterSheet
				activeCount={0}
				locale={IN}
				firstDayOfWeek="monday"
				{...props}
				filter={filter}
				onApply={(next) => {
					onApply(next);
					setFilter(next);
				}}
			/>
		);
	}
	// The app shell gives React Aria the profile's date locale (D-537).
	const view = renderInApp(
		<I18nProvider locale="en-IN">
			<Harness />
		</I18nProvider>,
	);
	return { ...view, summaries, histograms, onApply, user: userEvent.setup() };
}

const filters = (name: string | RegExp = /^Filters/) =>
	screen.getByRole("button", { name, hidden: true });
const open = async (user: ReturnType<typeof userEvent.setup>) => {
	await user.click(filters());
	return screen.findByRole("dialog", { name: "Filters" });
};
const chip = (group: string, name: string) =>
	within(
		screen.getByRole(
			group === "Date" || group === "Source" ? "radiogroup" : "toolbar",
			{ name: group },
		),
	).getByRole(group === "Date" || group === "Source" ? "radio" : "button", {
		name,
	});
const show = () => screen.getByRole("button", { name: /^(Show|No matches)/ });
/** Presses Show once the draft's count has answered, as Show waits for it. */
async function apply(user: ReturnType<typeof userEvent.setup>) {
	await waitFor(() => expect(show()).not.toHaveAttribute("data-pending"));
	await user.click(show());
}
const closed = () =>
	waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

describe("the Filters button (BR-F03-39)", () => {
	test("reads Filters with no active chips, in the usual outline", () => {
		renderSheet();

		expect(filters("Filters")).not.toHaveClass("border-accent");
	});

	test("reads Filters (2) with two active chips, marked active", () => {
		renderSheet({ activeCount: 2 });

		expect(filters("Filters (2)")).toHaveClass("border-accent");
	});

	test("asks for nothing until the sheet opens", async () => {
		const { summaries, histograms } = renderSheet();

		await new Promise((resolve) => setTimeout(resolve, 400));

		expect(summaries).toHaveLength(0);
		expect(histograms).toHaveLength(0);
	});
});

describe("the sheet", () => {
	test("is a dialog named Filters with the date presets, Type, Category, the amount and Source", async () => {
		const { user } = renderSheet();

		const sheet = await open(user);

		expect(
			within(within(sheet).getByRole("radiogroup", { name: "Date" }))
				.getAllByRole("radio")
				.map((each) => each.textContent),
		).toEqual([
			"All time",
			"This month",
			"Last month",
			"Last 3 months",
			"Year to date",
			"Last 12 months",
			"Custom range",
		]);
		expect(
			within(within(sheet).getByRole("toolbar", { name: "Type" }))
				.getAllByRole("button")
				.map((each) => each.textContent),
		).toEqual(["Expense", "Income", "Refund"]);
		expect(
			within(sheet).getByRole("toolbar", { name: "Category" }),
		).toBeInTheDocument();
		expect(
			within(sheet).getByRole("textbox", { name: "Min" }),
		).toBeInTheDocument();
		expect(
			within(within(sheet).getByRole("radiogroup", { name: "Source" }))
				.getAllByRole("radio")
				.map((each) => each.textContent),
		).toEqual(["Any source", "Added by you", "Subscription charges"]);
	});

	// AC-F03-61
	test("offers Custom range after the presets, with no fields until chosen", async () => {
		const { user } = renderSheet();

		const sheet = await open(user);

		expect(
			within(sheet).getByRole("radio", { name: "Custom range" }),
		).not.toBeChecked();
		expect(within(sheet).queryByRole("group", { name: "From" })).toBeNull();
	});

	test("lists every category, the expense ones first", async () => {
		const { user } = renderSheet();

		await open(user);
		const names = within(screen.getByRole("toolbar", { name: "Category" }))
			.getAllByRole("button")
			.map((each) => each.textContent);

		expect(names[0]).toBe("Food");
		expect(names).toContain("Salary");
		expect(names.indexOf("Salary")).toBeGreaterThan(names.indexOf("Food"));
	});

	test("starts from the committed filter", async () => {
		const { user } = renderSheet({
			filter: {
				from: "2026-10-01",
				to: "2026-10-31",
				cat: ["food"],
				src: "manual",
			},
		});

		await open(user);

		expect(chip("Date", "Last month")).toBeChecked();
		expect(chip("Category", "Food")).toHaveAttribute("aria-pressed", "true");
		expect(chip("Source", "Added by you")).toBeChecked();
	});

	test("a custom range from a link opens on Custom range, with its days in the fields", async () => {
		const { user } = renderSheet({
			filter: { from: "2026-10-05", to: "2026-10-20" },
		});

		await open(user);

		expect(chip("Date", "Custom range")).toBeChecked();
		expect(
			screen.getByRole("spinbutton", { name: "day, From" }),
		).toHaveAttribute("aria-valuenow", "5");
		expect(screen.getByRole("spinbutton", { name: "day, To" })).toHaveAttribute(
			"aria-valuenow",
			"20",
		);
	});

	test("asks for the histogram of the draft once open", async () => {
		const { user, histograms } = renderSheet();

		await open(user);

		await waitFor(() => expect(histograms).toHaveLength(1));
		expect(await screen.findAllByRole("slider")).toHaveLength(2);
	});
});

describe("Custom range on the phone (BR-F03-39, D-523)", () => {
	test("shows From, To and one month of the range calendar, keeping the draft's dates", async () => {
		const { user } = renderSheet({
			filter: { from: "2026-10-01", to: "2026-10-31" },
		});

		await open(user);
		await user.click(chip("Date", "Custom range"));

		expect(chip("Date", "Custom range")).toBeChecked();
		expect(screen.getByRole("group", { name: "From" })).toBeInTheDocument();
		expect(screen.getAllByRole("grid", { hidden: false })).toHaveLength(1);
		expect(
			screen.getByRole("spinbutton", { name: "day, From" }),
		).toHaveAttribute("aria-valuenow", "1");
	});

	// AC-F03-61
	test("a range chosen on the calendar sets the draft, which Show applies", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Date", "Custom range"));
		await user.click(
			screen.getByRole("button", { name: /(^|, )\w+, 2 November 2026\b/ }),
		);
		await user.click(
			screen.getByRole("button", { name: /(^|, )\w+, 1 November 2026\b/ }),
		);
		expect(onApply).not.toHaveBeenCalled();
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-11-01",
			to: "2026-11-02",
		});
	});

	test("From after To says so and leaves the draft's dates", async () => {
		const { user, onApply } = renderSheet({
			filter: { from: "2026-10-05", to: "2026-10-20" },
		});

		await open(user);
		await user.click(screen.getByRole("spinbutton", { name: "day, From" }));
		await user.keyboard("25");

		expect(
			await screen.findByText("Choose a From date on or before To."),
		).toBeInTheDocument();
		await apply(user);
		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-05",
			to: "2026-10-20",
		});
	});

	test("a preset after Custom range hides the fields and sets its dates", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Date", "Custom range"));
		await user.click(chip("Date", "This month"));

		expect(screen.queryByRole("group", { name: "From" })).toBeNull();
		await apply(user);
		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-11-01",
			to: "2026-11-30",
		});
	});

	test("opening the sheet again starts on the presets", async () => {
		const { user } = renderSheet();

		await open(user);
		await user.click(chip("Date", "Custom range"));
		await user.click(screen.getByRole("button", { name: "Close" }));
		await closed();
		await open(user);

		expect(chip("Date", "All time")).toBeChecked();
		expect(screen.queryByRole("group", { name: "From" })).toBeNull();
	});
});

describe("the draft and Show (BR-F03-39, D-523)", () => {
	// AC-F03-61
	test("Last month and Food read Show 4 Transactions, and the URL stays as it was", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Date", "Last month"));
		await user.click(chip("Category", "Food"));

		await waitFor(() => expect(show()).toHaveTextContent("Show 4 Transactions"));
		expect(onApply).not.toHaveBeenCalled();
	});

	// AC-F03-61
	test("Show applies the draft as one change and closes the sheet", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Date", "Last month"));
		await user.click(chip("Category", "Food"));
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-10-01",
			to: "2026-10-31",
			cat: ["food"],
		});
		await closed();
	});

	test("the draft's count is asked 300 ms after its last change, once", async () => {
		const { user, summaries } = renderSheet();

		await open(user);
		await waitFor(() => expect(summaries).toHaveLength(1));
		await user.click(chip("Date", "Last month"));
		await user.click(chip("Category", "Food"));
		await user.click(chip("Category", "Health"));
		await user.click(chip("Category", "Health"));
		await waitFor(() => expect(show()).toHaveTextContent("Show 4 Transactions"));

		expect(summaries).toHaveLength(2);
		expect(new URL(summaries[1]!.path, "http://x").search).toBe(
			"?from=2026-10-01&to=2026-10-31&cat=food&by=category,payee",
		);
	});

	test("reads Show Transactions while a changed draft waits for its count", async () => {
		const { user } = renderSheet();

		await open(user);
		await waitFor(() =>
			expect(show()).toHaveTextContent("Show 27 Transactions"),
		);
		await user.click(chip("Type", "Expense"));

		expect(show()).toHaveTextContent(/^Show Transactions$/);
	});

	// AC-F03-61
	test("a draft with no rows reads No matches", async () => {
		const { user } = renderSheet();

		await open(user);
		await user.click(chip("Type", "Refund"));

		await waitFor(() => expect(show()).toHaveTextContent(/^No matches$/));
	});

	test("one row reads Show 1 Transaction", async () => {
		const { user } = renderSheet();

		await open(user);
		await user.click(chip("Type", "Income"));

		await waitFor(() =>
			expect(show()).toHaveTextContent(/^Show 1 Transaction$/),
		);
	});

	test("offline it reads Show Transactions, with no count", async () => {
		const { user } = renderSheet();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		window.dispatchEvent(new Event("offline"));
		onlineManager.setOnline(false);

		await open(user);
		await new Promise((resolve) => setTimeout(resolve, 400));

		expect(show()).toHaveTextContent(/^Show Transactions$/);
	});

	test("while the count is on its way, Show spins and ignores a press", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Type", "Expense"));
		expect(show()).toHaveAttribute("data-pending", "true");
		expect(show()).toHaveTextContent(/^Show Transactions$/);
		await user.click(show());

		expect(onApply).not.toHaveBeenCalled();
		await waitFor(() => expect(show()).not.toHaveAttribute("data-pending"));
	});

	test("offline Show does not wait for a count and applies at once", async () => {
		const { user, onApply } = renderSheet();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
			onlineManager.setOnline(false);
		});

		await open(user);
		await user.click(chip("Type", "Expense"));
		expect(show()).not.toHaveAttribute("data-pending");
		await user.click(show());

		expect(onApply).toHaveBeenCalledExactlyOnceWith({ type: ["expense"] });
	});

	test("the draft's histogram is asked once its changes settle, not per tap", async () => {
		const { user, histograms } = renderSheet();

		await open(user);
		await waitFor(() => expect(histograms).toHaveLength(1));
		await user.click(chip("Type", "Expense"));
		await user.click(chip("Type", "Income"));
		await user.click(chip("Category", "Food"));
		await waitFor(() => expect(histograms).toHaveLength(2));
		await new Promise((resolve) => setTimeout(resolve, 400));

		expect(histograms).toHaveLength(2);
	});

	test("offline it shows no count it had before going offline", async () => {
		const { user } = renderSheet();
		await open(user);
		await waitFor(() =>
			expect(show()).toHaveTextContent("Show 27 Transactions"),
		);
		await user.click(screen.getByRole("button", { name: "Close" }));
		await closed();
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
			onlineManager.setOnline(false);
		});

		await open(user);

		expect(show()).toHaveTextContent(/^Show Transactions$/);
	});

	test("types and categories toggle on and off in the draft", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Type", "Expense"));
		await user.click(chip("Type", "Refund"));
		await user.click(chip("Type", "Expense"));
		await user.click(chip("Category", "Food"));
		await user.click(chip("Category", "Food"));
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({ type: ["refund"] });
	});

	test("All time and Any source drop the dates and the source", async () => {
		const { user, onApply } = renderSheet({
			filter: { from: "2026-10-01", to: "2026-10-31", src: "subscription" },
		});

		await open(user);
		await user.click(chip("Date", "All time"));
		await user.click(chip("Source", "Any source"));
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({});
	});

	test("a source and a preset join the draft", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Date", "This month"));
		await user.click(chip("Source", "Added by you"));
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			from: "2026-11-01",
			to: "2026-11-30",
			src: "manual",
		});
	});

	test("a quick range sets the draft's bounds", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(await screen.findByRole("radio", { name: "₹400 to ₹800" }));
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({
			minMinor: 40000,
			maxMinor: 79999,
		});
	});

	test.each([
		["Under ₹400", { maxMinor: 39999 }],
		["₹2,500 and over", { minMinor: 250000 }],
	])(
		"a quick range with one bound, %s, sets only that bound",
		async (name, bounds) => {
			const { user, onApply } = renderSheet({
				filter: { minMinor: 1, maxMinor: 2 },
			});

			await open(user);
			await user.click(await screen.findByRole("radio", { name }));
			await apply(user);

			expect(onApply).toHaveBeenCalledExactlyOnceWith(bounds);
		},
	);

	test("Clear all clears the sheet's fields and keeps the search", async () => {
		const { user, onApply } = renderSheet({
			filter: {
				from: "2026-10-01",
				to: "2026-10-31",
				type: ["expense"],
				cat: ["food"],
				src: "manual",
				minMinor: 100,
				maxMinor: 900,
				q: "swiggy",
			},
		});

		await open(user);
		await user.click(screen.getByRole("button", { name: "Clear all" }));
		expect(onApply).not.toHaveBeenCalled();
		await apply(user);

		expect(onApply).toHaveBeenCalledExactlyOnceWith({ q: "swiggy" });
	});

	test("closing drops the draft, and opening again starts from the committed filter", async () => {
		const { user, onApply } = renderSheet({ filter: { cat: ["food"] } });

		await open(user);
		await user.click(chip("Category", "Health"));
		await user.click(screen.getByRole("button", { name: "Close" }));
		await closed();
		await open(user);

		expect(onApply).not.toHaveBeenCalled();
		expect(chip("Category", "Health")).toHaveAttribute("aria-pressed", "false");
		expect(chip("Category", "Food")).toHaveAttribute("aria-pressed", "true");
	});

	test("Escape closes it without applying", async () => {
		const { user, onApply } = renderSheet();

		await open(user);
		await user.click(chip("Type", "Income"));
		await user.keyboard("{Escape}");

		await closed();
		expect(onApply).not.toHaveBeenCalled();
	});
});
