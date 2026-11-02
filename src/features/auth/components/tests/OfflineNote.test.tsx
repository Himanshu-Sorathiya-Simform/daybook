import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { OfflineNote } from "../OfflineNote";

describe("OfflineNote (F01 section 6)", () => {
	test("offline, says so politely", () => {
		render(<OfflineNote online={false} />);
		expect(screen.getByRole("status")).toHaveTextContent(
			"You are offline. Connect to log in.",
		);
	});

	test("online, shows nothing", () => {
		const { container } = render(<OfflineNote online />);
		expect(container).toBeEmptyDOMElement();
	});
});
