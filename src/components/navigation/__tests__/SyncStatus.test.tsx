import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";

import { SyncStatus, type SyncState } from "@/components/navigation/SyncStatus";

const STATES: SyncState[] = ["saved", "saving", "waiting", "attention", "paused"];

describe("wording (P1, BR-P1-24)", () => {
	test.each([
		["saved", 0, "All changes saved", ""],
		["saved", 5, "All changes saved", ""],
		["saving", 3, "Saving 3 changes…", "Saving 3"],
		["saving", 1, "Saving 1 change…", "Saving 1"],
		["saving", 120, "Saving 120 changes…", "Saving 120"],
		["waiting", 3, "3 changes waiting to sync", "3 waiting"],
		["waiting", 1, "1 change waiting to sync", "1 waiting"],
		["attention", 2, "2 changes need attention", "2 need attention"],
		["attention", 1, "1 change needs attention", "1 needs attention"],
		["paused", 1, "Saving paused. Log in to continue.", "Paused"],
		["paused", 0, "Saving paused. Log in to continue.", "Paused"],
	] as [SyncState, number, string, string][])(
		"%s with %i is named %j and shows %j",
		(state, count, name, visible) => {
			render(
				<SyncStatus
					state={state}
					count={count}
				/>,
			);

			expect(screen.getByRole("button", { name })).toHaveTextContent(visible);
			if (!visible)
				expect(screen.getByRole("button", { name })).toHaveTextContent("");
		},
	);

	test("is paused for an update when the app must be updated", () => {
		render(
			<SyncStatus
				state="paused"
				pausedReason="update"
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Update to keep saving." }),
		).toHaveTextContent("Paused");
	});

	test("is paused for a login by default and when asked", () => {
		const { rerender } = render(<SyncStatus state="paused" />);
		expect(
			screen.getByRole("button", {
				name: "Saving paused. Log in to continue.",
			}),
		).toBeVisible();

		rerender(
			<SyncStatus
				state="paused"
				pausedReason="login"
			/>,
		);
		expect(
			screen.getByRole("button", {
				name: "Saving paused. Log in to continue.",
			}),
		).toBeVisible();
	});

	test("ignores the paused reason in other states", () => {
		render(
			<SyncStatus
				state="waiting"
				count={2}
				pausedReason="update"
			/>,
		);

		expect(
			screen.getByRole("button", { name: "2 changes waiting to sync" }),
		).toBeVisible();
	});

	test("is saved, with no count, by default", () => {
		render(<SyncStatus />);

		expect(
			screen.getByRole("button", { name: "All changes saved" }),
		).toBeVisible();
	});
});

