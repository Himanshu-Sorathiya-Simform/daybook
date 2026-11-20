import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay } from "msw";
import { setupServer } from "msw/node";
import { useState } from "react";
import { toast } from "sonner";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { AppProviders } from "@/components/app/AppProviders";
import { Toaster } from "@/components/feedback/Toaster";
import { isUuidV7 } from "@/lib/ids";
import { subscriptionAnswer, subscriptionItem } from "../../lib/__tests__/fixtures";
import type { SubscriptionItem } from "../../lib/types";
import { useQuickWrites } from "../useQuickWrites";
import { ok, refuse, route, testClient } from "./helpers";

const network = setupServer();
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
	toast.dismiss();
	network.resetHandlers();
	vi.restoreAllMocks();
});
afterAll(() => network.close());

const NETFLIX = subscriptionItem("netflix");
const TODAY = "2026-11-02";
const PAUSED_IN_FORCE = subscriptionItem("netflix", {
	status: "paused",
	pause: { from: "2026-10-05", until: "2027-01-05" },
});
const PAUSED_NOT_STARTED = subscriptionItem("netflix", {
	status: "paused",
	pause: { from: "2026-11-05", until: "2027-01-05" },
});

/** The last write's answer, kept as text. */
function useResult() {
	const [value, set] = useState("");
	return [value, (done: boolean) => set(String(done))] as const;
}

/** Buttons that press each write on `item`, and say whether it was confirmed. */
function Harness({ item }: { item: SubscriptionItem }) {
	const quick = useQuickWrites({ today: TODAY });
	const [last, setLast] = useResult();
	return (
		<>
			<button onClick={() => void quick.skipNext(item).then(setLast)}>
				skip
			</button>
			<button
				onClick={() => void quick.undoSkip(item, "2026-11-05").then(setLast)}
			>
				unskip
			</button>
			<button onClick={() => void quick.resumeNow(item).then(setLast)}>
				resume now
			</button>
			<output>{last}</output>
			<Toaster />
		</>
	);
}

function setup(item: SubscriptionItem = NETFLIX) {
	render(
		<AppProviders
			navigate={vi.fn()}
			queryClient={testClient()}
		>
			<Harness item={item} />
		</AppProviders>,
	);
	return userEvent.setup();
}

const press = (user: ReturnType<typeof userEvent.setup>, name: string) =>
	user.click(screen.getByRole("button", { name }));
const result = () => screen.getByRole("status").textContent;

describe("Skip this one (BR-F05-26)", () => {
	// AC-F05-51
	test("posts the next due date and the change time at the version, with a new key", async () => {
		const posts = route(
			network,
			"post",
			`/api/subscriptions/${NETFLIX.id}/skips`,
			() => ok(subscriptionAnswer("netflix", { version: 2 })),
		);
		const user = setup();
		await press(user, "skip");
		await waitFor(() => expect(result()).toBe("true"));
		expect(posts).toHaveLength(1);
		expect(posts[0]?.body).toEqual({
			dueOn: "2026-11-05",
			changedAt: expect.any(String),
		});
		expect(posts[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
		expect(isUuidV7(posts[0]?.headers.get("idempotency-key") ?? "")).toBe(true);
	});

	test("with no next due date it sends nothing and is not confirmed", async () => {
		const posts = route(
			network,
			"post",
			`/api/subscriptions/${NETFLIX.id}/skips`,
			() => ok({}),
		);
		const user = setup(subscriptionItem("netflix", { nextDueOn: null }));
		await press(user, "skip");
		await waitFor(() => expect(result()).toBe("false"));
		expect(posts).toHaveLength(0);
	});

	// AC-F05-51
	test("two presses send one request", async () => {
		const posts = route(
			network,
			"post",
			`/api/subscriptions/${NETFLIX.id}/skips`,
			async () => {
				await delay(60);
				return ok(subscriptionAnswer("netflix", { version: 2 }));
			},
		);
		const user = setup();
		await user.dblClick(screen.getByRole("button", { name: "skip" }));
		await waitFor(() => expect(result()).not.toBe(""));
		expect(posts).toHaveLength(1);
	});
});

describe("Undo skip (BR-F05-27)", () => {
	// AC-F05-51
	test("deletes the skip of that date at the version", async () => {
		const deletes = route(
			network,
			"delete",
			`/api/subscriptions/${NETFLIX.id}/skips/2026-11-05`,
			() => ok(subscriptionAnswer("netflix", { version: 2 })),
		);
		const user = setup();
		await press(user, "unskip");
		await waitFor(() => expect(result()).toBe("true"));
		expect(deletes).toHaveLength(1);
		expect(deletes[0]?.body).toEqual({ changedAt: expect.any(String) });
		expect(deletes[0]?.headers.get("if-match")).toBe(`"${NETFLIX.version}"`);
	});
});

describe("Resume now (BR-F05-29)", () => {
	const patch = `/api/subscriptions/${NETFLIX.id}`;

	// AC-F05-51
	test("a pause in force ends today, keeping its start", async () => {
		const patches = route(network, "patch", patch, () =>
			ok({ ...subscriptionAnswer("netflix"), changeDate: TODAY }),
		);
		const user = setup(PAUSED_IN_FORCE);
		await press(user, "resume now");
		await waitFor(() => expect(result()).toBe("true"));
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			pause: { from: "2026-10-05", until: TODAY },
		});
	});

	// AC-F05-51
	test("a pause that has not started is cleared", async () => {
		const patches = route(network, "patch", patch, () =>
			ok({ ...subscriptionAnswer("netflix"), changeDate: TODAY }),
		);
		const user = setup(PAUSED_NOT_STARTED);
		await press(user, "resume now");
		await waitFor(() => expect(result()).toBe("true"));
		expect(patches[0]?.body).toEqual({
			changedAt: expect.any(String),
			pause: null,
		});
	});

	test("with no pause it sends nothing", async () => {
		const patches = route(network, "patch", patch, () => ok({}));
		const user = setup(NETFLIX);
		await press(user, "resume now");
		await waitFor(() => expect(result()).toBe("false"));
		expect(patches).toHaveLength(0);
	});
});

