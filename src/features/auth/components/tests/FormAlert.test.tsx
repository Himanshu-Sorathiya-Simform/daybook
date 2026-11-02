import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { FormAlert } from "../FormAlert";

describe("FormAlert", () => {
	test("reads a refusal of the whole form out at once", () => {
		render(<FormAlert failure={{ form: "Email or password is incorrect." }} />);
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Email or password is incorrect.",
		);
	});

	test("shows nothing for a refusal of one field, which shows under that field", () => {
		const { container } = render(
			<FormAlert failure={{ field: "email", message: "Enter your email." }} />,
		);
		expect(container).toBeEmptyDOMElement();
	});

	test("shows nothing without a refusal", () => {
		const { container } = render(<FormAlert failure={null} />);
		expect(container).toBeEmptyDOMElement();
	});
});
