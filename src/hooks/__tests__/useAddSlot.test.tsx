import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

import { type AddSlot, AddSlotContext, useAddSlot } from "../useAddSlot";

/** A slot that keeps what is registered, as the shell's does. */
function slotFor() {
	const registered: (() => void)[] = [];
	const slot: AddSlot = {
		register: (open) => {
			registered.push(open);
			return () => {
				registered.splice(registered.indexOf(open), 1);
			};
		},
	};
	return { slot, registered };
}

function Filler({ open }: { open: () => void }) {
	useAddSlot(open);
	return null;
}

const inSlot = (slot: AddSlot, children: ReactNode) => (
	<AddSlotContext value={slot}>{children}</AddSlotContext>
);

describe("useAddSlot (D-548)", () => {
	test("fills the slot while mounted, so Add calls it", () => {
		const { slot, registered } = slotFor();
		const open = vi.fn();
		render(inSlot(slot, <Filler open={open} />));

		expect(registered).toHaveLength(1);
		registered[0]!();

		expect(open).toHaveBeenCalledOnce();
	});

	test("empties the slot when unmounted", () => {
		const { slot, registered } = slotFor();
		const { unmount } = render(inSlot(slot, <Filler open={vi.fn()} />));

		unmount();

		expect(registered).toEqual([]);
	});

	test("a new function replaces the old one", () => {
		const { slot, registered } = slotFor();
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = render(inSlot(slot, <Filler open={first} />));

		rerender(inSlot(slot, <Filler open={second} />));

		expect(registered).toEqual([second]);
	});

	test("outside a shell it does nothing", () => {
		expect(() => render(<Filler open={vi.fn()} />)).not.toThrow();
	});
});