describe("a refusal (section 8)", () => {
	const skips = `/api/subscriptions/${NETFLIX.id}/skips`;

	// AC-F05-51
	test("a 422 says why in a toast, and is not confirmed", async () => {
		route(network, "post", skips, () =>
			refuse(422, "validation_failed", {
				message: "m",
				fields: { dueOn: "Only an upcoming charge can be skipped." },
			}),
		);
		const user = setup();
		await press(user, "skip");
		expect(
			await screen.findByText("Only an upcoming charge can be skipped."),
		).toBeVisible();
		expect(result()).toBe("false");
	});

	test("a failed request says it could not be saved", async () => {
		route(network, "post", skips, () => refuse(500, "internal_error"));
		const user = setup();
		await press(user, "skip");
		expect(
			await screen.findByText(
				"The Subscription could not be saved. Check your connection and try again.",
			),
		).toBeVisible();
	});

	test("a 404 says it was deleted on another device", async () => {
		route(network, "post", skips, () =>
			refuse(404, "not_found", { message: "gone" }),
		);
		const user = setup();
		await press(user, "skip");
		expect(
			await screen.findByText(
				"This Subscription was deleted on another device.",
			),
		).toBeVisible();
	});

	test("a 409 says it changed on another device", async () => {
		route(network, "post", skips, () =>
			refuse(409, "version_conflict", {
				message: "m",
				details: { current: subscriptionAnswer("netflix", { version: 2 }) },
			}),
		);
		const user = setup();
		await press(user, "skip");
		expect(
			await screen.findByText(
				/^This Subscription changed on another device\./,
			),
		).toBeVisible();
	});

	test("a 401 shows nothing", async () => {
		route(network, "post", skips, () => refuse(401, "unauthenticated"));
		const user = setup();
		await press(user, "skip");
		await waitFor(() => expect(result()).toBe("false"));
		expect(document.querySelector("[data-sonner-toast]")).toBeNull();
	});

	test("a press can be made again after a refusal", async () => {
		let at = 0;
		const posts = route(network, "post", skips, () =>
			++at === 1 ?
				refuse(500, "internal_error")
			:	ok(subscriptionAnswer("netflix")),
		);
		const user = setup();
		await press(user, "skip");
		await screen.findByText(/could not be saved/);
		await press(user, "skip");
		await waitFor(() => expect(result()).toBe("true"));
		expect(posts).toHaveLength(2);
	});
});

describe("offline, before M5", () => {
	// AC-F05-51
	test("says so in a toast and sends nothing", async () => {
		vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		const posts = route(
			network,
			"post",
			`/api/subscriptions/${NETFLIX.id}/skips`,
			() => ok({}),
		);
		const user = setup();
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		await press(user, "skip");
		expect(
			await screen.findByText("You are offline. Connect to save."),
		).toBeVisible();
		expect(result()).toBe("false");
		expect(posts).toHaveLength(0);
	});
});
