import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { PendingNote } from "@/components/data/PendingNote";

const IN = "hi-IN-u-nu-latn";

describe("an amount", () => {
	test("shows a pending increase with its plus", () => {
		render(
			<PendingNote
				minor={30000}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("+₹300.00 pending")).toBeVisible();
	});

	test("shows a pending decrease with the minus sign, not a hyphen", () => {
		render(
			<PendingNote
				minor={-30000}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("−₹300.00 pending")).toBeVisible();
	});

	test("shows zero with no sign", () => {
		render(
			<PendingNote
				minor={0}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("₹0.00 pending")).toBeVisible();
	});

	test("writes the amount in the user's format and currency", () => {
		render(
			<>
				<PendingNote
					minor={124050}
					currency="EUR"
					numberLocale="de-DE-u-nu-latn"
				/>
				<PendingNote
					minor={1240}
					currency="JPY"
					numberLocale="ja-JP-u-nu-latn"
				/>
			</>,
		);

		expect(screen.getByText("+1.240,50 € pending")).toBeVisible();
		expect(screen.getByText("+￥1,240 pending")).toBeVisible();
	});

	test("has tabular digits", () => {
		render(
			<PendingNote
				minor={100}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("+₹1.00 pending")).toHaveClass("figures");
	});
});

describe("a count", () => {
	test.each([0, 1, 12, 1000])("shows +%i pending", (count) => {
		render(<PendingNote count={count} />);

		expect(screen.getByText(`+${count} pending`)).toBeVisible();
	});
});

describe("a label", () => {
	test("shows its own text as it is", () => {
		render(<PendingNote label="Pending sync" />);

		expect(screen.getByText("Pending sync")).toBeVisible();
	});

	test("shows an empty label as nothing at all, not as 'pending'", () => {
		const { container } = render(<PendingNote label="" />);

		expect(container.firstElementChild).toHaveTextContent("");
	});
});

describe("look", () => {
	test.each([
		[
			"amount",
			<PendingNote
				key="a"
				minor={1}
				currency="INR"
				numberLocale={IN}
			/>,
		],
		[
			"count",
			<PendingNote
				key="c"
				count={1}
			/>,
		],
		[
			"label",
			<PendingNote
				key="l"
				label="Pending sync"
			/>,
		],
	])(
		"a %s note is a dashed outline in the pending colour, so it never relies on colour alone",
		(_name, note) => {
			const { container } = render(note);

			expect(container.firstElementChild).toHaveClass(
				"border-dashed",
				"border-edge",
				"text-pending",
				"rounded-chip",
				"whitespace-nowrap",
			);
		},
	);

	test("takes the caller's classes", () => {
		const { container } = render(
			<PendingNote
				count={1}
				className="ml-2"
			/>,
		);

		expect(container.firstElementChild).toHaveClass("ml-2");
	});

	test("is plain text, with no role or button", () => {
		render(<PendingNote count={1} />);

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});
});
