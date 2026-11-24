import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { OpenTarget } from "../../lib/deep-link";
import { subscriptionItem } from "../../lib/__tests__/fixtures";
import { useOpenParam } from "../useOpenParam";
import { urlHarness } from "./helpers";

afterEach(() => {
	vi.restoreAllMocks();
	window.history.replaceState(null, "", "/");
});

const netflix = subscriptionItem("netflix");
const ended = subscriptionItem("cultGym", { status: "ended" });
const items = [netflix, ended];

/** Mounts the hook inside the URL seam; `late` is how the app hears history calls. */
function mount(
	search: string,
	list: typeof items | "loading" = items,
	options: { late?: boolean; lag?: boolean } = {},
) {
	const harness = urlHarness(search, "/subscriptions", options);
	const onOpen = vi.fn<(target: OpenTarget | null) => void>();
	const view = renderHook(
		({ list: current }: { list: typeof items | undefined }) =>
			useOpenParam(current, onOpen),
		{
			wrapper: harness.Url,
			initialProps: { list: list === "loading" ? undefined : list },
		},
	);
	return { ...harness, ...view, onOpen };
}

describe("useOpenParam (BR-F05-21, D-593)", () => {
	test("selects the Subscription the link names and removes the parameter", async () => {
		const { onOpen, calls } = mount(`?open=${netflix.id}`);
		expect(onOpen).toHaveBeenCalledExactlyOnceWith({
			id: netflix.id,
			ended: false,
		});
		await vi.waitFor(() =>
			expect(calls).toEqual([{ mode: "replace", href: "/subscriptions" }]),
		);
	});

	test("an ended Subscription asks for its group to be opened", () => {
		const { onOpen } = mount(`?open=${ended.id}`);
		expect(onOpen).toHaveBeenCalledExactlyOnceWith({
			id: ended.id,
			ended: true,
		});
	});

	test("an unknown id selects nothing, and the parameter is still removed", async () => {
		const { onOpen, calls } = mount(
			"?open=0192f0c4-0000-7000-8000-000000000000",
		);
		expect(onOpen).toHaveBeenCalledExactlyOnceWith(null);
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.href).toBe("/subscriptions");
	});

	test("keeps the other parameters", async () => {
		const { calls } = mount(`?x=1&open=${netflix.id}`);
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		expect(calls[0]?.href).toBe("/subscriptions?x=1");
	});

	test("does nothing with no parameter", async () => {
		const { onOpen, calls } = mount("");
		await Promise.resolve();
		expect(onOpen).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});

	test("does nothing for an empty parameter", async () => {
		const { onOpen, calls } = mount("?open=");
		await Promise.resolve();
		expect(onOpen).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});

	test("waits for the list: nothing is chosen, and the parameter stays, until it loads", async () => {
		const { onOpen, calls, rerender } = mount(`?open=${netflix.id}`, "loading");
		await Promise.resolve();
		expect(onOpen).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
		rerender({ list: items });
		expect(onOpen).toHaveBeenCalledExactlyOnceWith({
			id: netflix.id,
			ended: false,
		});
		await vi.waitFor(() => expect(calls).toHaveLength(1));
	});

	test("an empty list reads the id as unknown", () => {
		const { onOpen } = mount(`?open=${netflix.id}`, []);
		expect(onOpen).toHaveBeenCalledExactlyOnceWith(null);
	});

	test("a refetch that changes the items does not select it again", async () => {
		// The router takes a history call in a render later, so the parameter is still read.
		const { onOpen, rerender, calls } = mount(`?open=${netflix.id}`, items, {
			late: false,
		});
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		rerender({ list: [{ ...netflix }, { ...ended }] });
		rerender({ list: [{ ...netflix }] });
		expect(onOpen).toHaveBeenCalledTimes(1);
	});

	test("works in the app's order, where Next listens to history only after the first effects", async () => {
		const { onOpen, calls } = mount(`?open=${netflix.id}`, items, {
			late: true,
		});
		expect(onOpen).toHaveBeenCalledTimes(1);
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		expect(window.location.search).toBe("");
	});

	test("a second link to the same Subscription selects it again", async () => {
		const { onOpen, calls, rerender } = mount(`?open=${netflix.id}`);
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		window.history.pushState(null, "", `/subscriptions?open=${netflix.id}`);
		rerender({ list: items });
		await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2));
	});

	test("a link to another Subscription after the first selects that one", async () => {
		const { onOpen, rerender } = mount(`?open=${netflix.id}`);
		window.history.pushState(null, "", `/subscriptions?open=${ended.id}`);
		rerender({ list: items });
		await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2));
		expect(onOpen).toHaveBeenLastCalledWith({ id: ended.id, ended: true });
	});

	// Next's router takes a history call in a render later, so for one render the parameter is
	// still in the URL while the page has already handled it.
	test("a refetch before the router has dropped the parameter does not select it again", async () => {
		const { onOpen, rerender, flush, calls } = mount(
			`?open=${netflix.id}`,
			items,
			{
				lag: true,
			},
		);
		await vi.waitFor(() => expect(calls).toHaveLength(1));
		expect(onOpen).toHaveBeenCalledTimes(1);
		rerender({ list: [{ ...netflix }, { ...ended }] });
		rerender({ list: [{ ...netflix }] });
		expect(onOpen).toHaveBeenCalledTimes(1);
		flush();
		rerender({ list: items });
		expect(onOpen).toHaveBeenCalledTimes(1);
	});
});
