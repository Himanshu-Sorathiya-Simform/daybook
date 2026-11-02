import type { Metadata } from "next";

import { AuthCard } from "@/features/auth/components/AuthCard";
import { SignUpForm } from "@/features/auth/components/SignUpForm";

export const metadata: Metadata = { title: "Create an account" };

/** `/signup` (F01 section 6). The proxy has already sent a visitor with a session cookie to
 * `/dashboard` (BR-P2-29). */
export default function SignUpPage() {
	return (
		<AuthCard title="Create an account">
			<SignUpForm />
		</AuthCard>
	);
}
