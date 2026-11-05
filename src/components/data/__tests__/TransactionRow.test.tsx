import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import {
	TransactionRow,
	type TransactionRowProps,
} from "@/components/data/TransactionRow";
import { categoryColor } from "@/lib/categories";

const IN = "hi-IN-u-nu-latn";

// Golden row 1-ish: Swiggy, Food, an expense of ₹845.00 at 10:15 pm.
const swiggy: TransactionRowProps = {
	title: "Swiggy",
	payee: "Swiggy",
	category: "food",
	when: "10:15 pm",
	amountMinor: -84500,
	currency: "INR",
	numberLocale: IN,
};

function renderRow(
	props: Partial<TransactionRowProps> = {},
	omit?: "category" | "payee",
) {
	const base: TransactionRowProps = { ...swiggy, ...props };
	if (omit) delete base[omit];
	const view = render(<TransactionRow {...base} />);
	const root = view.container.firstElementChild as HTMLElement;
	const [avatar, text] = Array.from(root.children) as HTMLElement[];
	const [title, subtitle] = Array.from(text!.children) as HTMLElement[];
	return { ...view, root, avatar: avatar!, title: title!, subtitle: subtitle! };
}

const dot = (subtitle: HTMLElement) =>
	subtitle.querySelector<HTMLElement>(":scope > [aria-hidden='true']");

describe("title", () => {
	test("shows the payee", () => {
		const { title } = renderRow();

		expect(title).toHaveTextContent("Swiggy");
	});

	test("shows a Goal row's title as given", () => {
		const { title } = renderRow({
			title: "To Vacation",
			goal: true,
		});

		expect(title).toHaveTextContent("To Vacation");
	});

	test("cuts a long title with an ellipsis instead of wrapping", () => {
		const { title } = renderRow({ title: "A".repeat(80) });

		expect(title).toHaveClass("truncate");
		expect(title.parentElement).toHaveClass("min-w-0", "flex-1");
	});
});

describe("subtitle", () => {
	test("shows the category label and the time when there is no description", () => {
		const { subtitle } = renderRow();

		expect(subtitle).toHaveTextContent(/^Food · 10:15 pm$/);
	});

	// D-528, edited 5 Nov 2026
	test("shows the category label, then the description, then the time", () => {
		const { subtitle } = renderRow({ description: "Dinner with team" });

		expect(subtitle).toHaveTextContent(/^Food · Dinner with team · 10:15 pm$/);
	});

	test("hides nothing: every word shown is read, and nothing more", () => {
		const { subtitle } = renderRow({ description: "Dinner with team" });

		expect(subtitle.querySelector(".sr-only")).toBeNull();
	});

	test("treats an empty description as none", () => {
		const { subtitle } = renderRow({ description: "" });

		expect(subtitle).toHaveTextContent(/^Food · 10:15 pm$/);
	});

	test("starts with a dot in the category's colour, hidden from screen readers", () => {
		const { subtitle } = renderRow({ category: "transportation" });

		const mark = dot(subtitle);
		expect(mark).toHaveClass("rounded-full", "shrink-0");
		expect(mark!.getAttribute("style")).toContain(
			categoryColor("transportation"),
		);
		expect(mark).toBeEmptyDOMElement();
	});

	test("keeps the dot beside a description too", () => {
		const { subtitle } = renderRow({ description: "Dinner with team" });

		expect(dot(subtitle)!.getAttribute("style")).toContain(
			categoryColor("food"),
		);
	});

	test.each([
		["salary", "Salary"],
		["personal_care", "Personal care"],
		["gifts_donations", "Gifts and donations"],
		["other_income", "Other income"],
	] as const)("shows the %s label as %s", (category, label) => {
		const { subtitle } = renderRow({ category });

		expect(subtitle).toHaveTextContent(`${label} · 10:15 pm`);
	});

	test("reads Other when a row has no category and is not a Goal row", () => {
		const { subtitle } = renderRow({}, "category");

		expect(subtitle).toHaveTextContent(/^Other · 10:15 pm$/);
	});

	test.each([
		["a charge", "Auto"],
		["outside day grouping", "Sat, 31 Oct · 10:15 pm"],
		["a charge outside day grouping", "Sat, 31 Oct"],
		["today outside day grouping", "Today · 11:40 am"],
	])("shows the time as the list words it for %s", (_, when) => {
		const { subtitle } = renderRow({ when });

		expect(subtitle).toHaveTextContent(`Food · ${when}`);
	});

	test("cuts a long subtitle with an ellipsis instead of wrapping", () => {
		const { subtitle } = renderRow({ description: "B".repeat(100) });

		expect(subtitle.querySelector(".truncate")).toHaveTextContent(
			"B".repeat(100),
		);
		expect(subtitle).toHaveClass("min-w-0");
	});
});

describe("Goal rows", () => {
	const goal = { title: "To Vacation", goal: true, payee: "" } as const;

	test("show only the time under the title: no dot, no category, no description", () => {
		const { subtitle } = renderRow({ ...goal, description: "For Goa" });

		expect(subtitle).toHaveTextContent(/^10:15 pm$/);
		expect(dot(subtitle)).toBeNull();
		expect(subtitle.querySelector(".sr-only")).toBeNull();
	});

	test("show the Goal icon in the avatar", () => {
		const { avatar } = renderRow(goal);

		expect(avatar).toHaveAttribute("aria-hidden", "true");
		expect(avatar.querySelector("svg")).toHaveClass("lucide-piggy-bank");
	});
});

