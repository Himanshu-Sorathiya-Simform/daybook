import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { Section } from "@/components/surfaces/Section";

describe("title", () => {
	test("is a landmark named by its title, which is a level 2 heading", () => {
		render(<Section title="Recent Transactions">Rows</Section>);

		expect(
			screen.getByRole("region", { name: "Recent Transactions" }),
		).toHaveTextContent("Rows");
		expect(
			screen.getByRole("heading", { level: 2, name: "Recent Transactions" }),
		).toBeVisible();
	});

	test("names two sections separately", () => {
		render(
			<>
				<Section title="Budgets">A</Section>
				<Section title="Goals">B</Section>
			</>,
		);

		expect(screen.getByRole("region", { name: "Budgets" })).toHaveTextContent(
			"A",
		);
		expect(screen.getByRole("region", { name: "Goals" })).toHaveTextContent("B");
	});

	test("without a title has no heading and is not a landmark", () => {
		render(<Section>Body</Section>);

		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
		expect(screen.queryByRole("region")).not.toBeInTheDocument();
		expect(screen.getByText("Body")).toBeVisible();
	});

	test("leaves out the badge and the action when there is no title to put them beside", () => {
		render(
			<Section
				badge={<span>Simulated</span>}
				action={<a href="/x">See all</a>}
			>
				Body
			</Section>,
		);

		expect(screen.queryByText("Simulated")).not.toBeInTheDocument();
		expect(screen.queryByRole("link")).not.toBeInTheDocument();
	});
});

describe("heading row", () => {
	test("shows the badge after the title, and the action at the end", () => {
		render(
			<Section
				title="Insights"
				badge={<span>Simulated</span>}
				action={<a href="/insights">See all</a>}
			>
				Body
			</Section>,
		);

		const heading = screen.getByRole("heading", { name: "Insights" });
		const badge = screen.getByText("Simulated");
		const action = screen.getByRole("link", { name: "See all" });
		expect(
			heading.compareDocumentPosition(badge)
				& Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(
			badge.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
		expect(action).toHaveAttribute("href", "/insights");
	});

	test("takes a button as the action, which works", async () => {
		const user = userEvent.setup();
		const onPress = vi.fn();
		render(
			<Section
				title="Budgets"
				action={<button onClick={onPress}>View as table</button>}
			>
				Body
			</Section>,
		);

		await user.click(screen.getByRole("button", { name: "View as table" }));

		expect(onPress).toHaveBeenCalledOnce();
	});

	test("has no action when none is given", () => {
		render(<Section title="Budgets">Body</Section>);

		expect(screen.queryByRole("link")).not.toBeInTheDocument();
		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("shows the badge without an action", () => {
		render(
			<Section
				title="Insights"
				badge={<span>Simulated</span>}
			>
				Body
			</Section>,
		);

		expect(screen.getByText("Simulated")).toBeVisible();
	});
});

describe("element", () => {
	test.each([
		["section", "SECTION"],
		["div", "DIV"],
		["article", "ARTICLE"],
	] as const)("as %s is a %s", (as, tag) => {
		const { container } = render(
			<Section
				as={as}
				title="Budget"
			>
				Body
			</Section>,
		);

		expect(container.firstElementChild?.tagName).toBe(tag);
	});

	test("defaults to a section", () => {
		const { container } = render(<Section title="Budget">Body</Section>);

		expect(container.firstElementChild?.tagName).toBe("SECTION");
	});

	test("as an article with a title is still named", () => {
		render(
			<Section
				as="article"
				title="Budget"
			>
				Body
			</Section>,
		);

		expect(screen.getByRole("article", { name: "Budget" })).toBeInTheDocument();
	});
});

describe("look", () => {
	test("is a hairline frame with no shadow, on the section surface", () => {
		const { container } = render(<Section title="Budget">Body</Section>);

		expect(container.firstElementChild).toHaveClass(
			"rounded-section",
			"border",
			"border-line",
			"bg-section",
		);
		expect(container.firstElementChild?.className).not.toMatch(/shadow/);
	});

	test("has 22px by 24px of padding, and less on phones", () => {
		const { container } = render(<Section>Body</Section>);

		expect(container.firstElementChild).toHaveClass(
			"px-6",
			"py-5.5",
			"max-md:px-4.5",
		);
	});

	test("lets a caller change the padding, a height or a grid", () => {
		const { container } = render(
			<Section className="grid h-full p-3.5">Body</Section>,
		);

		expect(container.firstElementChild).toHaveClass("p-3.5", "h-full", "grid");
		expect(container.firstElementChild).not.toHaveClass("px-6", "py-5.5");
	});

	test("does not let long content widen it", () => {
		const { container } = render(<Section>Body</Section>);

		expect(container.firstElementChild).toHaveClass("min-w-0");
	});
});

describe("children", () => {
	test("shows any content, and nothing when there is none", () => {
		const { container, rerender } = render(
			<Section title="Budget">
				<p>One</p>
				<p>Two</p>
			</Section>,
		);
		expect(screen.getByText("One")).toBeVisible();
		expect(screen.getByText("Two")).toBeVisible();

		rerender(<Section title="Budget" />);
		expect(container.firstElementChild).toBeInTheDocument();
	});
});
