import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";

import type { BudgetChange } from "@/lib/budgets/preview";
import { goldenPreview } from "../../lib/__tests__/fixtures";
import type { Formats } from "../../lib/labels";
import type { PreviewContext } from "../../lib/preview";
import { WhatChanges, type WhatChangesProps } from "../WhatChanges";

const IN: Formats = {
	currency: "INR",
	numberLocale: "hi-IN-u-nu-latn",
	dateLocale: "en-IN",
};
const DE: Formats = { currency: "EUR", numberLocale: "de-DE", dateLocale: "de-DE" };
const context = (
	category: PreviewContext["category"],
	formats: Formats = IN,
): PreviewContext => ({ category, current: "2026-11", formats });

const from = (month: string, limitMinor: number | null): BudgetChange => ({
	scope: "from",
	month,
	limitMinor,
});

function renderChanges(
	change: BudgetChange,
	props: Partial<WhatChangesProps> = {},
	category: "food" | "shopping" = "food",
) {
	const view = render(
		<WhatChanges
			preview={goldenPreview(category, change)}
			change={change}
			context={context(category)}
			figures="ready"
			{...props}
		/>,
	);
	return { ...view, user: userEvent.setup() };
}

const heading = () =>
	screen.getByRole("heading", { level: 3, name: "What changes" });

describe("WhatChanges (BR-F04-26)", () => {
	test("is a region named What changes", () => {
		renderChanges(from("2026-09", 700000));
		expect(screen.getByRole("region", { name: "What changes" })).toBeVisible();
		expect(heading()).toBeVisible();
	});

	// F04 section 5, a retroactive change.
	test("up to 4 months it shows cards and the tail", () => {
		const { container } = renderChanges(from("2026-09", 700000));
		expect(screen.getAllByRole("listitem")).toHaveLength(4);
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
		expect(container.querySelector('[data-part="strip"]')).toBeNull();
	});

	test("exactly 4 months are still cards", () => {
		renderChanges(from("2026-08", 700000));
		expect(screen.getAllByRole("listitem")).toHaveLength(5);
		expect(screen.queryByRole("table")).not.toBeInTheDocument();
	});

	test("5 months or more are a strip and the table Months that change", () => {
		const { container } = renderChanges(from("2026-07", 700000));
		expect(container.querySelector('[data-part="strip"]')).not.toBeNull();
		expect(
			screen.getByRole("table", { name: "Months that change" }),
		).toBeVisible();
		expect(screen.queryAllByRole("listitem")).toHaveLength(0);
		expect(container).toHaveTextContent("One column per month");
	});

	// F04 section 5, a long change.
	test("the long change is 37 columns and four groups", () => {
		const { container } = renderChanges(from("2023-11", 400000), {}, "shopping");
		expect(container.querySelectorAll("[data-month]")).toHaveLength(37);
		const body = within(screen.getAllByRole("rowgroup")[1]!);
		expect(body.getAllByRole("row")).toHaveLength(5);
	});
});

describe("the caption", () => {
	test("counts the months, then every month after", () => {
		renderChanges(from("2026-09", 700000));
		expect(screen.getByText("3 months, then every month after")).toBeVisible();
	});

	test("a later month names it", () => {
		renderChanges(from("2026-12", 700000));
		expect(
			screen.getByText("December 2026 and every month after"),
		).toBeVisible();
	});

	test("the current month alone names it", () => {
		renderChanges(from("2026-11", 700000));
		expect(
			screen.getByText("November 2026 and every month after"),
		).toBeVisible();
	});

	test("a long change counts its months", () => {
		renderChanges(from("2023-11", 400000), {}, "shopping");
		expect(screen.getByText("37 months, then every month after")).toBeVisible();
	});

	test("one month only has none", () => {
		renderChanges({ scope: "month", month: "2026-10", limitMinor: 800000 });
		expect(screen.queryByText(/every month after/)).not.toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(3);
	});

	test("follows the profile's language", () => {
		const change = from("2026-12", 700000);
		render(
			<WhatChanges
				preview={goldenPreview("food", change)}
				change={change}
				context={context("food", DE)}
				figures="ready"
			/>,
		);
		expect(
			screen.getByText("Dezember 2026 and every month after"),
		).toBeVisible();
	});
});

describe("the strip follows the table", () => {
	test("a row under the pointer tints its months in the strip", async () => {
		const { container, user } = renderChanges(
			from("2023-11", 400000),
			{},
			"shopping",
		);
		const body = within(screen.getAllByRole("rowgroup")[1]!);
		await user.hover(body.getAllByRole("row")[1]!);
		const tinted = [
			...container.querySelectorAll('[data-part="highlight"]'),
		].map((each) => each.closest("[data-month]")?.getAttribute("data-month"));
		expect(tinted).toEqual(["2026-09"]);
		await user.hover(body.getAllByRole("row")[0]!);
		expect(container.querySelectorAll('[data-part="highlight"]')).toHaveLength(
			34,
		);
		await user.unhover(body.getAllByRole("row")[0]!);
		expect(container.querySelector('[data-part="highlight"]')).toBeNull();
	});
});

describe("without the spending (section 10)", () => {
	test("missing: cards show limits alone", () => {
		renderChanges(from("2026-09", 700000), { figures: "missing" });
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(4);
	});

	test("missing: a long change leaves the strip out and keeps the table", () => {
		const { container } = renderChanges(
			from("2023-11", 400000),
			{ figures: "missing" },
			"shopping",
		);
		expect(container.querySelector('[data-part="strip"]')).toBeNull();
		expect(container).not.toHaveTextContent("One column per month");
		expect(screen.getByRole("table")).toBeVisible();
		expect(screen.queryByText(/On track/)).not.toBeInTheDocument();
	});

	test("loading: a long change keeps the strip's place, with no bars", () => {
		const { container } = renderChanges(
			from("2023-11", 400000),
			{ figures: "loading" },
			"shopping",
		);
		expect(container.querySelector('[data-part="strip"]')).not.toBeNull();
		expect(container.querySelector('[data-part="spent"]')).toBeNull();
	});
});

describe("WhatChanges' root", () => {
	test("takes a className", () => {
		renderChanges(from("2026-09", 700000), { className: "extra" });
		expect(screen.getByRole("region")).toHaveClass("extra");
	});
});
