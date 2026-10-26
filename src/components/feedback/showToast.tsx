import { toast } from "sonner";

import { Toast } from "@/components/feedback/Toast";

export type ShowToastOptions = {
	/** The label of the one action, for example "Undo". Pressing it also closes the toast. */
	action?: string;
	onAction?: () => void;
	tone?: "neutral" | "error";
	/** How long it stays, in milliseconds. */
	duration?: number;
};

/** Shows a toast and returns its id, which `dismissToast` takes. */
export function showToast(
	message: string,
	{ action, onAction, tone, duration }: ShowToastOptions = {},
): string | number {
	return toast.custom(
		(id) => (
			<Toast
				{...(action ? { action } : {})}
				{...(tone ? { tone } : {})}
				onAction={() => {
					onAction?.();
					toast.dismiss(id);
				}}
			>
				{message}
			</Toast>
		),
		duration === undefined ? {} : { duration },
	);
}

/** Closes a toast early, for example when its Undo hold ends. */
export function dismissToast(id: string | number): void {
	toast.dismiss(id);
}
