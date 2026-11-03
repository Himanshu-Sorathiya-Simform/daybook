import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { StrengthMeter } from "../StrengthMeter";

const filledBars = (container: HTMLElement) =>
	[...container.querySelectorAll('[aria-hidden="true"] > span')].filter(
		(bar) => !bar.classList.contains("bg-track"),
	);

describe("StrengthMeter (BR-F01-04, D-509)", () => {
	test("shows nothing while the password is empty", () => {
		const { container } = render(
			<StrengthMeter
				password=""
				userInputs={[]}
			/>,
		);
		expect(container.textContent).toBe("");
	});

	test.each([
		["password", "Weak", 1, "bg-neg"],
		["mangoes2026", "Fair", 2, "bg-accent"],
		["Kolkata2026!", "Good", 3, "bg-accent"],
		["correct horse battery staple", "Strong", 4, "bg-pos"],
	])("%j is %s, with %i of 4 bars", async (password, label, filled, tone) => {
		const { container } = render(
			<StrengthMeter
				password={password}
				userInputs={[]}
			/>,
		);
		expect(
			await screen.findByText(`Password strength: ${label}`),
		).toBeInTheDocument();
		const bars = filledBars(container);
		expect(bars).toHaveLength(filled);
		for (const bar of bars) expect(bar).toHaveClass(tone);
		expect(
			container.querySelectorAll('[aria-hidden="true"] > span'),
		).toHaveLength(4);
	});

	test("the user's own email and name count against the password", async () => {
		const { rerender } = render(
			<StrengthMeter
				password="asha1234asha"
				userInputs={[]}
			/>,
		);
		expect(
			await screen.findByText("Password strength: Strong"),
		).toBeInTheDocument();
		rerender(
			<StrengthMeter
				password="asha1234asha"
				userInputs={["asha@example.com", "Asha"]}
			/>,
		);
		expect(
			await screen.findByText("Password strength: Good"),
		).toBeInTheDocument();
	});

	test("follows the password as it changes, and clears when it is emptied", async () => {
		const { rerender, container } = render(
			<StrengthMeter
				password="password"
				userInputs={[]}
			/>,
		);
		await screen.findByText("Password strength: Weak");
		rerender(
			<StrengthMeter
				password="correct horse battery staple"
				userInputs={[]}
			/>,
		);
		expect(
			await screen.findByText("Password strength: Strong"),
		).toBeInTheDocument();
		rerender(
			<StrengthMeter
				password=""
				userInputs={[]}
			/>,
		);
		expect(container.textContent).toBe("");
	});

	test("is announced politely, and the bars are hidden from screen readers", async () => {
		const { container } = render(
			<StrengthMeter
				password="password"
				userInputs={[]}
			/>,
		);
		await screen.findByText("Password strength: Weak");
		expect(container.firstElementChild).toHaveAttribute("aria-live", "polite");
		expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
	});

	test("never shows a score worked out for an older password", async () => {
		const { rerender } = render(
			<StrengthMeter
				password="correct horse battery staple"
				userInputs={[]}
			/>,
		);
		await screen.findByText("Password strength: Strong");
		rerender(
			<StrengthMeter
				password="password"
				userInputs={[]}
			/>,
		);
		expect(
			screen.queryByText("Password strength: Strong"),
		).not.toBeInTheDocument();
		expect(
			await screen.findByText("Password strength: Weak"),
		).toBeInTheDocument();
	});

	test("adds the caller's classes", () => {
		const { container } = render(
			<StrengthMeter
				password=""
				userInputs={[]}
				className="mt-2"
			/>,
		);
		expect(container.firstElementChild).toHaveClass("mt-2", "flex");
	});
});

// zxcvbn-ts arrives as a separate download; this fakes that download failing (D-509).
describe("when zxcvbn-ts cannot be loaded", () => {
	afterEach(() => {
		vi.doUnmock("@zxcvbn-ts/core");
		vi.resetModules();
	});

	test("the meter shows nothing, and never throws", async () => {
		vi.doMock("@zxcvbn-ts/core", () => {
			throw new Error("chunk failed to load");
		});
		vi.resetModules();
		const fresh = await import("../StrengthMeter");
		const { container } = render(
			<fresh.StrengthMeter
				password="password"
				userInputs={[]}
			/>,
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(container.textContent).toBe("");
		expect(screen.queryByText(/Password strength/)).not.toBeInTheDocument();
	});
});

describe("a score that arrives late", () => {
	test("is dropped when the password changed while zxcvbn-ts was loading", async () => {
		// Fresh modules, so the dictionaries are not loaded yet and the first score arrives late.
		vi.resetModules();
		const fresh = await import("../StrengthMeter");
		const { rerender } = render(
			<fresh.StrengthMeter
				password="password"
				userInputs={[]}
			/>,
		);
		rerender(
			<fresh.StrengthMeter
				password="correct horse battery staple"
				userInputs={[]}
			/>,
		);
		expect(
			await screen.findByText("Password strength: Strong"),
		).toBeInTheDocument();
		expect(
			screen.queryByText("Password strength: Weak"),
		).not.toBeInTheDocument();
	});
});
