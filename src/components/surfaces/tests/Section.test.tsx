import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { Section } from "@/components/surfaces/Section";

describe("default", () => {
	test("is a landmark named by its title", () => {
		render(<Section title="Recent Transactions">Rows</Section>);

		const region = screen.getByRole("region", { name: "Recent Transactions" });
		expect(region).toHaveTextContent("Rows");
		expect(
			screen.getByRole("heading", { level: 2, name: "Recent Transactions" }),
		).toBeVisible();
	});

	test("shows the badge and the action in the heading row", () => {
		render(
			<Section
				title="Insights"
				badge={<span>Simulated</span>}
				action={<a href="/insights">See all</a>}
			>
				Body
			</Section>,
		);

		expect(screen.getByText("Simulated")).toBeVisible();
		expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute(
			"href",
			"/insights",
		);
	});

	test("without a title has no heading and is not a landmark", () => {
		render(<Section>Body</Section>);

		expect(screen.queryByRole("heading")).not.toBeInTheDocument();
		expect(screen.queryByRole("region")).not.toBeInTheDocument();
	});

	test("can be another element", () => {
		const { container } = render(
			<Section
				as="article"
				title="Budget"
			>
				Body
			</Section>,
		);

		expect(container.firstElementChild?.tagName).toBe("ARTICLE");
	});

	test("puts the caller's classes on the root element, after its own", () => {
		const { container } = render(
			<Section className="h-full p-3.5">Body</Section>,
		);

		expect(container.firstElementChild).toHaveClass("p-3.5", "h-full");
		expect(container.firstElementChild).not.toHaveClass("px-6");
	});
});