describe("look", () => {
	test.each(STATES)("%s has a decorative icon", (state) => {
		render(
			<SyncStatus
				state={state}
				count={2}
			/>,
		);

		expect(screen.getByRole("button").querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("gives every state its own icon", () => {
		const icons = STATES.map((state) => {
			const { container, unmount } = render(
				<SyncStatus
					state={state}
					count={2}
				/>,
			);
			const icon = container
				.querySelector("svg")!
				.getAttribute("class")!
				.match(/lucide-[\w-]+/)![0];
			unmount();
			return icon;
		});

		expect(new Set(icons).size).toBe(5);
	});

	test("saved is a green icon alone, a round 34px button", () => {
		render(<SyncStatus />);

		expect(screen.getByRole("button")).toHaveClass(
			"text-pos",
			"rounded-full",
			"h-8.5",
			"min-w-8.5",
			"px-0",
		);
	});

	test("with text it has side padding", () => {
		render(
			<SyncStatus
				state="waiting"
				count={3}
			/>,
		);

		expect(screen.getByRole("button")).toHaveClass("px-3");
		expect(screen.getByRole("button")).not.toHaveClass("px-0");
	});

	test("waiting is a dashed outline, so it is not colour alone", () => {
		render(
			<SyncStatus
				state="waiting"
				count={3}
			/>,
		);

		expect(screen.getByRole("button")).toHaveClass(
			"border-dashed",
			"border-edge",
			"text-ink-2",
		);
	});

	test("attention is the inverse, high-contrast pill", () => {
		render(
			<SyncStatus
				state="attention"
				count={2}
			/>,
		);

		expect(screen.getByRole("button")).toHaveClass(
			"bg-ink",
			"text-page",
			"border-ink",
		);
	});

	test("saving is a soft pill with a spinning icon that stops for reduced motion", () => {
		render(
			<SyncStatus
				state="saving"
				count={2}
			/>,
		);

		expect(screen.getByRole("button")).toHaveClass("bg-soft");
		expect(screen.getByRole("button").querySelector("svg")).toHaveClass(
			"animate-spin",
			"motion-reduce:animate-none",
		);
	});

	test.each(STATES.filter((state) => state !== "saving"))(
		"%s has a still icon",
		(state) => {
			render(
				<SyncStatus
					state={state}
					count={2}
				/>,
			);

			expect(screen.getByRole("button").querySelector("svg")).not.toHaveClass(
				"animate-spin",
			);
		},
	);

	test("paused is a plain outlined pill", () => {
		render(<SyncStatus state="paused" />);

		expect(screen.getByRole("button")).toHaveClass(
			"border-line-strong",
			"bg-page",
			"text-ink",
		);
	});

	test("is 44px on phones", () => {
		render(<SyncStatus />);

		expect(screen.getByRole("button")).toHaveClass(
			"max-md:h-11",
			"max-md:min-w-11",
		);
	});

	test("takes the caller's classes", () => {
		render(<SyncStatus className="ml-2" />);

		expect(screen.getByRole("button")).toHaveClass("ml-2", "rounded-full");
	});
});

describe("opening the sync panel", () => {
	test.each(STATES)(
		"%s opens it with the mouse, Enter and Space",
		async (state) => {
			const user = userEvent.setup();
			const onOpen = vi.fn();
			render(
				<SyncStatus
					state={state}
					count={2}
					onOpen={onOpen}
				/>,
			);

			await user.click(screen.getByRole("button"));
			await user.keyboard("{Enter}");
			await user.keyboard(" ");

			expect(onOpen).toHaveBeenCalledTimes(3);
		},
	);

	test("does not fail when pressed without a handler", async () => {
		const user = userEvent.setup();
		render(<SyncStatus />);

		await user.click(screen.getByRole("button"));

		expect(screen.getByRole("button")).toBeVisible();
	});

	test("is reached with Tab", async () => {
		const user = userEvent.setup();
		render(<SyncStatus />);

		await user.tab();

		expect(screen.getByRole("button")).toHaveFocus();
	});
});

describe("announcing", () => {
	test("reads the full sentence politely in a status region", () => {
		render(
			<SyncStatus
				state="attention"
				count={2}
			/>,
		);

		expect(screen.getByRole("status")).toHaveTextContent(
			"2 changes need attention",
		);
		expect(screen.getByRole("status")).toHaveClass("sr-only");
	});

	test("updates the announcement when the state changes", () => {
		const { rerender } = render(
			<SyncStatus
				state="waiting"
				count={3}
			/>,
		);
		expect(screen.getByRole("status")).toHaveTextContent(
			"3 changes waiting to sync",
		);

		rerender(<SyncStatus state="saved" />);

		expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
	});

	test("updates the name and the text with the count", () => {
		const { rerender } = render(
			<SyncStatus
				state="waiting"
				count={3}
			/>,
		);

		rerender(
			<SyncStatus
				state="waiting"
				count={4}
			/>,
		);

		expect(
			screen.getByRole("button", { name: "4 changes waiting to sync" }),
		).toHaveTextContent("4 waiting");
	});
});

describe("tooltip", () => {
	test.each(STATES)(
		"%s shows the full sentence on keyboard focus",
		async (state) => {
			const user = userEvent.setup();
			render(
				<SyncStatus
					state={state}
					count={3}
				/>,
			);

			await user.tab();

			const tip = await screen.findByRole("tooltip");
			expect(tip).toHaveTextContent(
				screen.getByRole("button").getAttribute("aria-label")!,
			);
			expect(tip).toHaveAttribute("data-placement", "bottom");
		},
	);
});
