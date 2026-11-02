import { act, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { renderInApp } from "@/components/app/tests/helpers";
import { useAppSession } from "../useAppSession";

/** Shows the session state as text. */
function SessionState() {
	const { expired } = useAppSession();
	return <p>{expired ? "expired" : "live"}</p>;
}

describe("useAppSession", () => {
	test("throws outside AppProviders", () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(() => render(<SessionState />)).toThrow(/needs AppProviders/);
		vi.mocked(console.error).mockRestore();
	});

	test("starts live", () => {
		renderInApp(<SessionState />);
		expect(screen.getByText("live")).toBeInTheDocument();
	});

	test("markExpired turns it expired", async () => {
		function Expire() {
			const { markExpired } = useAppSession();
			return <button onClick={markExpired}>expire</button>;
		}
		renderInApp(
			<>
				<Expire />
				<SessionState />
			</>,
		);
		act(() => screen.getByRole("button", { name: "expire" }).click());
		expect(await screen.findByText("expired")).toBeInTheDocument();
	});

	test("navigate is the one AppProviders was given", () => {
		function Go() {
			const { navigate } = useAppSession();
			return <button onClick={() => navigate("/budgets")}>go</button>;
		}
		const { navigate } = renderInApp(<Go />);
		act(() => screen.getByRole("button", { name: "go" }).click());
		expect(navigate).toHaveBeenCalledExactlyOnceWith("/budgets");
	});
});
