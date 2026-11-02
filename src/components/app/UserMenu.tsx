"use client";

import { LogOut, UserRound } from "lucide-react";
import {
	Button as AriaButton,
	Header as AriaHeader,
	Menu as AriaMenu,
	MenuItem as AriaMenuItem,
	MenuSection as AriaMenuSection,
	MenuTrigger as AriaMenuTrigger,
	Popover as AriaPopover,
} from "react-aria-components";

import { cn } from "@/lib/cn";
import { initials } from "@/lib/initials";

export type UserMenuProps = {
	name: string;
	email: string;
	onLogout: () => void;
	/** While a logout runs, Log out takes no second press (D-515). */
	loggingOut?: boolean;
	className?: string;
};

/**
 * The header's account menu (root section 4, D-504): the name and email label the section that
 * holds Log out, so a screen reader hears whose account it leaves. Settings joins it with the
 * settings pages. The button shows the name's initials, or a person icon when the name has no
 * letters or digits.
 */
export function UserMenu({
	name,
	email,
	onLogout,
	loggingOut = false,
	className,
}: Readonly<UserMenuProps>) {
	const letters = initials(name);
	return (
		<AriaMenuTrigger>
			<AriaButton
				aria-label="Account menu"
				className={cn(
					"bg-soft text-small text-ink inline-flex size-8.5 shrink-0 cursor-pointer items-center justify-center rounded-full font-bold max-md:size-11",
					className,
				)}
			>
				{letters || (
					<UserRound
						aria-hidden="true"
						className="size-4"
					/>
				)}
			</AriaButton>
			<AriaPopover
				placement="bottom end"
				offset={6}
				className={cn(
					"border-line bg-page shadow-popover z-50 w-max max-w-[min(20rem,calc(100vw-2rem))] min-w-56 overflow-hidden rounded-xl border",
					"entering:opacity-0 exiting:opacity-0 transition-opacity duration-(--dur-fast) ease-out",
				)}
			>
				<AriaMenu className="p-1.5 outline-none">
					<AriaMenuSection>
						<AriaHeader className="border-line mb-1 flex flex-col gap-0.5 border-b px-2.5 pt-1.5 pb-2.5">
							<span className="text-label text-ink font-semibold wrap-anywhere">
								{name}
							</span>
							{/* The header labels the group; a space keeps the two apart when read. */}{" "}
							<span className="text-caption text-ink-2 wrap-anywhere">
								{email}
							</span>
						</AriaHeader>
						<AriaMenuItem
							textValue="Log out"
							isDisabled={loggingOut}
							onAction={onLogout}
							className="text-label text-ink focus:bg-soft disabled:text-ink-3 flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2.5 outline-none disabled:cursor-not-allowed max-md:min-h-11"
						>
							<LogOut
								aria-hidden="true"
								className="size-4"
							/>
							Log out
						</AriaMenuItem>
					</AriaMenuSection>
				</AriaMenu>
			</AriaPopover>
		</AriaMenuTrigger>
	);
}
