import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { chargeNotice, ENTRY_TEXT } from "../../lib/entry";
import { row } from "../../lib/__tests__/fixtures";
import { ChargeNotice } from "../ChargeNotice";

const LINKED = row({
	source: "subscription",
	payee: "Netflix",
	subscriptionId: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8002",
	subscription: {
		id: "0192f0c4-7a1e-7c3b-9d2a-5b8e1f0a8002",
		name: "Netflix",
	},
});

describe("ChargeNotice (BR-F03-16, D-586)", () => {
	test("a linked charge says where it comes from, with a link to its Subscription", () => {
		render(<ChargeNotice row={LINKED} />);
		const link = screen.getByRole("link", { name: /Netflix/ });
		expect(link).toHaveAttribute(
			"href",
			expect.stringContaining(LINKED.subscriptionId!),
		);
		expect(screen.getByText(new RegExp(ENTRY_TEXT.chargeLinked))).toBeVisible();
	});

	test("a charge whose Subscription is gone says so, with no link", () => {
		const unlinked = row({
			source: "subscription",
			subscriptionId: null,
			subscription: null,
		});
		render(<ChargeNotice row={unlinked} />);
		expect(screen.queryByRole("link")).toBeNull();
		expect(screen.getByText(chargeNotice(unlinked))).toBeVisible();
	});
});
