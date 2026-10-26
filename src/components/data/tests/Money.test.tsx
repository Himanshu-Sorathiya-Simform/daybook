import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Money } from "@/components/data/Money";
import type { CurrencyCode } from "@/lib/currency";

const IN = "hi-IN-u-nu-latn";
const DE = "de-DE-u-nu-latn";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("inline", () => {
	test("shows the amount in the user's format with tabular digits that do not wrap", () => {
		render(
			<Money
				minor={3116800}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("₹31,168.00")).toHaveClass(
			"figures",
			"whitespace-nowrap",
		);
	});

	test.each([
		["INR", IN, 3116800, "₹31,168.00"],
		["INR", IN, 10000000, "₹1,00,000.00"],
		["USD", "en-US-u-nu-latn", 124050, "$1,240.50"],
		["GBP", "en-GB-u-nu-latn", 124050, "£1,240.50"],
		["EUR", DE, 124050, "1.240,50 €"],
		["JPY", "ja-JP-u-nu-latn", 1240, "￥1,240"],
		["KWD", "en-US-u-nu-latn", 1240500, "KWD 1,240.500"],
	] as [CurrencyCode, string, number, string][])(
		"writes %s in %s as %s",
		(currency, numberLocale, minor, text) => {
			render(
				<Money
					minor={minor}
					currency={currency}
					numberLocale={numberLocale}
				/>,
			);

			expect(screen.getByText(text.replace(" ", " "))).toBeVisible();
		},
	);

	test("shows zero, and a single minor unit", () => {
		render(
			<>
				<Money
					minor={0}
					currency="INR"
					numberLocale={IN}
				/>
				<Money
					minor={1}
					currency="INR"
					numberLocale={IN}
				/>
			</>,
		);

		expect(screen.getByText("₹0.00")).toBeVisible();
		expect(screen.getByText("₹0.01")).toBeVisible();
	});

	test("shows the largest allowed amount exactly", () => {
		render(
			<Money
				minor={99_999_999_999}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("₹99,99,99,999.99")).toBeVisible();
	});

	test("refuses an amount that is not a whole number of minor units", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});

		expect(() =>
			render(
				<Money
					minor={12.5}
					currency="INR"
					numberLocale={IN}
				/>,
			),
		).toThrow(RangeError);
	});

	test("puts the caller's classes on the element", () => {
		render(
			<Money
				minor={100}
				currency="INR"
				numberLocale={IN}
				className="text-amount font-bold"
			/>,
		);

		expect(screen.getByText("₹1.00")).toHaveClass(
			"text-amount",
			"font-bold",
			"figures",
		);
	});
});

