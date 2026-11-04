import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { SearchField, type SearchFieldProps } from "@/components/forms/SearchField";

function renderSearch(props: Partial<SearchFieldProps> = {}) {
	const user = userEvent.setup();
	const view = render(
		<>
			<SearchField
				label="Search Transactions"
				placeholder="Search payee, note or amount"
				{...props}
			/>
			<button type="button">After</button>
		</>,
	);
	const box = screen.getByRole("searchbox", { name: "Search Transactions" });
	return { ...view, user, box: box as HTMLInputElement };
}

const clearButton = () => screen.queryByRole("button", { name: "Clear search" });

/** Listens for keys that reach the page, as the page's shortcuts do. */
function pageKeys() {
	const keys: string[] = [];
	const listener = (event: KeyboardEvent) => keys.push(event.key);
	window.addEventListener("keydown", listener);
	cleanups.push(() => window.removeEventListener("keydown", listener));
	return keys;
}
const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
});

describe("the box", () => {
	test("is a search box named by its label, which is not shown", () => {
		const { box } = renderSearch();

		expect(box).toHaveAttribute("type", "search");
		expect(screen.getByText("Search Transactions")).toHaveClass("sr-only");
	});

	test("shows the placeholder", () => {
		const { box } = renderSearch();

		expect(box).toHaveAttribute("placeholder", "Search payee, note or amount");
	});

	test("has no placeholder when none is given", () => {
		const { box } = renderSearch({ placeholder: undefined } as never);

		expect(box).not.toHaveAttribute("placeholder");
	});

	test("starts empty and takes typing", async () => {
		const onChange = vi.fn();
		const { user, box } = renderSearch({ onChange });

		expect(box).toHaveValue("");
		await user.type(box, "swi");

		expect(box).toHaveValue("swi");
		expect(onChange.mock.calls.map(([value]) => value)).toEqual([
			"s",
			"sw",
			"swi",
		]);
	});

	test("shows a search icon, hidden from screen readers", () => {
		const { box } = renderSearch();

		const icon = box.parentElement!.querySelector("svg");
		expect(icon).toHaveClass("lucide-search");
		expect(icon).toHaveAttribute("aria-hidden", "true");
	});

	test("is at least 16px on touch screens, so iOS does not zoom (D-408)", () => {
		const { box } = renderSearch();

		expect(box).toHaveClass("pointer-coarse:text-base");
	});

	test("hides the browser's own clear button, so only ours shows", () => {
		const { box } = renderSearch();

		expect(box).toHaveClass("[&::-webkit-search-cancel-button]:hidden");
	});

	test("is 44px tall on phones", () => {
		const { box } = renderSearch();

		expect(box.parentElement).toHaveClass("h-9.5", "max-md:min-h-11");
	});

	test("takes the caller's classes on the root", () => {
		const { container } = renderSearch({ className: "flex-1 basis-55" });

		expect(container.firstElementChild).toHaveClass(
			"flex-1",
			"basis-55",
			"flex",
		);
	});
});

describe("Enter", () => {
	test("submits the text", async () => {
		const onSubmit = vi.fn();
		const { user, box } = renderSearch({ onSubmit });

		await user.type(box, "swiggy{Enter}");

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith("swiggy");
		expect(box).toHaveValue("swiggy");
		expect(box).toHaveFocus();
	});

	test("submits an empty box too, so the page can drop its search", async () => {
		const onSubmit = vi.fn();
		const { user, box } = renderSearch({ onSubmit });

		await user.type(box, "{Enter}");

		expect(onSubmit).toHaveBeenCalledExactlyOnceWith("");
	});

	test("does not also submit a form around it", async () => {
		const onSubmit = vi.fn();
		const formSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
		const user = userEvent.setup();
		render(
			<form onSubmit={(event) => formSubmit(event.nativeEvent as SubmitEvent)}>
				<SearchField
					label="Search Transactions"
					onSubmit={onSubmit}
				/>
			</form>,
		);

		await user.type(screen.getByRole("searchbox"), "a{Enter}");

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(formSubmit).not.toHaveBeenCalled();
	});
});

