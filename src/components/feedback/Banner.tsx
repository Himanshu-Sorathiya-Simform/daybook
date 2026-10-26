import { CircleAlert, CloudOff, Info, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/actions/Button";
import { cn } from "@/lib/cn";

export type BannerProps = {
	kind?: "offline" | "update" | "error" | "info";
	children: ReactNode;
	/** Right-aligned detail, for example "as of 14:05". */
	meta?: string;
	/** The label of the one action, for example "Reload". */
	action?: string;
	onAction?: () => void;
	className?: string;
};

const kinds = {
	offline: { icon: CloudOff, tone: "bg-soft" },
	update: { icon: RefreshCw, tone: "bg-accent-soft" },
	error: { icon: CircleAlert, tone: "bg-neg-soft" },
	info: { icon: Info, tone: "bg-soft" },
};

/** A full-width global banner above the shell: offline (with "as of"), an update, a failed
 * payment, an expired session. An error is announced at once; the others politely. */
export function Banner({
	kind = "info",
	children,
	meta,
	action,
	onAction,
	className,
}: Readonly<BannerProps>) {
	const { icon: Icon, tone } = kinds[kind];
	return (
		<div
			role={kind === "error" ? "alert" : "status"}
			className={cn(
				"border-line text-label text-ink flex min-h-10 items-center gap-2.5 border-b px-6 py-1.5 font-medium max-md:px-4",
				tone,
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={cn("size-4 shrink-0", kind === "error" && "text-neg")}
			/>
			<span className="flex-1">{children}</span>
			{meta && <span className="figures text-ink-2">{meta}</span>}
			{action && (
				<Button
					size="sm"
					variant="secondary"
					{...(onAction ? { onPress: onAction } : {})}
				>
					{action}
				</Button>
			)}
		</div>
	);
}
