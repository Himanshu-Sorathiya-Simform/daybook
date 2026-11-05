import { onlineManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
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

import { renderInApp } from "@/components/app/__tests__/helpers";
import { Toaster } from "@/components/feedback/Toaster";
import { useOnline } from "@/hooks/useOnline";
import { isUuidV7 } from "@/lib/ids";
import { readFilterParams } from "@/lib/transactions/url";
import type { SavedView } from "@/lib/transactions/views";
import {
	ok,
	refuse,
	route,
	type Seen,
	urlHarness,
} from "../../hooks/__tests__/helpers";
import { useTransactionsUrl } from "../../hooks/useTransactionsUrl";
import { idOf } from "../../lib/__tests__/fixtures";
import type { LabelLocale } from "../../lib/labels";
import { histogramOptions } from "../../lib/queries";
import { type ViewDialog, ViewsBar } from "../ViewsBar";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
// The golden clock (TST-3); only `Date` is frozen, so user-event's timers stay real.
beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-11-02T06:30:00.000Z"));
});
afterEach(() => {
	cleanup();
	act(() => {
		toast.dismiss();
	});
	network.resetHandlers();
	onlineManager.setOnline(true);
	vi.useRealTimers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

// The golden profile on the golden clock's day.
const IN: LabelLocale = {
	today: "2026-11-02",
	dateLocale: "en-IN",
	timezone: "Asia/Kolkata",
	numberLocale: "hi-IN-u-nu-latn",
	currency: "INR",
};

const saved = (n: number, overrides: Partial<SavedView> = {}): SavedView => ({
	id: idOf(n),
	name: `View ${n}`,
	filter: {},
	sort: "date",
	dir: "desc",
	group: "day",
	version: 1,
	createdAt: "2026-11-01T06:30:00.000Z",
	updatedAt: "2026-11-01T06:30:00.000Z",
	...overrides,
});

/** F03 section 15's saved view: food, last month. */
const FOOD = saved(1, {
	name: "Food last month",
	filter: { range: "last_month", cat: ["food"] },
});
const RENT = saved(2, { name: "Rent", filter: { cat: ["housing"] } });
/** October's food, which FOOD shows on the golden day. */
const CHECK_B = "from=2026-10-01&to=2026-10-31&cat=food";

/** The views as the server keeps them: the list answers what the writes left. */
function viewsServer(start: SavedView[]) {
	const items = start.map((view) => ({ ...view }));
	const lists = route(network, "get", "/api/transaction-views", () =>
		ok({ items, currency: "INR" }),
	);
	return { items, lists };
}

type Store = ReturnType<typeof viewsServer>;

/** A view as the list holds it: the answer without its `currency`. */
function listedOf<T extends { currency?: unknown }>(answer: T): Omit<T, "currency"> {
	const copy = { ...answer };
	delete copy.currency;
	return copy;
}

/** A create the server accepts, keeping the view. */
function accept(store: Store) {
	return ({ body }: Seen) => {
		const kept = {
			...listedOf(body as SavedView & { currency?: string }),
			version: 1,
			createdAt: "2026-11-02T06:30:00.000Z",
			updatedAt: "2026-11-02T06:30:00.000Z",
		};
		store.items.push(kept);
		return ok({ ...kept, currency: "INR" }, 201);
	};
}

/** An edit the server accepts at the view's next version. */
function patched(store: Store, id: string) {
	return ({ body }: Seen) => {
		const at = store.items.findIndex((view) => view.id === id);
		const view = {
			...store.items[at]!,
			...listedOf(body as Partial<SavedView> & { currency?: string }),
			version: store.items[at]!.version + 1,
		};
		store.items[at] = view;
		return ok({ ...view, currency: "INR" });
	};
}

/** The page's part that the bar needs: the URL, the connection and the dialog it keeps. */
function Bar() {
	const url = useTransactionsUrl("INR");
	const online = useOnline();
	const [dialog, setDialog] = useState<ViewDialog | null>(null);
	return (
		<>
			<ViewsBar
				filter={url.filter}
				list={url.list}
				viewId={url.view}
				locale={IN}
				isOffline={!online}
				onApply={(view, state) =>
					url.applyView(view, state.filter, state.list)
				}
				onMark={url.markView}
				dialog={dialog}
				onDialogChange={setDialog}
			/>
			<span data-testid="dialog">{dialog ?? "none"}</span>
		</>
	);
}

function renderBar(search: string, views: SavedView[] = [FOOD, RENT]) {
	const store = viewsServer(views);
	const { calls, Url } = urlHarness(search);
	const rendered = renderInApp(
		<I18nProvider locale="en-IN">
			<Url>
				<Bar />
			</Url>
			<Toaster />
		</I18nProvider>,
	);
	return { ...rendered, calls, store, user: userEvent.setup() };
}

type User = ReturnType<typeof userEvent.setup>;

const pills = () => screen.getByRole("radiogroup", { name: "Saved views" });
const pill = (name: string | RegExp) => within(pills()).getByRole("radio", { name });
const loaded = () => screen.findByRole("radio", { name: /^Rent/ });
const checked = () =>
	within(pills())
		.getAllByRole("radio")
		.filter((radio) => radio.getAttribute("aria-checked") === "true")
		.map((radio) => radio.textContent);
const button = (name: string) => screen.getByRole("button", { name });
const offline = () => {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
	act(() => {
		window.dispatchEvent(new Event("offline"));
	});
};

async function openMenu(user: User) {
	await user.click(button("View options"));
	return screen.findByRole("menu");
}

describe("the bar (BR-F03-63, BR-F03-66, D-526)", () => {
	test("shows All Transactions first, then the views in the list's order", async () => {
		renderBar("");
		await loaded();
		expect(
			within(pills())
				.getAllByRole("radio")
				.map((radio) => radio.textContent),
		).toEqual(["All Transactions", "Food last month", "Rent"]);
	});

	test("no view selects All Transactions", async () => {
		renderBar("");
		await loaded();
		expect(checked()).toEqual(["All Transactions"]);
	});

	test("view=<id> selects that view, not edited on its own filter", async () => {
		renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		expect(checked()).toEqual(["Food last month"]);
	});

	// AC-F03-50
	test("the selected view reads “· edited” once the URL differs from it", async () => {
		renderBar(`?${CHECK_B}&type=expense&view=${FOOD.id}`);
		await loaded();
		expect(checked()).toEqual(["Food last month · edited"]);
	});

	test("All Transactions reads “· edited” with any filter", async () => {
		renderBar("?q=swiggy");
		await loaded();
		expect(checked()).toEqual(["All Transactions · edited"]);
	});

	test("a list parameter alone is an edit too", async () => {
		renderBar("?group=payee");
		await loaded();
		expect(checked()).toEqual(["All Transactions · edited"]);
	});

	test("only a selected saved view has the menu", async () => {
		const { unmount } = renderBar("");
		await loaded();
		expect(screen.queryByRole("button", { name: "View options" })).toBeNull();
		unmount();
		renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		expect(button("View options")).toBeInTheDocument();
	});

	test("while the list loads, a view id selects no pill and offers nothing", async () => {
		let answer: (() => void) | undefined;
		const held = new Promise<void>((resolve) => {
			answer = resolve;
		});
		route(network, "get", "/api/transaction-views", async () => {
			await held;
			return ok({ items: [FOOD], currency: "INR" });
		});
		const { calls, Url } = urlHarness(`?${CHECK_B}&view=${FOOD.id}`);
		renderInApp(
			<Url>
				<Bar />
			</Url>,
		);
		expect(checked()).toEqual([]);
		expect(screen.queryByRole("button", { name: /Save view/ })).toBeNull();
		answer!();
		await screen.findByRole("radio", { name: "Food last month" });
		expect(checked()).toEqual(["Food last month"]);
		expect(calls).toEqual([]);
	});
});

describe("choosing a view (BR-F03-65)", () => {
	test("pushes its filter with the preset as today's dates, and view=<id>", async () => {
		const { calls, user } = renderBar("?q=swiggy");
		await loaded();
		await user.click(pill("Food last month"));
		expect(calls).toEqual([
			{ mode: "push", href: `/transactions?${CHECK_B}&view=${FOOD.id}` },
		]);
		expect(checked()).toEqual(["Food last month"]);
	});

	test("pushes the view's sort, direction and group", async () => {
		const BIG = saved(3, {
			name: "Biggest",
			sort: "amount",
			group: "category",
		});
		const { calls, user } = renderBar("", [BIG]);
		await screen.findByRole("radio", { name: "Biggest" });
		await user.click(pill("Biggest"));
		expect(calls.at(-1)).toEqual({
			mode: "push",
			href: `/transactions?sort=amount&group=category&view=${BIG.id}`,
		});
	});

	test("All Transactions pushes the defaults and drops view", async () => {
		const { calls, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		await user.click(pill("All Transactions"));
		expect(calls.at(-1)).toEqual({ mode: "push", href: "/transactions" });
		expect(checked()).toEqual(["All Transactions"]);
	});

	test("pressing the selected view while edited applies it again", async () => {
		const { calls, user } = renderBar(
			`?${CHECK_B}&type=expense&view=${FOOD.id}`,
		);
		await loaded();
		await user.click(pill("Food last month · edited"));
		expect(calls).toEqual([
			{ mode: "push", href: `/transactions?${CHECK_B}&view=${FOOD.id}` },
		]);
	});

	test("pressing the selected view when nothing is edited does nothing", async () => {
		const { calls, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		await user.click(pill("Food last month"));
		expect(calls).toEqual([]);
	});

	test("the pills are one Tab stop: the arrows move and Space applies", async () => {
		const { calls, user } = renderBar("");
		await loaded();
		await user.tab();
		expect(pill("All Transactions")).toHaveFocus();
		await user.keyboard("{ArrowRight}");
		expect(pill("Food last month")).toHaveFocus();
		expect(calls).toEqual([]);
		await user.keyboard(" ");
		expect(calls.at(-1)?.href).toBe(`/transactions?${CHECK_B}&view=${FOOD.id}`);
		await user.tab();
		expect(pill("Food last month")).not.toHaveFocus();
		expect(pill("Rent")).not.toHaveFocus();
	});

	// AC-F03-54
	test("an id that is not the user's leaves the URL by replacing, once the list loads", async () => {
		const { calls } = renderBar(`?cat=food&view=${idOf(99)}`);
		await loaded();
		await waitFor(() =>
			expect(calls).toEqual([
				{ mode: "replace", href: "/transactions?cat=food" },
			]),
		);
		expect(checked()).toEqual(["All Transactions · edited"]);
	});

	test("a view list that fails to load leaves the id, with All Transactions alone", async () => {
		route(network, "get", "/api/transaction-views", () =>
			refuse(500, "internal"),
		);
		const { calls, Url } = urlHarness(`?view=${FOOD.id}`);
		renderInApp(
			<Url>
				<Bar />
			</Url>,
		);
		await waitFor(() =>
			expect(
				within(pills())
					.getAllByRole("radio")
					.map((radio) => radio.textContent),
			).toEqual(["All Transactions"]),
		);
		expect(calls).toEqual([]);
	});
});

describe("+ Save view (BR-F03-66, D-526)", () => {
	// AC-F03-54
	test("with nothing edited, shows the hint and sends nothing", async () => {
		const { user } = renderBar("");
		await loaded();
		const created = route(network, "post", "/api/transaction-views", () =>
			ok({}, 201),
		);
		await user.click(button("Save view"));
		expect(
			await screen.findByText("Change a filter, then save it as a view."),
		).toBeInTheDocument();
		expect(created).toEqual([]);
	});

	test("shows for a saved view with nothing edited, beside its menu", async () => {
		renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		expect(button("Save view")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Update view" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Revert" })).toBeNull();
	});

	test("stays offline, since it saves nothing", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		renderBar("");
		await loaded();
		expect(button("Save view")).not.toHaveAttribute("aria-disabled");
		expect(screen.queryByRole("status")).toBeNull();
	});
});

describe("Save as view (BR-F03-67)", () => {
	test("an edited All Transactions offers Save as view and Revert, not Update view", async () => {
		renderBar("?cat=food");
		await loaded();
		expect(button("Save as view")).toBeInTheDocument();
		expect(button("Revert")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Update view" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Save view" })).toBeNull();
	});

	// AC-F03-55
	test("saves the URL named from its chips, selects it and says so", async () => {
		const { calls, store, user } = renderBar(`?${CHECK_B}&group=category`);
		await loaded();
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			accept(store),
		);
		await user.click(button("Save as view"));
		expect(await screen.findByText("Saved as a new view.")).toBeInTheDocument();
		expect(created).toHaveLength(1);
		const body = created[0]?.body as SavedView;
		expect(body).toEqual({
			id: body.id,
			name: "Last month, Food",
			filter: { range: "last_month", cat: ["food"] },
			sort: "date",
			dir: "desc",
			group: "category",
		});
		expect(isUuidV7(body.id)).toBe(true);
		expect(isUuidV7(created[0]?.headers.get("idempotency-key") ?? "")).toBe(
			true,
		);
		expect(calls).toEqual([
			{
				mode: "replace",
				href: `/transactions?${CHECK_B}&group=category&view=${body.id}`,
			},
		]);
		expect(checked()).toEqual(["Last month, Food"]);
		expect(button("Save view")).toBeInTheDocument();
	});

	test("the new view stays selected after the list reloads", async () => {
		const { calls, store, user } = renderBar("?cat=food");
		await loaded();
		route(network, "post", "/api/transaction-views", accept(store));
		await user.click(button("Save as view"));
		await screen.findByText("Saved as a new view.");
		await waitFor(() => expect(store.lists.length).toBeGreaterThan(1));
		expect(checked()).toEqual(["Food"]);
		expect(calls).toHaveLength(1);
	});

	test("custom dates are saved as dates, and amounts with the currency", async () => {
		const { store, user } = renderBar("?from=2026-10-05&to=2026-10-20&min=500");
		await loaded();
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			accept(store),
		);
		await user.click(button("Save as view"));
		await screen.findByText("Saved as a new view.");
		expect(created[0]?.body).toMatchObject({
			name: "5 Oct to 20 Oct, From ₹500",
			filter: { from: "2026-10-05", to: "2026-10-20", minMinor: 50000 },
			currency: "INR",
		});
	});

	test("an amount that is a quick range is named as its chip reads", async () => {
		const search = `?${CHECK_B}&min=400&max=799.99`;
		const { queryClient, store, user } = renderBar(search);
		const { filter } = readFilterParams(new URLSearchParams(search), {
			currency: "INR",
		});
		// Check B's histogram (F03 section 5), cached as the Amount control left it.
		queryClient.setQueryData(
			histogramOptions({ filter, currency: "INR" }).queryKey,
			{
				edges: [
					31500, 40000, 50000, 63000, 80000, 100000, 125000, 160000,
					200000, 250000, 315000,
				],
				counts: [1, 0, 0, 1, 0, 0, 0, 0, 1, 1],
				currency: "INR",
			},
		);
		await loaded();
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			accept(store),
		);
		await user.click(button("Save as view"));
		await screen.findByText("Saved as a new view.");
		expect(created[0]?.body).toMatchObject({
			name: "Last month, Food, ₹400 to ₹800",
			filter: { minMinor: 40000, maxMinor: 79999 },
		});
	});

	test("with no chip, as for a sort alone, the name is “My view”", async () => {
		const { store, user } = renderBar("?sort=amount");
		await loaded();
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			accept(store),
		);
		await user.click(button("Save as view"));
		await screen.findByText("Saved as a new view.");
		expect(created[0]?.body).toMatchObject({
			name: "My view",
			filter: {},
			sort: "amount",
		});
	});

	test("a name another view has gets the first free suffix", async () => {
		const { store, user } = renderBar("?cat=food", [
			saved(3, { name: "food" }),
			saved(4, { name: "Food 2" }),
			RENT,
		]);
		await loaded();
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			accept(store),
		);
		await user.click(button("Save as view"));
		await screen.findByText("Saved as a new view.");
		expect(created[0]?.body).toMatchObject({ name: "Food 3" });
	});

	// AC-F03-55
	test("a 422 on the name tries the next suffix, with the same id and a new key", async () => {
		const { store, user } = renderBar("?cat=food");
		await loaded();
		const save = accept(store);
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			(request, index) =>
				index === 0 ?
					refuse(422, "validation_failed", {
						fields: { name: "You already have a view with this name." },
					})
				:	save(request),
		);
		await user.click(button("Save as view"));
		await screen.findByText("Saved as a new view.");
		expect(created.map((request) => (request.body as SavedView).name)).toEqual([
			"Food",
			"Food 2",
		]);
		const [first, second] = created;
		expect((second?.body as SavedView).id).toBe((first?.body as SavedView).id);
		expect(second?.headers.get("idempotency-key")).not.toBe(
			first?.headers.get("idempotency-key"),
		);
		expect(checked()).toEqual(["Food 2"]);
	});

	test("after five names refused, it stops with the server's message", async () => {
		const { calls, user } = renderBar("?cat=food");
		await loaded();
		const created = route(network, "post", "/api/transaction-views", () =>
			refuse(422, "validation_failed", {
				fields: { name: "You already have a view with this name." },
			}),
		);
		await user.click(button("Save as view"));
		expect(
			await screen.findByText("You already have a view with this name."),
		).toBeInTheDocument();
		expect(created.map((request) => (request.body as SavedView).name)).toEqual([
			"Food",
			"Food 2",
			"Food 3",
			"Food 4",
			"Food 5",
		]);
		expect(calls).toEqual([]);
	});

	test("at 20 views it is disabled with the reason, and sends nothing", async () => {
		const twenty = Array.from({ length: 20 }, (_, n) => saved(n + 10));
		const { user } = renderBar("?cat=food", twenty);
		await screen.findByRole("radio", { name: "View 29" });
		const created = route(network, "post", "/api/transaction-views", () =>
			ok({}, 201),
		);
		const save = button("Save as view");
		expect(save).toHaveAttribute("aria-disabled", "true");
		expect(save).toHaveAccessibleDescription(
			"You have 20 views. Delete one to save another.",
		);
		await user.click(save);
		expect(created).toEqual([]);
		expect(button("Revert")).not.toHaveAttribute("aria-disabled");
	});

	test("at 19 views it is enabled", async () => {
		const nineteen = Array.from({ length: 19 }, (_, n) => saved(n + 10));
		renderBar("?cat=food", nineteen);
		await screen.findByRole("radio", { name: "View 28" });
		expect(button("Save as view")).not.toHaveAttribute("aria-disabled");
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("the limit refused by the server shows its message", async () => {
		const { calls, user } = renderBar("?cat=food");
		await loaded();
		const created = route(network, "post", "/api/transaction-views", () =>
			refuse(422, "limit_reached", {
				message: "You have 20 views. Delete one to save another.",
			}),
		);
		await user.click(button("Save as view"));
		expect(
			await screen.findByText(
				"You have 20 views. Delete one to save another.",
			),
		).toBeInTheDocument();
		// Only a taken name tries another.
		expect(created).toHaveLength(1);
		expect(calls).toEqual([]);
	});

	test("no answer says the change wasn't saved, and selects nothing new", async () => {
		const { calls, user } = renderBar("?cat=food");
		await loaded();
		const created = route(network, "post", "/api/transaction-views", () =>
			HttpResponse.error(),
		);
		await user.click(button("Save as view"));
		expect(
			await screen.findByText("Your change wasn't saved. Try again."),
		).toBeInTheDocument();
		expect(created).toHaveLength(1);
		expect(calls).toEqual([]);
		expect(checked()).toEqual(["All Transactions · edited"]);
	});

	test("a second press while it saves sends nothing more", async () => {
		const { store, user } = renderBar("?cat=food");
		await loaded();
		let answer: (() => void) | undefined;
		const held = new Promise<void>((resolve) => {
			answer = resolve;
		});
		const save = accept(store);
		const created = route(
			network,
			"post",
			"/api/transaction-views",
			async (request) => {
				await held;
				return save(request);
			},
		);
		await user.click(button("Save as view"));
		await waitFor(() => expect(created).toHaveLength(1));
		await user.click(button("Save as view"));
		answer!();
		await screen.findByText("Saved as a new view.");
		expect(created).toHaveLength(1);
	});
});

