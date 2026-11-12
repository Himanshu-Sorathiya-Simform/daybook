import { onlineManager } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { StrictMode, useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/__tests__/helpers";
import { ok, route } from "../../hooks/__tests__/helpers";
import {
	GOLDEN_CATEGORIES,
	GOLDEN_PAYEES,
	named,
} from "../../lib/__tests__/fixtures";
import type { PayeeItem } from "../../lib/suggestions";
import { PayeeField, type PayeeFieldProps } from "../PayeeField";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	network.resetHandlers();
	vi.restoreAllMocks();
	onlineManager.setOnline(true);
});
afterAll(() => network.close());

/** The device's list, and the server's search answering `results`. */
function payees(list: PayeeItem[] = GOLDEN_PAYEES, results: PayeeItem[] = []) {
	return route(network, "get", "/api/payees", ({ path }) =>
		path.includes("?q=") ?
			ok({ items: results })
		:	ok({ items: list, categories: GOLDEN_CATEGORIES }),
	);
}

function renderField(props: Partial<PayeeFieldProps> = {}, start = "") {
	const onChoose = vi.fn();
	const changes: string[] = [];
	function Harness() {
		const [value, setValue] = useState(start);
		return (
			<PayeeField
				{...props}
				value={value}
				onChange={(next) => {
					changes.push(next);
					setValue(next);
				}}
				onChoose={(item) => {
					onChoose(item);
					setValue(item.payee);
				}}
			/>
		);
	}
	const view = renderInApp(<Harness />);
	return { ...view, onChoose, changes, user: userEvent.setup() };
}

const box = () => screen.getByRole("combobox", { name: "Payee" });
const list = () => screen.findByRole("listbox");
/** An option's words as read out: the avatar's initials are hidden from screen readers. */
const spoken = (element: Element) => {
	const copy = element.cloneNode(true) as Element;
	for (const hidden of copy.querySelectorAll('[aria-hidden="true"]'))
		hidden.remove();
	return copy.textContent;
};
const optionNames = (listbox: HTMLElement) =>
	within(listbox).getAllByRole("option").map(spoken);

describe("the suggestion list (BR-F03-45)", () => {
	// AC-F03-20
	test("focused while empty, lists Recent and frequent: the first 5 payees", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		const listbox = await list();

		expect(within(listbox).getByText("Recent and frequent")).toBeInTheDocument();
		await waitFor(() =>
			expect(optionNames(listbox)).toEqual([
				"SwiggyFood · 4 times",
				"Sunrise ApartmentsHousing · 3 times",
				"BigBasketFood · 2 times",
				"CromaShopping · 2 times",
				"NetflixEntertainment · 2 times",
			]),
		);
	});

	// AC-F03-20
	test("typing lists Matches, with Use “swi” as a new payee last", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("swi");
		const listbox = await list();

		expect(within(listbox).getByText("Matches")).toBeInTheDocument();
		await waitFor(() =>
			expect(optionNames(listbox)).toEqual([
				"SwiggyFood · 4 times",
				"Use “swi” as a new payee",
			]),
		);
	});

	test("a count of one reads in the singular", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("zom");

		const listbox = await list();
		await waitFor(() =>
			expect(
				within(listbox).getByRole("option", { name: /Zomato/ }),
			).toHaveTextContent("Food · 1 time"),
		);
	});

	test("a word inside a payee matches too", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("oil");

		const listbox = await list();
		await waitFor(() =>
			expect(
				within(listbox).getByRole("option", { name: /Indian Oil/ }),
			).toBeInTheDocument(),
		);
	});

	test("text equal to a payee, in any case, has no new-payee option", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("SWIGGY");

		const listbox = await list();
		await waitFor(() =>
			expect(optionNames(listbox)).toEqual(["SwiggyFood · 4 times"]),
		);
	});

	test("text that matches nothing offers only the new payee", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("Kirana");

		const listbox = await list();
		await waitFor(() =>
			expect(optionNames(listbox)).toEqual(["Use “Kirana” as a new payee"]),
		);
		expect(within(listbox).queryByText("Matches")).toBeNull();
	});

	test("the new-payee option names the text without its outer spaces", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("  Kirana  ");

		const listbox = await list();
		await waitFor(() =>
			expect(
				within(listbox).getByRole("option", {
					name: "Use “Kirana” as a new payee",
				}),
			).toBeInTheDocument(),
		);
	});

	test("the list ends with its keyboard hint", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await list();

		expect(
			screen.getByText(
				"Up and down to choose · Enter to select · Esc to close",
			),
		).toBeInTheDocument();
	});

	test("with no payees yet, focusing the empty field opens no list", async () => {
		payees([]);
		const { user } = renderField();

		await user.click(box());
		await new Promise((resolve) => setTimeout(resolve, 50));

		expect(screen.queryByRole("listbox")).toBeNull();
	});

	test("the server's search fills the rest after 300 ms", async () => {
		const seen = payees(GOLDEN_PAYEES, [named("Swiggy Instamart")]);
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("swi");

		const listbox = await list();
		await waitFor(() =>
			expect(optionNames(listbox)).toEqual([
				"SwiggyFood · 4 times",
				"Swiggy InstamartFood · 1 time",
				"Use “swi” as a new payee",
			]),
		);
		expect(seen.map((each) => each.path)).toContain("/api/payees?q=swi");
	});
});