describe("avatar", () => {
	test("shows the payee's initials, hidden from screen readers", () => {
		const { avatar } = renderRow({ payee: "Chai Point" });

		expect(avatar).toHaveTextContent("CP");
		expect(avatar).toHaveAttribute("aria-hidden", "true");
	});

	test("shows the category icon when the payee has no letters or digits", () => {
		const { avatar } = renderRow({ payee: "--" });

		expect(avatar).toHaveTextContent("");
		expect(avatar.querySelector("svg")).toBeInTheDocument();
	});

	test("shows the category icon when no payee is given", () => {
		const { avatar } = renderRow({}, "payee");

		expect(avatar.querySelector("svg")).toBeInTheDocument();
	});

	test("is tinted with the category colour", () => {
		const { avatar } = renderRow({ category: "health" });

		expect(avatar.getAttribute("style")).toContain(categoryColor("health"));
	});
});

describe("status", () => {
	test("a confirmed row shows no badge and a solid avatar", () => {
		const { avatar } = renderRow();

		expect(screen.queryByText("Pending sync")).toBeNull();
		expect(screen.queryByText("Not saved")).toBeNull();
		expect(avatar).not.toHaveClass("border-dashed");
	});

	test("is confirmed by default", () => {
		const { root } = renderRow({ status: "confirmed" });
		const plain = renderRow();

		expect(root.innerHTML).toBe(plain.root.innerHTML);
	});

	test("a pending row shows Pending sync and a dashed avatar", () => {
		const { avatar } = renderRow({ status: "pending" });

		expect(screen.getByText("Pending sync")).toHaveClass("border-dashed");
		expect(screen.queryByText("Not saved")).toBeNull();
		expect(avatar).toHaveClass("border-dashed");
	});

	test("a rejected row shows Not saved and a solid avatar", () => {
		const { avatar } = renderRow({ status: "rejected" });

		expect(screen.getByText("Not saved")).toHaveClass("text-neg");
		expect(screen.queryByText("Pending sync")).toBeNull();
		expect(avatar).not.toHaveClass("border-dashed");
	});

	test("the badge sits between the text and the amount", () => {
		const { root } = renderRow({ status: "pending" });

		const parts = Array.from(root.children);
		expect(parts).toHaveLength(4);
		expect(parts[2]).toHaveTextContent("Pending sync");
		expect(parts[3]).toHaveTextContent("−₹845.00");
	});
});

describe("amount", () => {
	test("shows money going out with a minus sign in the text colour (D-231)", () => {
		renderRow();

		const amount = screen.getByText("−₹845.00");
		expect(amount).not.toHaveClass("text-pos");
		expect(amount).not.toHaveClass("text-neg");
	});

	test("shows money coming in with a plus sign, in green as a second signal (D-231)", () => {
		renderRow({ amountMinor: 8500000, category: "salary" });

		expect(screen.getByText("+₹85,000.00")).toHaveClass("text-pos");
	});

	test("groups digits in the profile's number format", () => {
		renderRow({ amountMinor: -12345678 });

		expect(screen.getByText("−₹1,23,456.78")).toBeInTheDocument();
	});

	test("follows another currency and number format", () => {
		renderRow({ amountMinor: -124050, currency: "EUR", numberLocale: "de-DE" });

		expect(screen.getByText("−1.240,50 €")).toBeInTheDocument();
	});

	test("never wraps or shrinks, and uses tabular figures", () => {
		renderRow();

		expect(screen.getByText("−₹845.00")).toHaveClass(
			"figures",
			"whitespace-nowrap",
			"shrink-0",
			"text-amount",
		);
	});

	test("shows the smallest amount", () => {
		renderRow({ amountMinor: 1 });

		expect(screen.getByText("+₹0.01")).toBeInTheDocument();
	});
});

describe("density", () => {
	test("is comfortable by default: 54px tall with the medium avatar", () => {
		const { root, avatar } = renderRow();

		expect(root).toHaveClass("h-13.5");
		expect(avatar).toHaveClass("size-9");
	});

	test("compact is 46px tall with the small avatar", () => {
		const { root, avatar } = renderRow({ density: "compact" });

		expect(root).toHaveClass("h-11.5");
		expect(root).not.toHaveClass("h-13.5");
		expect(avatar).toHaveClass("size-7");
	});
});

describe("changes", () => {
	test("follows every prop that changes", () => {
		const { rerender, root } = renderRow();

		rerender(
			<TransactionRow
				{...swiggy}
				title="Zomato"
				payee="Zomato"
				description="Late dinner"
				when="11:05 pm"
				status="pending"
				amountMinor={-120000}
			/>,
		);

		expect(root).toHaveTextContent(
			/^ZOZomatoFood · Late dinner · 11:05 pmPending sync−₹1,200.00$/,
		);
	});

	test("turning into a Goal row drops the dot and the category", () => {
		const { rerender, subtitle } = renderRow();

		rerender(
			<TransactionRow
				{...swiggy}
				title="To Vacation"
				goal
			/>,
		);

		expect(subtitle).toHaveTextContent(/^10:15 pm$/);
	});
});

describe("markup", () => {
	test("has no role and nothing focusable, so the list that holds it decides both", () => {
		const { root } = renderRow({ status: "rejected" });

		expect(root).not.toHaveAttribute("role");
		expect(root.querySelector("[role], [tabindex], button, a")).toBeNull();
	});

	test("reads in order: title, subtitle, badge, amount", () => {
		const { root } = renderRow({
			description: "Dinner",
			status: "pending",
		});

		expect(root).toHaveTextContent(
			/^SWSwiggyFood · Dinner · 10:15 pmPending sync−₹845.00$/,
		);
	});

	test("takes the caller's classes on the root, last", () => {
		const { root } = renderRow({ className: "px-2 h-16" });

		expect(root).toHaveClass("px-2", "h-16", "flex");
		expect(root).not.toHaveClass("h-13.5");
	});
});
