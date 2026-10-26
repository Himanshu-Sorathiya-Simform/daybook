import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, test, vi } from "vitest";

import { Toaster } from "@/components/feedback/Toaster";
import { dismissToast, showToast } from "@/components/feedback/showToast";

afterEach(() => {
	vi.useRealTimers();
	act(() => {
		toast.dismiss();
	});
});

function show(...args: Parameters<typeof showToast>) {
	let id: string | number = "";
	act(() => {
		id = showToast(...args);
	});
	return id;
}

describe("showToast", () => {
	test("shows the message in the toaster", async () => {
		render(<Toaster />);

		show("Demo data added.");

		expect(await screen.findByText("Demo data added.")).toBeVisible();
	});

	test("returns an id, and a different one for each toast", () => {
		render(<Toaster />);

		const first = show("One");
		const second = show("Two");

		expect(["string", "number"]).toContain(typeof first);
		expect(first).not.toBe(second);
	});

	test("shows no button without an action", async () => {
		render(<Toaster />);

		show("Demo data added.");
		await screen.findByText("Demo data added.");

		expect(screen.queryByRole("button")).not.toBeInTheDocument();
	});

	test("shows an error with an alert icon, and a neutral toast without one", async () => {
		render(<Toaster />);

		show("Could not save.", { tone: "error" });
		show("Saved.");
		await screen.findByText("Saved.");

		expect(
			screen.getByText("Could not save.").parentElement?.querySelector("svg"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Saved.").parentElement?.querySelector("svg"),
		).toBeNull();
	});
});

describe("action", () => {
	test("runs onAction and closes the toast", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(<Toaster />);
		show("Insight dismissed.", { action: "Undo", onAction });

		await user.click(await screen.findByRole("button", { name: "Undo" }));

		expect(onAction).toHaveBeenCalledOnce();
		await waitFor(() =>
			expect(screen.queryByText("Insight dismissed.")).not.toBeInTheDocument(),
		);
	});

	test("closes the toast even when there is no onAction", async () => {
		const user = userEvent.setup();
		render(<Toaster />);
		show("Saved. It's hidden by your filters.", { action: "Show" });

		await user.click(await screen.findByRole("button", { name: "Show" }));

		await waitFor(() =>
			expect(
				screen.queryByText("Saved. It's hidden by your filters."),
			).not.toBeInTheDocument(),
		);
	});

	test("works from the keyboard", async () => {
		const user = userEvent.setup();
		const onAction = vi.fn();
		render(<Toaster />);
		show("Deleted.", { action: "Undo", onAction });
		const button = await screen.findByRole("button", { name: "Undo" });

		button.focus();
		await user.keyboard("{Enter}");

		expect(onAction).toHaveBeenCalledOnce();
	});

	test("only the toast whose button was pressed closes", async () => {
		const user = userEvent.setup();
		render(<Toaster />);
		show("First", { action: "Undo first" });
		show("Second", { action: "Undo second" });

		await user.click(await screen.findByRole("button", { name: "Undo first" }));

		await waitFor(() =>
			expect(screen.queryByText("First")).not.toBeInTheDocument(),
		);
		expect(screen.getByText("Second")).toBeVisible();
	});
});

describe("how long it stays", () => {
	test("closes by itself after five seconds by default", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<Toaster />);
		show("Saved.");
		await screen.findByText("Saved.");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(4000);
		});
		expect(screen.getByText("Saved.")).toBeVisible();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		await waitFor(() =>
			expect(screen.queryByText("Saved.")).not.toBeInTheDocument(),
		);
	});

	test("stays as long as the caller says", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<Toaster />);
		show("Held.", { duration: 20_000 });
		await screen.findByText("Held.");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(10_000);
		});
		expect(screen.getByText("Held.")).toBeVisible();

		await act(async () => {
			await vi.advanceTimersByTimeAsync(11_000);
		});
		await waitFor(() =>
			expect(screen.queryByText("Held.")).not.toBeInTheDocument(),
		);
	});

	test("can be a short one", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		render(<Toaster />);
		show("Quick.", { duration: 1000 });
		await screen.findByText("Quick.");

		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});

		await waitFor(() =>
			expect(screen.queryByText("Quick.")).not.toBeInTheDocument(),
		);
	});
});

describe("dismissToast", () => {
	test("closes a toast early by its id", async () => {
		render(<Toaster />);
		const id = show("Saved.", { duration: 60_000 });
		expect(await screen.findByText("Saved.")).toBeVisible();

		act(() => dismissToast(id));

		await waitFor(() =>
			expect(screen.queryByText("Saved.")).not.toBeInTheDocument(),
		);
	});

	test("closes only that toast", async () => {
		render(<Toaster />);
		const first = show("First", { duration: 60_000 });
		show("Second", { duration: 60_000 });
		await screen.findByText("Second");

		act(() => dismissToast(first));

		await waitFor(() =>
			expect(screen.queryByText("First")).not.toBeInTheDocument(),
		);
		expect(screen.getByText("Second")).toBeVisible();
	});

	test("does nothing for an id that is already gone", () => {
		render(<Toaster />);

		expect(() => act(() => dismissToast("no-such-toast"))).not.toThrow();
	});
});
