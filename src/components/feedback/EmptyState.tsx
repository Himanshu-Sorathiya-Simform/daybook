import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type EmptyStateProps = {
	/** One line that says why it is empty, for example "No Transactions match these filters." */
	title: string;
	body?: string;
	action?: string;
	onAction?: () => void;
	secondary?: string;
	onSecondary?: () => void;
	/** A left-aligned single line for small widgets. */
	compact?: boolean;
	className?: string;
};

/** One line that says why, and one action. Empty because nothing exists yet and empty because
 * of filters are always told apart in the copy. With two actions the first is the main one. */
export function EmptyState({
	title,
	body,
	action,
	onAction,
	secondary,
	onSecondary,
	compact = false,
	className,
}: Readonly<EmptyStateProps>) {
	return (
		<div
			className={cn(
				"flex flex-col gap-2.5",
				compact ?
					"items-start py-2 text-left"
				:	"items-center px-4 py-10 text-center",
				className,
			)}
		>
			<p className="text-body-lg text-ink font-semibold">{title}</p>
			{body && <p className="text-body text-ink-2 max-w-105">{body}</p>}
			{(action || secondary) && (
				<div className="mt-1 flex gap-2.5">
					{action && (
						<Button
							size="sm"
							variant={secondary ? "primary" : "secondary"}
							{...(onAction ? { onPress: onAction } : {})}
						>
							{action}
						</Button>
					)}
					{secondary && (
						<Button
							size="sm"
							variant="secondary"
							{...(onSecondary ? { onPress: onSecondary } : {})}
						>
							{secondary}
						</Button>
					)}
				</div>
			)}
		</div>
	);
}
