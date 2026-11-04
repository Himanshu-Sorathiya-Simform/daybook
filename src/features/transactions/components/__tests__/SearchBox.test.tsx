import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { SEARCH_COMMIT_MS, SearchBox, type SearchBoxProps } from "../SearchBox";

beforeEach(() => {
	vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

/** The box over a committed search that, like the URL, takes what the box commits. */
function renderBox(props: Partial<SearchBoxProps> = {}) {
	const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
	const onCommit = vi.fn();
	let setQ: (q: string | undefined) => void = () => {};
	function Harness() {
		const [q, set] = useState(props.q);
		setQ = set;
		return (
			<>
				<input aria-label="Note" />
				<SearchBox
					currency="INR"
					{...props}
					q={q}
					onCommit={(next) => {
						onCommit(next);
						set(next);
					}}
				/>
			</>
		);
	}
	const view = render(<Harness />);
	return {
		...view,
		user,
		onCommit,
		setQ: (q: string | undefined) => act(() => setQ(q)),
	};
}

const box = () => screen.getByRole("searchbox", { name: "Search Transactions" });
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const message = () => screen.getByRole("status");

describe("the box", () => {
	test("is named for screen readers and says what it searches", () => {
		renderBox();

		expect(box()).toHaveAttribute("placeholder", "Search payee, note or amount");
		expect(box()).toHaveAttribute("aria-keyshortcuts", "/");
	});

	test("shows the committed search", () => {
		renderBox({ q: "swiggy" });

		expect(box()).toHaveValue("swiggy");
	});

	test("takes at most 100 characters", () => {
		renderBox();

		expect(box()).toHaveAttribute("maxLength", "100");
	});

	test("puts the caller's classes on its root", () => {
		const { container } = renderBox({ className: "flex-1" });

		expect(container.querySelector("div.flex-1")).toContainElement(box());
	});
});

describe("committing (BR-F03-38)", () => {
	// AC-F03-68
	test("commits 300 ms after typing stops, not before", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "swiggy");
		// The clock also moves with real time, so the boundary keeps a small margin.
		await wait(SEARCH_COMMIT_MS - 50);
		expect(onCommit).not.toHaveBeenCalled();
		await wait(50);

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("swiggy");
	});

	test("each key restarts the wait, so only the last text is committed", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "swi");
		await wait(200);
		await user.type(box(), "g");
		await wait(200);
		expect(onCommit).not.toHaveBeenCalled();
		await wait(100);

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("swig");
	});

	// AC-F03-68
	test("Enter commits at once, and nothing more after the wait", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "uber{Enter}");
		expect(onCommit).toHaveBeenCalledExactlyOnceWith("uber");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).toHaveBeenCalledTimes(1);
	});

	test("commits the text trimmed and in NFC", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "  café  {Enter}");

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("café");
	});

	test("the same search as the committed one commits nothing", async () => {
		const { user, onCommit } = renderBox({ q: "swiggy" });

		await user.type(box(), " {Enter}");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
	});

	test("an amount under 3 characters commits, since it matches amounts (BR-F03-35)", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "12");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("12");
	});

	test("an amount in the user's format commits as typed", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "1,240.50{Enter}");

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("1,240.50");
	});

	test("a pending commit is dropped when the box goes away", async () => {
		const { user, onCommit, unmount } = renderBox();

		await user.type(box(), "swiggy");
		unmount();
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
	});
});

describe("clearing (BR-F03-38, BR-F03-39)", () => {
	// AC-F03-68
	test("the clear button commits no search at once, exactly once", async () => {
		const { user, onCommit } = renderBox({ q: "swiggy" });

		await user.click(screen.getByRole("button", { name: /Clear/ }));

		expect(onCommit).toHaveBeenCalledExactlyOnceWith(undefined);
		expect(box()).toHaveValue("");
		await wait(SEARCH_COMMIT_MS);
		expect(onCommit).toHaveBeenCalledTimes(1);
	});

	test("Escape clears the draft, commits no search once, and leaves the box", async () => {
		const { user, onCommit } = renderBox({ q: "swiggy" });

		box().focus();
		await user.keyboard("{Escape}");

		expect(onCommit).toHaveBeenCalledExactlyOnceWith(undefined);
		expect(box()).toHaveValue("");
		expect(box()).not.toHaveFocus();
	});

	test("deleting every character commits no search at once", async () => {
		const { user, onCommit } = renderBox({ q: "uber" });

		await user.clear(box());

		expect(onCommit).toHaveBeenCalledExactlyOnceWith(undefined);
	});

	test("only spaces count as empty and commit no search at once", async () => {
		const { user, onCommit } = renderBox({ q: "uber" });

		await user.clear(box());
		onCommit.mockClear();
		await user.type(box(), "   ");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
	});

	test("clearing a draft that was never committed commits nothing", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "sw");
		await user.clear(box());
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
	});

	test("clearing cancels a commit still waiting", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "swiggy");
		await user.clear(box());
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
	});
});

