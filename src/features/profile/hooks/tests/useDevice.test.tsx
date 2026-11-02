import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";

afterEach(() => {
	vi.restoreAllMocks();
	vi.resetModules();
});

/** A fresh copy of the hook: the device is read once per page load. */
async function freshHook() {
	vi.resetModules();
	return (await import("../useDevice")).useDevice;
}

function zone(timeZone: string) {
	vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
		timeZone,
	} as Intl.ResolvedDateTimeFormatOptions);
}

describe("useDevice (BR-F02-03)", () => {
	test("reads the zone from Intl and the first preferred language", async () => {
		zone("Asia/Kolkata");
		vi.spyOn(navigator, "languages", "get").mockReturnValue(["hi-IN", "en-US"]);
		const useDevice = await freshHook();
		function Show() {
			return <p>{JSON.stringify(useDevice())}</p>;
		}
		render(<Show />);
		expect(
			screen.getByText('{"zone":"Asia/Kolkata","language":"hi-IN"}'),
		).toBeInTheDocument();
	});

	test("without a languages list, takes navigator.language", async () => {
		zone("UTC");
		vi.spyOn(navigator, "languages", "get").mockReturnValue([]);
		vi.spyOn(navigator, "language", "get").mockReturnValue("en-GB");
		const useDevice = await freshHook();
		function Show() {
			return <p>{useDevice()?.language}</p>;
		}
		render(<Show />);
		expect(screen.getByText("en-GB")).toBeInTheDocument();
	});

	test("reads the browser once per page load", async () => {
		const read = vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions");
		const useDevice = await freshHook();
		function Show() {
			return <p>{useDevice()?.zone}</p>;
		}
		const { rerender } = render(<Show />);
		const calls = read.mock.calls.length;
		rerender(<Show />);
		render(<Show />);
		expect(read.mock.calls.length).toBe(calls);
	});

	test("is null while the server renders", async () => {
		const useDevice = await freshHook();
		function Show() {
			return <p>{useDevice() === null ? "unknown" : "known"}</p>;
		}
		expect(renderToString(<Show />)).toBe("<p>unknown</p>");
	});
});
