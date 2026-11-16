import { onlineManager } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
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
import { ok, refuse, route } from "../../hooks/__tests__/helpers";
import { MonthMenu } from "../MonthMenu";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

/** jsdom lays nothing out; months sit in four columns so React Aria's grid finds them. */
beforeEach(() => {
	vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
		function (this: HTMLElement) {
			const key = this.getAttribute("data-key") ?? "";
			const index = /^\d{4}-\d{2}$/.test(key) ? Number(key.slice(5)) - 1 : 0;
			const left = (index % 4) * 80;
			const top = Math.floor(index / 4) * 50;
			return {
				x: left,
				y: top,
				left,
				top,
				width: 80,
				height: 50,
				right: left + 80,
				bottom: top + 50,
				toJSON: () => ({}),
			} as DOMRect;
		},
	);
});
afterEach(() => vi.restoreAllMocks());

/** F04 section 5: 2026 is `null` to August, then 810, 1197, 38 and 0. */
const YEAR_2026 = {
	year: 2026,
	months: [
		...Array.from({ length: 8 }, (_, index) => ({
			month: `2026-0${index + 1}`,
			utilizationTenths: null,
		})),
		{ month: "2026-09", utilizationTenths: 810 },
		{ month: "2026-10", utilizationTenths: 1197 },
		{ month: "2026-11", utilizationTenths: 38 },
		{ month: "2026-12", utilizationTenths: 0 },
	],
};

const empty = (year: number) => ({
	year,
	months: Array.from({ length: 12 }, (_, index) => ({
		month: `${year}-${String(index + 1).padStart(2, "0")}`,
		utilizationTenths: null,
	})),
});

function renderMenu(numberLocale = "hi-IN-u-nu-latn") {
	const onPick = vi.fn();
	const close = vi.fn();
	const view = renderInApp(
		<MonthMenu
			value="2026-10"
			current="2026-11"
			range={{ first: "2023-11", last: "2027-11" }}
			dateLocale="en-IN"
			numberLocale={numberLocale}
			onPick={onPick}
			close={close}
		/>,
	);
	return { ...view, onPick, close, user: userEvent.setup() };
}

describe("figures (BR-F04-14, BR-F04-35)", () => {
	test("each month with a Budget shows its overall utilization; the others show none", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		renderMenu();
		expect(
			await screen.findByRole("option", { name: "October 2026, 119.7%" }),
		).toBeVisible();
		expect(
			screen.getByRole("option", { name: "September 2026, 81.0%" }),
		).toBeVisible();
		expect(
			screen.getByRole("option", { name: "November 2026, this month, 3.8%" }),
		).toBeVisible();
		expect(
			screen.getByRole("option", { name: "December 2026, 0.0%" }),
		).toBeVisible();
		expect(
			screen.getByRole("option", { name: "August 2026" }),
		).toHaveTextContent(/^Aug$/);
	});

	test("asks for the shown year's summary", async () => {
		const seen = route(network, "get", "/api/budgets/summary", () =>
			ok(YEAR_2026),
		);
		renderMenu();
		await screen.findByRole("option", { name: "October 2026, 119.7%" });
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/summary?year=2026",
		]);
	});

	test("figures follow the number locale", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		renderMenu("de-DE");
		expect(
			await screen.findByRole("option", {
				name: "October 2026, 119,7\u00a0%",
			}),
		).toBeVisible();
	});

	test("moving to another year loads that year's figures", async () => {
		const seen = route(network, "get", "/api/budgets/summary", ({ path }) =>
			ok(path.endsWith("2026") ? YEAR_2026 : empty(2025)),
		);
		const { user } = renderMenu();
		await screen.findByRole("option", { name: "October 2026, 119.7%" });
		await user.click(screen.getByRole("button", { name: "Previous year" }));
		expect(
			await screen.findByRole("option", { name: "October 2025" }),
		).toBeVisible();
		expect(seen.map((each) => each.path)).toEqual([
			"/api/budgets/summary?year=2026",
			"/api/budgets/summary?year=2025",
		]);
	});

	test("while loading, and when the summary cannot load, the months show without figures", async () => {
		route(network, "get", "/api/budgets/summary", () => refuse(500, "internal"));
		renderMenu();
		expect(screen.getByRole("option", { name: "October 2026" })).toBeVisible();
		await waitFor(() =>
			expect(
				screen.getByRole("option", { name: "October 2026" }),
			).toBeVisible(),
		);
	});
});

