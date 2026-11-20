import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { ok, route, testClient } from "../../hooks/__tests__/helpers";
import { charge, listPage, subscriptionList } from "../../lib/__tests__/fixtures";
import {
	SubscriptionPanel,
	type SubscriptionPanelProps,
} from "../SubscriptionPanel";
import { FORMATS } from "./rows";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());

const LIST = subscriptionList();
const [NETFLIX, CULT] = LIST.items;

function setup(
	props: Partial<SubscriptionPanelProps> = {},
	charges: ReturnType<typeof charge>[] = [
		charge({ subscriptionId: NETFLIX!.id, dueOn: "2026-10-05" }),
	],
) {
	route(network, "get", "/api/transactions", () => ok(listPage(charges)));
	const handlers = { onClose: vi.fn(), onViewCharges: vi.fn() };
	const element = (extra: Partial<SubscriptionPanelProps> = {}) => (
		<AppProviders
			navigate={vi.fn()}
			queryClient={client}
		>
			<SubscriptionPanel
				isDocked
				list={LIST}
				selected={null}
				formats={FORMATS}
				{...handlers}
				{...props}
				{...extra}
			/>
		</AppProviders>
	);
	const client = testClient();
	const view = render(element());
	return {
		...handlers,
		...view,
		again: (extra: Partial<SubscriptionPanelProps>) =>
			view.rerender(element(extra)),
		user: userEvent.setup(),
	};
}

describe("docked (BR-F05-40)", () => {
	test("is a complementary region named Subscription, always on the page", () => {
		setup();
		expect(
			screen.getByRole("complementary", { name: "Subscription" }),
		).toBeVisible();
	});

	test("with no selection it shows the summary of what the Subscriptions cost", () => {
		setup();
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
		expect(screen.queryByRole("heading", { name: "Netflix" })).toBeNull();
	});

	test("with a selection it shows that Subscription", async () => {
		setup({ selected: NETFLIX!.id });
		expect(screen.getByRole("heading", { name: "Netflix" })).toBeVisible();
		expect(
			screen.queryByRole("heading", { name: "Your Subscriptions" }),
		).toBeNull();
		await screen.findByRole("list");
	});

	test("an id the list does not hold shows the summary", () => {
		setup({ selected: "0192f0c4-0000-7000-8000-000000000000" });
		expect(
			screen.getByRole("heading", { name: "Your Subscriptions" }),
		).toBeVisible();
	});

	test("Close details clears the selection", async () => {
		const { user, onClose } = setup({ selected: NETFLIX!.id });
		await user.click(screen.getByRole("button", { name: "Close details" }));
		expect(onClose).toHaveBeenCalledOnce();
		await screen.findByRole("list");
	});

	test("View charges names the selected Subscription", async () => {
		const { user, onViewCharges } = setup({ selected: NETFLIX!.id });
		await user.click(
			await screen.findByRole("button", { name: "View charges" }),
		);
		expect(onViewCharges).toHaveBeenCalledExactlyOnceWith(NETFLIX!.id);
	});

	test("choosing another Subscription starts its panel afresh: Show all is closed again", async () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			charge({ subscriptionId: NETFLIX!.id, dueOn: `2026-0${i + 1}-05` }),
		);
		const { user, again } = setup({ selected: NETFLIX!.id }, many);
		await user.click(await screen.findByRole("button", { name: /^Show all/ }));
		expect(screen.getByRole("button", { name: "Show fewer" })).toBeVisible();
		again({ selected: CULT!.id });
		expect(screen.getByRole("heading", { name: "Cult Gym" })).toBeVisible();
		again({ selected: NETFLIX!.id });
		expect(
			await screen.findByRole("button", { name: /^Show all/ }),
		).toBeVisible();
	});
});

describe("the date the calendar marks (BR-F05-38)", () => {
	// AC-F05-40
	test("docked, the selected Subscription's timeline tints that date", async () => {
		setup({ selected: NETFLIX!.id, selectedDue: "2026-10-05" }, [
			charge({ subscriptionId: NETFLIX!.id, dueOn: "2026-10-05" }),
		]);
		const line = (await screen.findByText("5 Oct 2026")).closest("li");
		expect(line).toHaveClass("bg-accent-soft");
	});

	test("with no date given nothing is tinted", async () => {
		setup({ selected: NETFLIX!.id });
		const line = (await screen.findByText("5 Oct 2026")).closest("li");
		expect(line).not.toHaveClass("bg-accent-soft");
	});

	test("in the drawer too", async () => {
		setup(
			{ isDocked: false, selected: NETFLIX!.id, selectedDue: "2026-10-05" },
			[charge({ subscriptionId: NETFLIX!.id, dueOn: "2026-10-05" })],
		);
		const line = (await screen.findByText("5 Oct 2026")).closest("li");
		expect(line).toHaveClass("bg-accent-soft");
	});
});

describe("below 1180 px, a drawer (BR-F05-40)", () => {
	test("shows nothing with no selection", () => {
		setup({ isDocked: false });
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(screen.queryByRole("complementary")).toBeNull();
		expect(
			screen.queryByRole("heading", { name: "Your Subscriptions" }),
		).toBeNull();
	});

	test("opens as a dialog named Subscription when one is selected", async () => {
		setup({ isDocked: false, selected: NETFLIX!.id });
		const dialog = await screen.findByRole("dialog", { name: "Subscription" });
		expect(dialog).toHaveTextContent("Netflix");
	});

	test("Close details asks to close it", async () => {
		const { user, onClose } = setup({ isDocked: false, selected: NETFLIX!.id });
		await user.click(
			await screen.findByRole("button", { name: "Close details" }),
		);
		expect(onClose).toHaveBeenCalled();
	});

	test("Escape asks to close it", async () => {
		const { user, onClose } = setup({ isDocked: false, selected: NETFLIX!.id });
		await screen.findByRole("dialog");
		await user.keyboard("{Escape}");
		await waitFor(() => expect(onClose).toHaveBeenCalled());
	});

	test("closes when the selection clears", async () => {
		const { again } = setup({ isDocked: false, selected: NETFLIX!.id });
		await screen.findByRole("dialog");
		again({ isDocked: false, selected: null });
		await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
	});

	test("an id the list does not hold keeps it closed", () => {
		setup({ isDocked: false, selected: "0192f0c4-0000-7000-8000-000000000000" });
		expect(screen.queryByRole("dialog")).toBeNull();
	});
});