describe("Escape", () => {
	test("clears the text, reports it and leaves the box", async () => {
		const onClear = vi.fn();
		const onChange = vi.fn();
		const { user, box } = renderSearch({ onClear, onChange });
		await user.type(box, "swiggy");

		await user.keyboard("{Escape}");

		expect(box).toHaveValue("");
		expect(onClear).toHaveBeenCalledOnce();
		expect(onChange).toHaveBeenLastCalledWith("");
		expect(box).not.toHaveFocus();
	});

	test("in an empty box leaves the box and clears nothing", async () => {
		const onClear = vi.fn();
		const { user, box } = renderSearch({ onClear });
		await user.click(box);

		await user.keyboard("{Escape}");

		expect(box).not.toHaveFocus();
		expect(onClear).not.toHaveBeenCalled();
	});

	test("in an empty box goes on to the page, which may use it", async () => {
		const keys = pageKeys();
		const { user, box } = renderSearch();
		await user.click(box);

		await user.keyboard("{Escape}");

		expect(keys).toContain("Escape");
	});

	test("that clears text stops there, so the page does not also act on it", async () => {
		const keys = pageKeys();
		const { user, box } = renderSearch();
		await user.type(box, "a");

		await user.keyboard("{Escape}");

		expect(keys).not.toContain("Escape");
	});

	test("does not submit", async () => {
		const onSubmit = vi.fn();
		const { user, box } = renderSearch({ onSubmit });
		await user.type(box, "a");

		await user.keyboard("{Escape}");

		expect(onSubmit).not.toHaveBeenCalled();
	});
});

describe("other keys", () => {
	test("go on to the page as well", async () => {
		const keys = pageKeys();
		const { user, box } = renderSearch();

		await user.type(box, "n/");

		expect(keys).toEqual(expect.arrayContaining(["n", "/"]));
	});

	test("reach the caller's own key handler, Escape included", async () => {
		const onKeyDown = vi.fn();
		const { user, box } = renderSearch({ onKeyDown });

		await user.type(box, "a{Escape}");

		expect(onKeyDown.mock.calls.map(([event]) => event.key)).toEqual([
			"a",
			"Escape",
		]);
	});
});