describe("too short (BR-F03-34, section 8)", () => {
	// AC-F03-68
	test("two letters are never committed; the message shows once typing stops", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "sw");
		expect(message()).toHaveClass("sr-only");
		expect(message()).toBeEmptyDOMElement();
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
		expect(message()).toHaveTextContent(
			"Type at least 3 characters, or an amount.",
		);
		expect(message()).not.toHaveClass("sr-only");
		expect(box()).toHaveAccessibleDescription(
			"Type at least 3 characters, or an amount.",
		);
	});

	test("Enter on two letters shows the message at once and commits nothing", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "sw{Enter}");

		expect(onCommit).not.toHaveBeenCalled();
		expect(message()).toHaveTextContent(
			"Type at least 3 characters, or an amount.",
		);
	});

	test("the committed search stays while the draft is too short", async () => {
		const { user, onCommit } = renderBox({ q: "swiggy" });

		await user.clear(box());
		onCommit.mockClear();
		await user.type(box(), "sw");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).not.toHaveBeenCalled();
	});

	test("typing again hides the message, and a third letter commits", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "sw");
		await wait(SEARCH_COMMIT_MS);
		await user.type(box(), "i");
		expect(message()).toBeEmptyDOMElement();
		expect(box()).not.toHaveAttribute("aria-describedby");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("swi");
		expect(message()).toBeEmptyDOMElement();
	});

	test("a status region is always there, so the message is read out when it appears", () => {
		renderBox();

		expect(message()).toBeInTheDocument();
	});
});

describe("following the committed search", () => {
	test("a search removed elsewhere, as by its chip, empties the box", async () => {
		const { setQ } = renderBox({ q: "swiggy" });

		await setQ(undefined);

		expect(box()).toHaveValue("");
	});

	test("a search set elsewhere replaces the draft and hides the message", async () => {
		const { user, setQ } = renderBox();

		await user.type(box(), "sw");
		await wait(SEARCH_COMMIT_MS);
		await setQ("uber");

		expect(box()).toHaveValue("uber");
		expect(message()).toBeEmptyDOMElement();
	});

	test("its own commit keeps the draft as typed, spaces included", async () => {
		const { user, onCommit } = renderBox();

		await user.type(box(), "swiggy ");
		await wait(SEARCH_COMMIT_MS);

		expect(onCommit).toHaveBeenCalledExactlyOnceWith("swiggy");
		expect(box()).toHaveValue("swiggy ");
	});
});

describe("the / key", () => {
	test("focuses the box from the page", async () => {
		const { user } = renderBox();

		await user.keyboard("/");

		expect(box()).toHaveFocus();
		expect(box()).toHaveValue("");
	});

	test("types a slash inside another text field", async () => {
		const { user } = renderBox();

		await user.click(screen.getByRole("textbox", { name: "Note" }));
		await user.keyboard("/");

		expect(screen.getByRole("textbox", { name: "Note" })).toHaveValue("/");
		expect(box()).not.toHaveFocus();
	});

	test("types a slash inside the box itself", async () => {
		const { user } = renderBox();

		await user.click(box());
		await user.keyboard("1/2");

		expect(box()).toHaveValue("1/2");
	});
});

describe("offline (section 10)", () => {
	test("the box is disabled and says search needs a connection", () => {
		renderBox({ isOffline: true });

		expect(box()).toBeDisabled();
		expect(box()).toHaveAttribute("placeholder", "Search needs a connection");
	});

	test("the / key does nothing", async () => {
		const { user } = renderBox({ isOffline: true });

		await user.keyboard("/");

		expect(box()).not.toHaveFocus();
	});
});
