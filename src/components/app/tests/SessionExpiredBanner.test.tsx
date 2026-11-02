import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test } from "vitest";

import { emitApiEvent } from "@/lib/api/events";
import {
	expiredLoginPath,
	SESSION_EXPIRED_MESSAGE,
	SessionExpiredBanner,
} from "../SessionExpiredBanner";
import { renderInApp } from "./helpers";

afterEach(() => window.history.replaceState(null, "", "/"));

describe("SessionExpiredBanner (BR-F01-13)", () => {
	test("shows nothing while the session is live", () => {
		renderInApp(<SessionExpiredBanner />);
		expect(screen.queryByRole("alert")).not.toBeInTheDocument();
		expect(screen.queryByText(SESSION_EXPIRED_MESSAGE)).not.toBeInTheDocument();
	});

	test("after a 401, says so at once with F01's message and a Log in button", () => {
		renderInApp(<SessionExpiredBanner />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		const banner = screen.getByRole("alert");
		expect(banner).toHaveTextContent(
			"Your session has expired. Log in to keep saving changes.",
		);
		expect(screen.getByRole("button", { name: "Log in" })).toBeInTheDocument();
	});

	test("Log in returns to this page after login, past the proxy's redirect", async () => {
		window.history.replaceState(null, "", "/transactions?cat=food&q=tea%20shop");
		const { navigate } = renderInApp(<SessionExpiredBanner />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		await userEvent.click(screen.getByRole("button", { name: "Log in" }));
		expect(navigate).toHaveBeenCalledExactlyOnceWith(
			"/login?next=%2Ftransactions%3Fcat%3Dfood%26q%3Dtea%2520shop&expired=1",
		);
	});

	test("Log in works from the keyboard", async () => {
		window.history.replaceState(null, "", "/budgets");
		const { navigate } = renderInApp(<SessionExpiredBanner />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		await userEvent.tab();
		expect(screen.getByRole("button", { name: "Log in" })).toHaveFocus();
		await userEvent.keyboard("{Enter}");
		expect(navigate).toHaveBeenCalledExactlyOnceWith(
			"/login?next=%2Fbudgets&expired=1",
		);
	});

	test("takes the page at the moment of the press, not when the banner appeared", async () => {
		window.history.replaceState(null, "", "/transactions");
		const { navigate } = renderInApp(<SessionExpiredBanner />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		window.history.replaceState(null, "", "/goals");
		await userEvent.click(screen.getByRole("button", { name: "Log in" }));
		expect(navigate).toHaveBeenCalledWith("/login?next=%2Fgoals&expired=1");
	});

	test("a second 401 keeps one banner", () => {
		renderInApp(<SessionExpiredBanner />);
		act(() => {
			emitApiEvent({ type: "unauthenticated" });
			emitApiEvent({ type: "unauthenticated" });
		});
		expect(screen.getAllByRole("alert")).toHaveLength(1);
	});
});

describe("SessionExpiredBanner className", () => {
	test("goes on the banner, after its own classes", () => {
		renderInApp(<SessionExpiredBanner className="sticky top-0" />);
		act(() => emitApiEvent({ type: "unauthenticated" }));
		expect(screen.getByRole("alert")).toHaveClass("sticky", "top-0", "border-b");
	});
});

describe("expiredLoginPath", () => {
	test.each([
		[{ pathname: "/", search: "" }, "/login?next=%2F&expired=1"],
		[
			{ pathname: "/dashboard", search: "" },
			"/login?next=%2Fdashboard&expired=1",
		],
		[
			{ pathname: "/transactions", search: "?a=1&b=2" },
			"/login?next=%2Ftransactions%3Fa%3D1%26b%3D2&expired=1",
		],
		[
			{ pathname: "/reports/2026", search: "?next=/x" },
			"/login?next=%2Freports%2F2026%3Fnext%3D%2Fx&expired=1",
		],
		[
			{ pathname: "/transactions", search: "?q=%23tag" },
			"/login?next=%2Ftransactions%3Fq%3D%2523tag&expired=1",
		],
	])("%o gives %s", (location, path) => {
		expect(expiredLoginPath(location)).toBe(path);
	});

	test("the next value decodes back to the page exactly", () => {
		const location = {
			pathname: "/transactions",
			search: "?q=caf%C3%A9&cat=food",
		};
		const next = new URL(
			expiredLoginPath(location),
			"http://localhost",
		).searchParams.get("next");
		expect(next).toBe("/transactions?q=caf%C3%A9&cat=food");
	});
});
