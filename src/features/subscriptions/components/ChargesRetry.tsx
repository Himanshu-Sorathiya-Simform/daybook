import { Button } from "@/components/actions/Button";

export type ChargesRetryProps = {
	/** Why the charges are missing. */
	message: string;
	retryLabel: string;
	onRetry: () => void;
};

/** The charges could not load: the line, read out as an alert, and a button that asks again. */
export function ChargesRetry({
	message,
	retryLabel,
	onRetry,
}: Readonly<ChargesRetryProps>) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
			<p
				role="alert"
				className="text-body text-ink-2"
			>
				{message}
			</p>
			<Button
				size="sm"
				variant="row"
				onPress={onRetry}
			>
				{retryLabel}
			</Button>
		</div>
	);
}
