import { act, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { neighbourOf, useFocusAfterRemove } from "../useFocusAfterRemove";

const IDS = ["a", "b", "c"];

function Rows({
	ids = IDS,
	onReady,
}: {
	ids?: string[];
	onReady: (focusRow: (id: string) => void) => void;
}) {
	const area = useRef<HTMLDivElement>(null);
	const { focusRow } = useFocusAfterRemove(area);
	onReady(focusRow);
	return (
		<div ref={area}>
			{ids.map((id) => (
				<div
					key={id}
					role="row"
					tabIndex={-1}
					data-key={id}
				>
					Row {id}
				</div>
			))}
		</div>
	);
}

const row = (id: string) => screen.getByText(`Row ${id}`);

afterEach(() => {
	vi.useRealTimers();
	document.body.innerHTML = "";
});

describe("neighbourOf (BR-F03-73)", () => {
	function list() {
		const area = document.createElement("div");
		for (const id of IDS) {
			const each = document.createElement("div");
			each.setAttribute("role", "row");
			each.dataset["key"] = id;
			area.append(each);
		}
		return area;
	}

	test("is the row after, else the one before", () => {
		expect(neighbourOf(list(), "a")).toBe("b");
		expect(neighbourOf(list(), "b")).toBe("c");
		expect(neighbourOf(list(), "c")).toBe("b");
	});

	test("is null for a row that is not there, or with no list", () => {
		expect(neighbourOf(list(), "z")).toBeNull();
		expect(neighbourOf(null, "a")).toBeNull();
	});

	test("is null when the only row is the one deleted", () => {
		const area = document.createElement("div");
		const only = document.createElement("div");
		only.setAttribute("role", "row");
		only.dataset["key"] = "a";
		area.append(only);
		expect(neighbourOf(area, "a")).toBeNull();
	});
});

describe("useFocusAfterRemove (BR-F03-73)", () => {
	test("focuses the named row", () => {
		let focusRow: (id: string) => void = () => {};
		render(<Rows onReady={(fn) => (focusRow = fn)} />);
		act(() => focusRow("b"));
		expect(row("b")).toHaveFocus();
	});

	test("waits while a confirm is still open, then focuses", async () => {
		vi.useFakeTimers({
			toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
		});
		const confirm = document.createElement("div");
		confirm.setAttribute("role", "alertdialog");
		document.body.append(confirm);
		let focusRow: (id: string) => void = () => {};
		render(<Rows onReady={(fn) => (focusRow = fn)} />);
		act(() => focusRow("c"));
		expect(row("c")).not.toHaveFocus();
		confirm.remove();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(50);
		});
		expect(row("c")).toHaveFocus();
	});

	test("gives up on a row that never comes", async () => {
		vi.useFakeTimers({
			toFake: ["requestAnimationFrame", "cancelAnimationFrame"],
		});
		let focusRow: (id: string) => void = () => {};
		render(<Rows onReady={(fn) => (focusRow = fn)} />);
		act(() => focusRow("zzz"));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		expect(document.activeElement).toBe(document.body);
	});
});
