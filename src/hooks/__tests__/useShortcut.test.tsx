import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";

import { shortcutLabel, useShortcut } from "@/hooks/useShortcut";

function Page({
	onKey,
	enabled = true,
}: Readonly<{ onKey: () => void; enabled?: boolean }>) {
	useShortcut("N", onKey, { enabled });
	return (
		<>
			<input aria-label="Note" />
			<button type="button">Save</button>
		</>
	);
}

describe("useShortcut (D-171)", () => {
	test("calls back when the key is pressed on the page", async () => {
		const onKey = vi.fn();
		render(<Page onKey={onKey} />);

		await userEvent.setup().keyboard("n");

		expect(onKey).toHaveBeenCalledTimes(1);
	});

	test("never fires while a text field has focus", async () => {
		const onKey = vi.fn();
		render(<Page onKey={onKey} />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("textbox", { name: "Note" }));
		await user.keyboard("n");

		expect(onKey).not.toHaveBeenCalled();
		expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("n");
	});

	test("does nothing while disabled", async () => {
		const onKey = vi.fn();
		render(
			<Page
				onKey={onKey}
				enabled={false}
			/>,
		);

		await userEvent.setup().keyboard("n");

		expect(onKey).not.toHaveBeenCalled();
	});

	test("stops listening once the component is gone", async () => {
		const onKey = vi.fn();
		const { unmount } = render(<Page onKey={onKey} />);
		unmount();

		await userEvent.setup().keyboard("n");

		expect(onKey).not.toHaveBeenCalled();
	});

	test("ignores the key with a modifier it was not given", async () => {
		const onKey = vi.fn();
		render(<Page onKey={onKey} />);

		await userEvent.setup().keyboard("{Control>}n{/Control}");

		expect(onKey).not.toHaveBeenCalled();
	});
});

describe("shortcutLabel (BR-F03-48)", () => {
	afterEach(() => vi.restoreAllMocks());

	test("names Mod as Ctrl, with the key as a word, outside macOS", () => {
		vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");

		expect(shortcutLabel("Mod+Enter")).toBe("Ctrl Enter");
	});

	test("on Windows too", () => {
		vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");

		expect(shortcutLabel("Mod+Enter")).toBe("Ctrl Enter");
	});

	test("names Mod as ⌘ on macOS", () => {
		vi.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");

		expect(shortcutLabel("Mod+Enter")).toBe("⌘ Enter");
	});

	test("a single key reads as itself", () => {
		expect(shortcutLabel("N")).toBe("N");
	});
});