describe("sign and colour", () => {
	test("a negative has the minus sign (U+2212, not a hyphen) and is red", () => {
		render(
			<Money
				minor={-1842000}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		const element = screen.getByText("−₹18,420.00");
		expect(element).toHaveClass("text-neg");
		expect(element.textContent).not.toContain("-");
	});

	test("a positive keeps the surrounding colour and shows no plus by default", () => {
		render(
			<Money
				minor={8500000}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("₹85,000.00")).not.toHaveClass(
			"text-neg",
			"text-pos",
		);
	});

	test("zero is never red and never signed", () => {
		render(
			<Money
				minor={0}
				currency="INR"
				numberLocale={IN}
				sign="always"
				tone="signed"
			/>,
		);

		const element = screen.getByText("₹0.00");
		expect(element).not.toHaveClass("text-neg", "text-pos");
	});

	test("the sign=always option shows a plus on a positive", () => {
		render(
			<Money
				minor={8500000}
				currency="INR"
				numberLocale={IN}
				sign="always"
			/>,
		);

		expect(screen.getByText("+₹85,000.00")).not.toHaveClass("text-pos");
	});

	test("the signed tone shows a positive with a plus in green", () => {
		render(
			<Money
				minor={8500000}
				currency="INR"
				numberLocale={IN}
				sign="always"
				tone="signed"
			/>,
		);

		expect(screen.getByText("+₹85,000.00")).toHaveClass("text-pos");
	});

	test("the signed tone shows green only together with sign=always", () => {
		render(
			<Money
				minor={8500000}
				currency="INR"
				numberLocale={IN}
				tone="signed"
			/>,
		);

		expect(screen.getByText("₹85,000.00")).not.toHaveClass("text-pos");
	});

	test("the signed tone leaves a negative in the surrounding colour", () => {
		render(
			<Money
				minor={-100}
				currency="INR"
				numberLocale={IN}
				sign="always"
				tone="signed"
			/>,
		);

		expect(screen.getByText("−₹1.00")).not.toHaveClass("text-neg", "text-pos");
	});

	test("the neutral tone never colours anything", () => {
		render(
			<>
				<Money
					minor={-100}
					currency="INR"
					numberLocale={IN}
					tone="neutral"
				/>
				<Money
					minor={100}
					currency="INR"
					numberLocale={IN}
					tone="neutral"
					sign="always"
				/>
			</>,
		);

		expect(screen.getByText("−₹1.00")).not.toHaveClass("text-neg");
		expect(screen.getByText("+₹1.00")).not.toHaveClass("text-pos");
	});

	test("a negative in EUR keeps the minus and the sign after the number", () => {
		render(
			<Money
				minor={-124050}
				currency="EUR"
				numberLocale={DE}
			/>,
		);

		expect(screen.getByText("−1.240,50 €")).toHaveClass("text-neg");
	});
});

describe("readout", () => {
	function visual(container: HTMLElement) {
		return container.querySelector("[aria-hidden='true']") as HTMLElement;
	}

	test("is read once as the whole amount, and its visual parts are hidden from screen readers", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={3116800}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		expect(screen.getByText("₹31,168.00")).toHaveClass("sr-only");
		expect(visual(container)).toHaveTextContent("₹31,168.00");
		expect(visual(container).children).toHaveLength(3);
	});

	test("shows the whole part large and the sign and decimals small, in the secondary colour", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={3116800}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		const [sign, whole, decimals] = Array.from(visual(container).children);
		expect(sign).toHaveTextContent("₹");
		expect(sign).toHaveClass("text-readout-unit", "text-ink-2");
		expect(whole).toHaveTextContent("31,168");
		expect(whole).toHaveClass("text-readout", "ml-0.75");
		expect(decimals).toHaveTextContent(".00");
		expect(decimals).toHaveClass("text-readout-unit", "text-ink-2");
	});

	test("puts the sign after the number for a currency written that way", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={124050}
				currency="EUR"
				numberLocale={DE}
			/>,
		);

		const [sign, whole, decimals] = Array.from(visual(container).children);
		expect(sign).toHaveTextContent("");
		expect(whole).toHaveTextContent("1.240");
		expect(whole).not.toHaveClass("ml-0.75");
		expect(decimals).toHaveTextContent(",50 €");
	});

	test("shows a negative in red with the minus sign, and without the faded sign colour", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={-1842000}
				currency="INR"
				numberLocale={IN}
			/>,
		);

		const [sign] = Array.from(visual(container).children);
		expect(container.firstElementChild).toHaveClass("text-neg");
		expect(sign).toHaveTextContent("−₹");
		expect(sign).not.toHaveClass("text-ink-2");
		expect(screen.getByText("−₹18,420.00")).toHaveClass("sr-only");
	});

	test("shows a plus when asked", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={500}
				currency="INR"
				numberLocale={IN}
				sign="always"
			/>,
		);

		expect(visual(container)).toHaveTextContent("+₹5.00");
	});

	test("has no decimals for JPY", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={1240}
				currency="JPY"
				numberLocale="ja-JP-u-nu-latn"
			/>,
		);

		const [, whole, decimals] = Array.from(visual(container).children);
		expect(whole).toHaveTextContent("1,240");
		expect(decimals).toHaveTextContent("");
	});

	test("honours the neutral tone", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={-100}
				currency="INR"
				numberLocale={IN}
				tone="neutral"
			/>,
		);

		expect(container.firstElementChild).not.toHaveClass("text-neg");
	});

	test("has tabular digits and takes the caller's classes", () => {
		const { container } = render(
			<Money
				variant="readout"
				minor={100}
				currency="INR"
				numberLocale={IN}
				className="mt-2"
			/>,
		);

		expect(visual(container)).toHaveClass("figures");
		expect(container.firstElementChild).toHaveClass("mt-2");
	});
});
