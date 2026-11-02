"use client";

import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { RouterProvider as AriaRouterProvider } from "react-aria-components";

import { Toaster } from "@/components/feedback/Toaster";
import { useLogout } from "@/hooks/useLogout";
import { useMe } from "@/hooks/useMe";
import { writeSidebarChoice } from "@/lib/sidebar";
import { BottomBar } from "./BottomBar";
import { Header } from "./Header";
import { SessionCheck } from "./SessionCheck";
import { SessionExpiredBanner } from "./SessionExpiredBanner";
import { Sidebar } from "./Sidebar";
import { UserMenu } from "./UserMenu";

export type AppShellProps = {
	/** The signed-in user as the server read them; `/api/me` takes over once it answers, so a
	 * new name shows without a reload. */
	user: { name: string; email: string };
	/** The sidebar's width from its cookie (D-513). */
	rail: boolean;
	/** The login screen an offline logout leaves in this tab (D-502, D-515). */
	loggedOut: ReactNode;
	children: ReactNode;
};

/**
 * The frame of every logged-in page (root section 4): the session check and its banner, the
 * sidebar from 768px up, the header, the page, the bottom bar below 768px, and the toasts.
 * React Aria links navigate through Next's router, so the shell stays mounted between pages.
 */
export function AppShell({
	user,
	rail: railAtLoad,
	loggedOut,
	children,
}: Readonly<AppShellProps>) {
	const pathname = usePathname();
	const router = useRouter();
	const [rail, setRail] = useState(railAtLoad);
	const { data: me } = useMe();
	const { state: logout, logout: startLogout } = useLogout();
	const shown = me?.user ?? user;

	if (logout === "offline") return loggedOut;

	return (
		<AriaRouterProvider navigate={(path) => router.push(path)}>
			<SessionCheck />
			<a
				href="#content"
				className="bg-page text-label text-ink rounded-control sr-only z-50 px-3 py-2 font-semibold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
			>
				Skip to content
			</a>
			{/* Signing out ends the session first, and that is no expiry to warn about. */}
			{logout === "idle" && <SessionExpiredBanner />}
			<div className="bg-page flex min-h-dvh">
				<Sidebar
					pathname={pathname}
					rail={rail}
					onRailChange={(next) => {
						setRail(next);
						writeSidebarChoice(next);
					}}
					className="max-md:hidden"
				/>
				<div className="flex min-w-0 flex-1 flex-col">
					<Header>
						<UserMenu
							name={shown.name}
							email={shown.email}
							loggingOut={logout === "running"}
							onLogout={() => void startLogout()}
						/>
					</Header>
					<main
						id="content"
						tabIndex={-1}
						className="flex-1 outline-none max-md:pb-(--bottom-bar-height)"
					>
						{children}
					</main>
				</div>
			</div>
			<BottomBar
				pathname={pathname}
				className="md:hidden"
			/>
			<Toaster />
		</AriaRouterProvider>
	);
}