describe("clear button", () => {
	test("is not there while the box is empty", () => {
		renderSearch();

		expect(clearButton()).toBeNull();
	});

	test("shows once there is text, named Clear search, with its icon hidden", async () => {
		const { user, box } = renderSearch();

		await user.type(box, "a");

		expect(clearButton()).toBeVisible();
		expect(clearButton()!.querySelector("svg")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	test("clears the text, reports it, keeps focus in the box and goes away", async () => {
		const onClear = vi.fn();
		const { user, box } = renderSearch({ onClear });
		await user.type(box, "swiggy");

		await user.click(clearButton()!);

		expect(box).toHaveValue("");
		expect(onClear).toHaveBeenCalledOnce();
		expect(box).toHaveFocus();
		expect(clearButton()).toBeNull();
	});

	test("is left out of the Tab order, since Escape does the same", async () => {
		const { user, box } = renderSearch();
		await user.type(box, "a");

		await user.tab();

		expect(screen.getByRole("button", { name: "After" })).toHaveFocus();
	});

	test("is 44px on phones", async () => {
		const { user, box } = renderSearch();
		await user.type(box, "a");

		expect(clearButton()).toHaveClass("max-md:size-11");
	});
});

describe("key hint", () => {
	test("shows the key as a key cap while the box is empty, hidden from screen readers", () => {
		renderSearch({ shortcut: "/" });

		const kbd = screen.getByText("/", { selector: "kbd" });
		expect(kbd).toHaveAttribute("aria-hidden", "true");
	});

	test("tells screen readers the key through the box itself", () => {
		const { box } = renderSearch({ shortcut: "/" });

		expect(box).toHaveAttribute("aria-keyshortcuts", "/");
	});

	test("makes way for the clear button once there is text, and comes back when cleared", async () => {
		const { user, box } = renderSearch({ shortcut: "/" });

		await user.type(box, "a");
		expect(document.querySelector("kbd")).toBeNull();

		await user.keyboard("{Escape}");
		expect(document.querySelector("kbd")).toHaveTextContent("/");
	});

	test("is not there without a shortcut", () => {
		const { box } = renderSearch();

		expect(document.querySelector("kbd")).toBeNull();
		expect(box).not.toHaveAttribute("aria-keyshortcuts");
	});

	test("is only a hint: the key types into the box like any other", async () => {
		const { user, box } = renderSearch({ shortcut: "/" });

		await user.type(box, "1/2");

		expect(box).toHaveValue("1/2");
	});
});

describe("disabled", () => {
	test("cannot be typed into and shows its own placeholder", async () => {
		const { user, box } = renderSearch({
			isDisabled: true,
			disabledPlaceholder: "Search needs a connection",
		});

		await user.type(box, "a");

		expect(box).toBeDisabled();
		expect(box).toHaveValue("");
		expect(box).toHaveAttribute("placeholder", "Search needs a connection");
		expect(box.parentElement).toHaveAttribute("data-disabled", "true");
	});

	test("keeps the usual placeholder when it has no disabled one", () => {
		const { box } = renderSearch({ isDisabled: true });

		expect(box).toHaveAttribute("placeholder", "Search payee, note or amount");
	});

	test("the disabled placeholder shows only while disabled", () => {
		const { box } = renderSearch({
			disabledPlaceholder: "Search needs a connection",
		});

		expect(box).toHaveAttribute("placeholder", "Search payee, note or amount");
	});

	test("hides the key hint, since the key cannot focus it", () => {
		renderSearch({ isDisabled: true, shortcut: "/" });

		expect(document.querySelector("kbd")).toBeNull();
	});

	test("with text in it, the clear button does nothing", async () => {
		const onClear = vi.fn();
		const { user, box } = renderSearch({
			isDisabled: true,
			defaultValue: "swiggy",
			onClear,
		});

		const button = screen.getByRole("button", { name: "Clear search" });
		expect(button).toBeDisabled();
		await user.click(button);

		expect(box).toHaveValue("swiggy");
		expect(onClear).not.toHaveBeenCalled();
	});

	test("comes back to life when enabled again", async () => {
		const { user, box, rerender } = renderSearch({ isDisabled: true });

		rerender(
			<SearchField
				label="Search Transactions"
				placeholder="Search payee, note or amount"
			/>,
		);
		await user.type(box, "a");

		expect(box).toBeEnabled();
		expect(box).toHaveValue("a");
	});
});

describe("value", () => {
	test("starts from defaultValue", () => {
		const { box } = renderSearch({ defaultValue: "swiggy" });

		expect(box).toHaveValue("swiggy");
		expect(clearButton()).toBeVisible();
	});

	test("follows a controlled value, and the parent decides what Escape leaves", async () => {
		const user = userEvent.setup();
		function Host() {
			const [value, setValue] = useState("netflix");
			return (
				<>
					<SearchField
						label="Search Transactions"
						value={value}
						onChange={setValue}
					/>
					<button
						type="button"
						onClick={() => setValue("zomato")}
					>
						Set
					</button>
				</>
			);
		}
		render(<Host />);
		const box = screen.getByRole("searchbox");
		expect(box).toHaveValue("netflix");

		await user.click(screen.getByRole("button", { name: "Set" }));
		expect(box).toHaveValue("zomato");

		await user.click(box);
		await user.keyboard("{Escape}");
		expect(box).toHaveValue("");
	});

	test("a controlled value the parent keeps does not change with typing", async () => {
		const onChange = vi.fn();
		const { user, box } = renderSearch({ value: "fixed", onChange });

		await user.type(box, "x");

		expect(box).toHaveValue("fixed");
		expect(onChange).toHaveBeenCalledWith("fixedx");
	});
});

describe("inputRef", () => {
	test("points at the box, so a shortcut can focus it", async () => {
		const ref = createRef<HTMLInputElement>();
		const { box } = renderSearch({ inputRef: ref });

		expect(ref.current).toBe(box);
		ref.current!.focus();
		await waitFor(() => expect(box).toHaveFocus());
	});
});
