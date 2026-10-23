import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import Home from "./page";

test("home page renders an empty main landmark", () => {
	const { getByRole } = render(<Home />);

	expect(getByRole("main")).toBeInTheDocument();
});
