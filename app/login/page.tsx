import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/AuthCard";
import { loginDestination } from "@/features/auth/lib/destination";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { serverEnv } from "@/server/env";

export const metadata: Metadata = { title: "Log in" };

/** `/login` (F01 section 6). The proxy has already sent a visitor with a session cookie to
 * `/dashboard`, unless `expired=1` (BR-P2-29). */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
	const { next, expired } = await searchParams;
	return (
		<AuthCard title="Log in">
			<LoginForm
				destination={loginDestination(next, serverEnv().APP_ORIGIN)}
				expired={expired === "1"}
			/>
		</AuthCard>
	);
}