describe("Revert (BR-F03-66)", () => {
	test("on All Transactions pushes the defaults", async () => {
		const { calls, user } = renderBar("?cat=food&sort=amount");
		await loaded();
		await user.click(button("Revert"));
		expect(calls).toEqual([{ mode: "push", href: "/transactions" }]);
		expect(checked()).toEqual(["All Transactions"]);
	});

	test("on a saved view applies the view again", async () => {
		const { calls, user } = renderBar(`?cat=food&view=${FOOD.id}`);
		await loaded();
		await user.click(button("Revert"));
		expect(calls).toEqual([
			{ mode: "push", href: `/transactions?${CHECK_B}&view=${FOOD.id}` },
		]);
		expect(checked()).toEqual(["Food last month"]);
	});

	// AC-F03-50: Revert clears either edit.
	test.each([
		["an added type", `?${CHECK_B}&type=expense&view=${FOOD.id}`],
		["a new grouping", `?${CHECK_B}&group=payee&view=${FOOD.id}`],
	])("clears %s from the view", async (_edit, search) => {
		const { calls, user } = renderBar(search);
		await loaded();
		expect(checked()).toEqual(["Food last month · edited"]);
		await user.click(button("Revert"));
		expect(calls).toEqual([
			{ mode: "push", href: `/transactions?${CHECK_B}&view=${FOOD.id}` },
		]);
		expect(checked()).toEqual(["Food last month"]);
	});

	test("works offline, since it only changes the URL", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { calls, user } = renderBar("?cat=food");
		await loaded();
		await user.click(button("Revert"));
		expect(calls).toEqual([{ mode: "push", href: "/transactions" }]);
	});
});