describe("while the year's figures load (BR-F04-14, section 6)", () => {
	const bars = () =>
		document.querySelectorAll('[role=option] [aria-hidden="true"]');

	test("every month holds a skeleton bar until the summary comes, then its figure", async () => {
		route(network, "get", "/api/budgets/summary", async () => {
			await delay(80);
			return ok(YEAR_2026);
		});
		renderMenu();
		expect(bars()).toHaveLength(12);
		expect(
			await screen.findByRole("option", { name: "October 2026, 119.7%" }),
		).toBeVisible();
		expect(bars()).toHaveLength(0);
	});

	test("the months keep their names while it loads", async () => {
		route(network, "get", "/api/budgets/summary", async () => {
			await delay(80);
			return ok(YEAR_2026);
		});
		renderMenu();
		expect(screen.getByRole("option", { name: "October 2026" })).toBeVisible();
		expect(
			screen.getByRole("option", { name: "November 2026, this month" }),
		).toBeVisible();
		await screen.findByRole("option", { name: "October 2026, 119.7%" });
	});

	test("moving to another year shows the bars again until that year loads", async () => {
		route(network, "get", "/api/budgets/summary", async ({ path }) => {
			if (path.endsWith("2025")) await delay(80);
			return ok(path.endsWith("2025") ? empty(2025) : YEAR_2026);
		});
		const { user } = renderMenu();
		await screen.findByRole("option", { name: "October 2026, 119.7%" });
		await user.click(screen.getByRole("button", { name: /Previous year/ }));
		expect(bars()).toHaveLength(12);
		await waitFor(() => expect(bars()).toHaveLength(0));
	});

	test("a year already read shows its figures at once, with no bars", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		const { user } = renderMenu();
		await screen.findByRole("option", { name: "October 2026, 119.7%" });
		await user.click(screen.getByRole("button", { name: /Next year/ }));
		await user.click(screen.getByRole("button", { name: /Previous year/ }));
		expect(
			screen.getByRole("option", { name: "October 2026, 119.7%" }),
		).toBeVisible();
		expect(bars()).toHaveLength(0);
	});

	test("when the summary cannot load, the bars give way to empty lines", async () => {
		route(network, "get", "/api/budgets/summary", () => refuse(500, "internal"));
		renderMenu();
		expect(bars()).toHaveLength(12);
		await waitFor(() => expect(bars()).toHaveLength(0));
		expect(screen.getByRole("option", { name: "October 2026" })).toBeVisible();
	});

	test("offline, with nothing read, no bars wait for a connection", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		onlineManager.setOnline(false);
		try {
			route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
			renderMenu();
			expect(bars()).toHaveLength(0);
		} finally {
			onlineManager.setOnline(true);
		}
	});
});

describe("choosing", () => {
	test("a month shows it and closes the menu", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		const { user, onPick, close } = renderMenu();
		await user.click(screen.getByRole("option", { name: /^March 2026/ }));
		expect(onPick).toHaveBeenCalledWith("2026-03");
		expect(close).toHaveBeenCalledOnce();
	});

	test("the shown month closes the menu and keeps the month", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		const { user, onPick, close } = renderMenu();
		await user.click(screen.getByRole("option", { name: /^October 2026/ }));
		expect(onPick).toHaveBeenCalledWith("2026-10");
		expect(close).toHaveBeenCalledOnce();
	});

	test("This month shows the current month and closes", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		const { user, onPick, close } = renderMenu();
		await user.click(screen.getByRole("button", { name: "This month" }));
		expect(onPick).toHaveBeenCalledWith("2026-11");
		expect(close).toHaveBeenCalledOnce();
	});

	test("the caption says what the figures are", () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		renderMenu();
		expect(
			screen.getByText("Figures: overall use of the month's limits"),
		).toBeVisible();
	});

	test("focus starts on the shown month", async () => {
		route(network, "get", "/api/budgets/summary", () => ok(YEAR_2026));
		renderMenu();
		await waitFor(() =>
			expect(
				screen.getByRole("option", { name: /^October 2026/ }),
			).toHaveFocus(),
		);
	});
});
