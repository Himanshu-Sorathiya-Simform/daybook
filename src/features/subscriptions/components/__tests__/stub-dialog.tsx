import type { SubscriptionItem } from "../../lib/types";

/** A stand-in for a dialog, for a test of the component that opens it: it says which dialog it
 * is and whom it is for. */
export function stubDialog(name: string) {
	return function StubDialog({
		item,
	}: Readonly<{ item?: SubscriptionItem | null }>) {
		return (
			<p>
				{name} for {item?.name ?? "nobody"}
			</p>
		);
	};
}