describe("Update view (BR-F03-68)", () => {
	// AC-F03-54
	test("an edited saved view offers Update view and Revert, and no Save as view", async () => {
		renderBar(`?${CHECK_B}&type=expense&view=${FOOD.id}`);
		await loaded();
		expect(button("Update view")).toBeInTheDocument();
		expect(button("Revert")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Save as view" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Save view" })).toBeNull();
	});

	// AC-F03-55
	test("saves the URL into the view at its version, then says so", async () => {
		const { calls, store, user } = renderBar(
			`?${CHECK_B}&type=expense&view=${FOOD.id}`,
		);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			patched(store, FOOD.id),
		);
		await user.click(button("Update view"));
		expect(await screen.findByText("View updated.")).toBeInTheDocument();
		expect(edits).toHaveLength(1);
		expect(edits[0]?.body).toEqual({
			filter: { range: "last_month", type: ["expense"], cat: ["food"] },
			sort: "date",
			dir: "desc",
			group: "day",
		});
		expect(edits[0]?.headers.get("if-match")).toBe('"1"');
		expect(isUuidV7(edits[0]?.headers.get("idempotency-key") ?? "")).toBe(true);
		expect(checked()).toEqual(["Food last month"]);
		expect(calls).toEqual([]);
	});

	test("amount bounds go with the currency", async () => {
		const { store, user } = renderBar(`?max=900&view=${RENT.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${RENT.id}`,
			patched(store, RENT.id),
		);
		await user.click(button("Update view"));
		await screen.findByText("View updated.");
		expect(edits[0]?.body).toMatchObject({
			filter: { maxMinor: 90000 },
			currency: "INR",
		});
	});

	// AC-F03-55
	test("a 409 says the view changed, and the list reloads", async () => {
		const { store, user } = renderBar(
			`?${CHECK_B}&type=expense&view=${FOOD.id}`,
		);
		await loaded();
		route(network, "patch", `/api/transaction-views/${FOOD.id}`, () =>
			refuse(409, "version_conflict"),
		);
		await user.click(button("Update view"));
		expect(
			await screen.findByText(
				"This view changed on another device. Try again.",
			),
		).toBeInTheDocument();
		await waitFor(() => expect(store.lists).toHaveLength(2));
		expect(checked()).toEqual(["Food last month · edited"]);
	});

	// AC-F03-55
	test("a 404 says the view was deleted, and the reloaded list drops it from the URL", async () => {
		const { calls, store, user } = renderBar(
			`?${CHECK_B}&type=expense&view=${FOOD.id}`,
		);
		await loaded();
		route(network, "patch", `/api/transaction-views/${FOOD.id}`, () => {
			store.items.splice(0, 1);
			return refuse(404, "not_found");
		});
		await user.click(button("Update view"));
		expect(
			await screen.findByText("This view was deleted on another device."),
		).toBeInTheDocument();
		await waitFor(() =>
			expect(calls).toEqual([
				{
					mode: "replace",
					href: `/transactions?from=2026-10-01&to=2026-10-31&type=expense&cat=food`,
				},
			]),
		);
		expect(checked()).toEqual(["All Transactions · edited"]);
		expect(screen.queryByRole("radio", { name: /Food last month/ })).toBeNull();
	});

	test("no answer says the change wasn't saved", async () => {
		const { user } = renderBar(`?${CHECK_B}&type=expense&view=${FOOD.id}`);
		await loaded();
		route(network, "patch", `/api/transaction-views/${FOOD.id}`, () =>
			HttpResponse.error(),
		);
		await user.click(button("Update view"));
		expect(
			await screen.findByText("Your change wasn't saved. Try again."),
		).toBeInTheDocument();
	});

	test("a signed-out answer shows nothing here: the app's banner answers it", async () => {
		const { user } = renderBar(`?${CHECK_B}&type=expense&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			() => refuse(401, "unauthenticated", { message: "Log in again." }),
		);
		await user.click(button("Update view"));
		await waitFor(() => expect(edits).toHaveLength(1));
		await waitFor(() =>
			expect(button("Update view")).not.toHaveAttribute("aria-disabled"),
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(document.querySelector("[data-sonner-toast]")).toBeNull();
	});
});

describe("offline (BR-F03-63)", () => {
	// AC-F03-54
	test("Save as view is disabled with the offline line, and Revert is not", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		renderBar("?cat=food");
		await loaded();
		const save = button("Save as view");
		expect(save).toHaveAttribute("aria-disabled", "true");
		expect(save).toHaveAccessibleDescription(
			"You are offline. Connect to save.",
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"You are offline. Connect to save.",
		);
		expect(button("Revert")).not.toHaveAttribute("aria-disabled");
	});

	// AC-F03-54
	test("Update view, Rename and Delete are disabled", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const { user } = renderBar(`?${CHECK_B}&type=expense&view=${FOOD.id}`);
		await loaded();
		expect(button("Update view")).toHaveAttribute("aria-disabled", "true");
		expect(button("Update view")).toHaveAccessibleDescription(
			"You are offline. Connect to save.",
		);
		const menu = await openMenu(user);
		expect(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		).toHaveAttribute("aria-disabled", "true");
		expect(
			within(menu).getByRole("menuitem", { name: "Delete" }),
		).toHaveAttribute("aria-disabled", "true");
	});

	test("a saved view not edited shows the line for its menu", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		expect(screen.getByRole("status")).toHaveTextContent(
			"You are offline. Connect to save.",
		);
	});

	test("the controls come back with the connection", async () => {
		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		renderBar("?cat=food");
		await loaded();
		expect(button("Save as view")).toHaveAttribute("aria-disabled", "true");
		online.mockReturnValue(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(button("Save as view")).not.toHaveAttribute("aria-disabled");
		expect(screen.queryByRole("status")).toBeNull();
	});

	test("the offline line wins over the limit's", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const twenty = Array.from({ length: 20 }, (_, n) => saved(n + 10));
		renderBar("?cat=food", twenty);
		await screen.findByRole("radio", { name: "View 29" });
		expect(screen.getByRole("status")).toHaveTextContent(
			"You are offline. Connect to save.",
		);
	});
});

describe("Rename (BR-F03-69)", () => {
	async function openRename(user: User) {
		const menu = await openMenu(user);
		await user.click(within(menu).getByRole("menuitem", { name: "Rename" }));
		return screen.findByRole("dialog", { name: "Rename view" });
	}
	const nameField = (dialog: HTMLElement) =>
		within(dialog).getByRole("textbox", { name: "Name" });

	test("opens with the name, focused, and the page knows a dialog is open", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const dialog = await openRename(user);
		expect(nameField(dialog)).toHaveValue("Food last month");
		expect(nameField(dialog)).toHaveFocus();
		expect(screen.getByTestId("dialog")).toHaveTextContent("rename");
	});

	// AC-F03-55
	test("Save sends the name alone at the view's version, then says so", async () => {
		const { store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			patched(store, FOOD.id),
		);
		const dialog = await openRename(user);
		await user.clear(nameField(dialog));
		await user.type(nameField(dialog), "  Eating out  ");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(await screen.findByText("View renamed.")).toBeInTheDocument();
		expect(edits).toHaveLength(1);
		expect(edits[0]?.body).toEqual({ name: "Eating out" });
		expect(edits[0]?.headers.get("if-match")).toBe('"1"');
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(checked()).toEqual(["Eating out"]);
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});

	test("Enter in the field saves", async () => {
		const { store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			patched(store, FOOD.id),
		);
		const dialog = await openRename(user);
		await user.type(nameField(dialog), " 2{Enter}");
		await screen.findByText("View renamed.");
		expect(edits[0]?.body).toEqual({ name: "Food last month 2" });
	});

	test("the same name closes with no request", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			() => ok({}),
		);
		const dialog = await openRename(user);
		await user.type(nameField(dialog), " ");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(edits).toEqual([]);
		expect(screen.queryByText("View renamed.")).toBeNull();
	});

	test.each([
		["", "Enter a name."],
		["a".repeat(41), "Use 40 characters or fewer."],
		["RENT", "You already have a view with this name."],
		["All Transactions", "You already have a view with this name."],
	])("“%s” is refused under the field with no request", async (text, message) => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			() => ok({}),
		);
		const dialog = await openRename(user);
		await user.clear(nameField(dialog));
		if (text !== "") await user.type(nameField(dialog), text);
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(nameField(dialog)).toHaveAccessibleDescription(message);
		expect(nameField(dialog)).toHaveAttribute("aria-invalid", "true");
		await waitFor(() => expect(nameField(dialog)).toHaveFocus());
		expect(edits).toEqual([]);
	});

	test("after a refused Save, the message follows each change", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const dialog = await openRename(user);
		await user.clear(nameField(dialog));
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(nameField(dialog)).toHaveAccessibleDescription("Enter a name.");
		await user.type(nameField(dialog), "Ren");
		expect(nameField(dialog)).not.toHaveAttribute("aria-invalid");
		await user.type(nameField(dialog), "t");
		expect(nameField(dialog)).toHaveAccessibleDescription(
			"You already have a view with this name.",
		);
	});

	test("a name the server finds taken shows under the field until it changes", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		route(network, "patch", `/api/transaction-views/${FOOD.id}`, () =>
			refuse(422, "validation_failed", {
				fields: { name: "You already have a view with this name." },
			}),
		);
		const dialog = await openRename(user);
		await user.clear(nameField(dialog));
		await user.type(nameField(dialog), "Groceries");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		await waitFor(() =>
			expect(nameField(dialog)).toHaveAccessibleDescription(
				"You already have a view with this name.",
			),
		);
		await waitFor(() => expect(nameField(dialog)).toHaveFocus());
		await user.type(nameField(dialog), "!");
		expect(nameField(dialog)).not.toHaveAttribute("aria-invalid");
	});

	// AC-F03-55
	test("a 409 says the view changed in the dialog, and Save again uses the new version", async () => {
		const { store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const save = patched(store, FOOD.id);
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			(request, index) => {
				if (index > 0) return save(request);
				store.items[0] = { ...store.items[0]!, version: 2 };
				return refuse(409, "version_conflict");
			},
		);
		const dialog = await openRename(user);
		await user.clear(nameField(dialog));
		await user.type(nameField(dialog), "Eating out");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(await within(dialog).findByRole("alert")).toHaveTextContent(
			"This view changed on another device. Try again.",
		);
		await waitFor(() => expect(store.lists).toHaveLength(2));
		expect(nameField(dialog)).toHaveValue("Eating out");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		await screen.findByText("View renamed.");
		expect(edits.map((request) => request.headers.get("if-match"))).toEqual([
			'"1"',
			'"2"',
		]);
	});

	// AC-F03-55
	test("a 404 closes it, says the view was deleted, and the list reloads", async () => {
		const { calls, store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		route(network, "patch", `/api/transaction-views/${FOOD.id}`, () => {
			store.items.splice(0, 1);
			return refuse(404, "not_found");
		});
		const dialog = await openRename(user);
		await user.type(nameField(dialog), "!");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(
			await screen.findByText("This view was deleted on another device."),
		).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() =>
			expect(calls).toEqual([
				{ mode: "replace", href: `/transactions?${CHECK_B}` },
			]),
		);
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});

	test("no answer keeps it open with the line", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		route(network, "patch", `/api/transaction-views/${FOOD.id}`, () =>
			HttpResponse.error(),
		);
		const dialog = await openRename(user);
		await user.type(nameField(dialog), "!");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		expect(await within(dialog).findByRole("alert")).toHaveTextContent(
			"Your change wasn't saved. Try again.",
		);
		await user.type(nameField(dialog), "!");
		expect(within(dialog).queryByRole("alert")).toBeNull();
	});

	test("a signed-out answer keeps it open with no line: the app's banner answers it", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			() => refuse(401, "unauthenticated", { message: "Log in again." }),
		);
		const dialog = await openRename(user);
		await user.type(nameField(dialog), "!");
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		await waitFor(() => expect(edits).toHaveLength(1));
		await waitFor(() =>
			expect(
				within(dialog).getByRole("button", { name: "Save" }),
			).not.toHaveAttribute("aria-disabled"),
		);
		expect(screen.getByRole("dialog", { name: "Rename view" })).toBe(dialog);
		expect(within(dialog).queryByRole("alert")).toBeNull();
		expect(screen.queryByText("Log in again.")).toBeNull();
	});

	test("while it saves, Escape and Cancel wait", async () => {
		const { store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		let answer: (() => void) | undefined;
		const held = new Promise<void>((resolve) => {
			answer = resolve;
		});
		const save = patched(store, FOOD.id);
		route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			async (request) => {
				await held;
				return save(request);
			},
		);
		const dialog = await openRename(user);
		await user.type(nameField(dialog), "!{Enter}");
		const cancel = within(dialog).getByRole("button", { name: "Cancel" });
		await waitFor(() => expect(cancel).toHaveAttribute("aria-disabled", "true"));
		await user.keyboard("{Escape}");
		await user.click(cancel);
		expect(screen.getByRole("dialog", { name: "Rename view" })).toBe(dialog);
		answer!();
		await screen.findByText("View renamed.");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("going offline disables Save with the line", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			() => ok({}),
		);
		const dialog = await openRename(user);
		offline();
		expect(within(dialog).getByRole("status")).toHaveTextContent(
			"You are offline. Connect to save.",
		);
		const save = within(dialog).getByRole("button", { name: "Save" });
		expect(save).toHaveAttribute("aria-disabled", "true");
		await user.type(nameField(dialog), "!{Enter}");
		await user.click(save);
		expect(edits).toEqual([]);
	});

	test("Cancel and Escape close it with nothing sent", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const edits = route(
			network,
			"patch",
			`/api/transaction-views/${FOOD.id}`,
			() => ok({}),
		);
		let dialog = await openRename(user);
		await user.type(nameField(dialog), "!");
		await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		await waitFor(() => expect(button("View options")).toHaveFocus());
		dialog = await openRename(user);
		expect(nameField(dialog)).toHaveValue("Food last month");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(edits).toEqual([]);
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});

	test("the view deleted elsewhere while it is open closes it", async () => {
		const { queryClient, store, user } = renderBar(
			`?${CHECK_B}&view=${FOOD.id}`,
		);
		await loaded();
		await openRename(user);
		store.items.splice(0, 1);
		await act(() => queryClient.invalidateQueries());
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});
});

describe("Delete (BR-F03-69)", () => {
	async function openDelete(user: User) {
		const menu = await openMenu(user);
		await user.click(within(menu).getByRole("menuitem", { name: "Delete" }));
		return screen.findByRole("alertdialog", {
			name: "Delete “Food last month”?",
		});
	}

	test("asks first, saying the Transactions stay", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const confirm = await openDelete(user);
		expect(confirm).toHaveTextContent("Your Transactions stay as they are.");
		expect(
			within(confirm).getByRole("button", { name: "Cancel" }),
		).toHaveFocus();
		expect(screen.getByTestId("dialog")).toHaveTextContent("delete");
	});

	test("Cancel sends nothing", async () => {
		const { calls, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const deletes = route(
			network,
			"delete",
			`/api/transaction-views/${FOOD.id}`,
			() => new HttpResponse(null, { status: 204 }),
		);
		const confirm = await openDelete(user);
		await user.click(within(confirm).getByRole("button", { name: "Cancel" }));
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(deletes).toEqual([]);
		expect(calls).toEqual([]);
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});

	// AC-F03-55
	test("Delete sends it at its version, says so, and the URL keeps its filter without view", async () => {
		const { calls, store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		const deletes = route(
			network,
			"delete",
			`/api/transaction-views/${FOOD.id}`,
			() => {
				store.items.splice(0, 1);
				return new HttpResponse(null, { status: 204 });
			},
		);
		const confirm = await openDelete(user);
		await user.click(within(confirm).getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("View deleted.")).toBeInTheDocument();
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.body).toEqual({});
		expect(deletes[0]?.headers.get("if-match")).toBe('"1"');
		expect(calls.at(-1)).toEqual({
			mode: "replace",
			href: `/transactions?${CHECK_B}`,
		});
		expect(calls.every((call) => call.mode === "replace")).toBe(true);
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		expect(checked()).toEqual(["All Transactions · edited"]);
		expect(screen.queryByRole("radio", { name: /Food last month/ })).toBeNull();
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});

	// AC-F03-55
	test("a 404 counts as done: the view goes, with “View deleted.”", async () => {
		const { calls, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		route(network, "delete", `/api/transaction-views/${FOOD.id}`, () =>
			refuse(404, "not_found"),
		);
		const confirm = await openDelete(user);
		await user.click(within(confirm).getByRole("button", { name: "Delete" }));
		expect(await screen.findByText("View deleted.")).toBeInTheDocument();
		expect(calls.at(-1)?.href).toBe(`/transactions?${CHECK_B}`);
		expect(
			screen.queryByText("This view was deleted on another device."),
		).toBeNull();
	});

	// AC-F03-55
	test("a 409 says the view changed, keeps it, and the list reloads", async () => {
		const { calls, store, user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		route(network, "delete", `/api/transaction-views/${FOOD.id}`, () =>
			refuse(409, "version_conflict"),
		);
		const confirm = await openDelete(user);
		await user.click(within(confirm).getByRole("button", { name: "Delete" }));
		expect(
			await screen.findByText(
				"This view changed on another device. Try again.",
			),
		).toBeInTheDocument();
		await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
		await waitFor(() => expect(store.lists).toHaveLength(2));
		expect(checked()).toEqual(["Food last month"]);
		expect(calls).toEqual([]);
		expect(screen.getByTestId("dialog")).toHaveTextContent("none");
	});

	test("while it deletes, the confirm waits with a spinner", async () => {
		const { user } = renderBar(`?${CHECK_B}&view=${FOOD.id}`);
		await loaded();
		let answer: (() => void) | undefined;
		const held = new Promise<void>((resolve) => {
			answer = resolve;
		});
		const deletes = route(
			network,
			"delete",
			`/api/transaction-views/${FOOD.id}`,
			async () => {
				await held;
				return new HttpResponse(null, { status: 204 });
			},
		);
		const confirm = await openDelete(user);
		await user.click(within(confirm).getByRole("button", { name: "Delete" }));
		await waitFor(() => expect(deletes).toHaveLength(1));
		await user.keyboard("{Escape}");
		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		await user.click(within(confirm).getByRole("button", { name: "Delete" }));
		answer!();
		await screen.findByText("View deleted.");
		expect(deletes).toHaveLength(1);
	});
});
