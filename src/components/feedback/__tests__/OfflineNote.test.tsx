import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { OfflineNote } from "@/components/feedback/OfflineNote";

describe("OfflineNote", () => {
	test("says its text politely", () => {
		render(<OfflineNote>You are offline. Connect to finish setup.</OfflineNote>);
		expect(screen.getByRole("status")).toHaveTextContent(
			"You are offline. Connect to finish setup.",
		);
	});

	test("shows the offline icon in a soft box", () => {
		render(<OfflineNote>x</OfflineNote>);
		const note = screen.getByRole("status");
		expect(note).toHaveClass("bg-soft");
		expect(note.querySelector("svg")).toHaveClass("lucide-cloud-off");
	});

	test("takes the caller's classes last", () => {
		render(<OfflineNote className="mb-2">x</OfflineNote>);
		expect(screen.getByRole("status")).toHaveClass("bg-soft", "mb-2");
	});
});
