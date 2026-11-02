import { act, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

import { useOnline } from "../useOnline";

function Status() {
	return <p>{useOnline() ? "online" : "offline"}</p>;
}

function connection(online: boolean) {
	vi.spyOn(navigator, "onLine", "get").mockReturnValue(online);
}

afterEach(() => vi.restoreAllMocks());

describe("useOnline", () => {
	test("follows navigator.onLine when it renders", () => {
		connection(false);
		render(<Status />);
		expect(screen.getByText("offline")).toBeInTheDocument();
	});

	test("goes offline on the offline event and back on the online event", () => {
		connection(true);
		render(<Status />);
		expect(screen.getByText("online")).toBeInTheDocument();
		connection(false);
		act(() => {
			window.dispatchEvent(new Event("offline"));
		});
		expect(screen.getByText("offline")).toBeInTheDocument();
		connection(true);
		act(() => {
			window.dispatchEvent(new Event("online"));
		});
		expect(screen.getByText("online")).toBeInTheDocument();
	});

	test("on the server, renders online", () => {
		connection(false);
		expect(renderToString(<Status />)).toBe("<p>online</p>");
	});

	test("stops listening once unmounted", () => {
		const removed = vi.spyOn(window, "removeEventListener");
		const { unmount } = render(<Status />);
		unmount();
		expect(removed).toHaveBeenCalledWith("online", expect.any(Function));
		expect(removed).toHaveBeenCalledWith("offline", expect.any(Function));
	});
});