describe("choosing (BR-F03-45, D-551)", () => {
	test("a suggestion goes to the dialog, which fills the field", async () => {
		payees();
		const { user, onChoose } = renderField();

		await user.click(box());
		await user.keyboard("swi");
		await user.click(await screen.findByRole("option", { name: /^Swiggy/ }));

		expect(onChoose).toHaveBeenCalledExactlyOnceWith(GOLDEN_PAYEES[0]);
		expect(box()).toHaveValue("Swiggy");
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
	});

	test("the arrow keys and Enter choose a suggestion", async () => {
		payees();
		const { user, onChoose } = renderField();

		await user.click(box());
		await list();
		await screen.findByRole("option", { name: /Sunrise/ });
		await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

		expect(onChoose).toHaveBeenCalledExactlyOnceWith(GOLDEN_PAYEES[1]);
		expect(box()).toHaveValue("Sunrise Apartments");
	});

	test("Use “X” as a new payee keeps the text and chooses nothing", async () => {
		payees();
		const { user, onChoose } = renderField();

		await user.click(box());
		await user.keyboard("Kirana");
		await user.click(await screen.findByRole("option", { name: /new payee/ }));

		expect(onChoose).not.toHaveBeenCalled();
		expect(box()).toHaveValue("Kirana");
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
	});

	test("any text stays when focus leaves", async () => {
		payees();
		const { user, onChoose } = renderField();

		await user.click(box());
		await user.keyboard("Kirana store");
		await user.tab();

		expect(box()).toHaveValue("Kirana store");
		expect(onChoose).not.toHaveBeenCalled();
	});

	test("Escape closes the list and keeps the text", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("swi");
		await list();
		await user.keyboard("{Escape}");

		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
		expect(box()).toHaveValue("swi");
	});

	test("each keystroke reaches the dialog", async () => {
		payees();
		const { user, changes } = renderField();

		await user.click(box());
		await user.keyboard("ab");

		expect(changes).toEqual(["a", "ab"]);
	});
});

describe("typing after a choice (BR-F03-12)", () => {
	test("typing a payee's name in another case keeps the typed case and the list open", async () => {
		payees();
		const { user, onChoose } = renderField();

		await user.click(box());
		await user.keyboard("SWIGGY");

		expect(await list()).toBeInTheDocument();
		expect(box()).toHaveValue("SWIGGY");
		expect(onChoose).not.toHaveBeenCalled();
	});

	test("editing a chosen payee opens the list again with the new matches", async () => {
		payees();
		const { user } = renderField();

		await user.click(box());
		await user.keyboard("swi");
		await user.click(await screen.findByRole("option", { name: /^Swiggy/ }));
		await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
		await user.keyboard("{Backspace}");

		const listbox = await list();
		await waitFor(() =>
			expect(optionNames(listbox)).toEqual([
				"SwiggyFood · 4 times",
				"Use “Swigg” as a new payee",
			]),
		);
	});

	test("the same suggestion can be chosen twice", async () => {
		payees();
		const { user, onChoose } = renderField();

		await user.click(box());
		await user.keyboard("swi");
		await user.click(await screen.findByRole("option", { name: /^Swiggy/ }));
		await user.keyboard("{Backspace}");
		await user.click(await screen.findByRole("option", { name: /^Swiggy/ }));

		expect(onChoose).toHaveBeenCalledTimes(2);
		expect(box()).toHaveValue("Swiggy");
	});
});

describe("in React's Strict Mode, as the dev server runs it", () => {
	test("Backspace after choosing a suggestion reopens the list without an error", async () => {
		payees(GOLDEN_PAYEES, [named("Swiggy Instamart")]);
		const errors: unknown[] = [];
		const onError = (event: ErrorEvent) => {
			errors.push(event.error);
			event.preventDefault();
		};
		window.addEventListener("error", onError);
		vi.spyOn(console, "error").mockImplementation((...args) =>
			errors.push(args),
		);
		function Harness() {
			const [value, setValue] = useState("");
			return (
				<PayeeField
					value={value}
					onChange={setValue}
					onChoose={(item) => setValue(item.payee)}
				/>
			);
		}
		renderInApp(
			<StrictMode>
				<Harness />
			</StrictMode>,
		);
		const user = userEvent.setup();

		// Picked from Recent and frequent, with nothing typed first.
		await user.click(box());
		await user.click(await screen.findByRole("option", { name: /^Swiggy/ }));
		await user.keyboard("{Backspace}");
		await new Promise((resolve) => setTimeout(resolve, 600));
		window.removeEventListener("error", onError);

		expect(errors).toEqual([]);
		expect(box()).toHaveValue("Swigg");
	});
});

describe("the field (BR-F03-48)", () => {
	test("starts with the text it is given", () => {
		payees();
		renderField({}, "Swiggy");

		expect(box()).toHaveValue("Swiggy");
	});

	test("has a placeholder that is never its label", () => {
		payees();
		renderField();

		expect(box()).toHaveAttribute(
			"placeholder",
			"Who you paid, or who paid you",
		);
		expect(box()).toHaveAccessibleName("Payee");
	});

	test("shows no counter up to 60 characters", () => {
		payees();
		renderField({}, "a".repeat(60));

		expect(screen.queryByText(/\/ 80/)).toBeNull();
	});

	test("shows the counter from 61 characters", () => {
		payees();
		renderField({}, "a".repeat(61));

		expect(screen.getByText("61 / 80")).toBeInTheDocument();
	});

	test("an error marks it invalid and is read with it", () => {
		payees();
		renderField({ error: "Enter who you paid, or who paid you." });

		expect(box()).toHaveAttribute("aria-invalid", "true");
		expect(box()).toHaveAccessibleDescription(
			"Enter who you paid, or who paid you.",
		);
	});

	test("disabled, it takes no typing", async () => {
		payees();
		const { user, changes } = renderField({ isDisabled: true });

		await user.type(box(), "a");

		expect(box()).toBeDisabled();
		expect(changes).toEqual([]);
	});

	test("takes a class name on its root", () => {
		payees();
		const { container } = renderField({ className: "col-span-2" });

		expect(container.querySelector(".col-span-2")).toContainElement(box());
	});
});
