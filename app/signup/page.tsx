import type { Metadata } from "next";

import { FormPage } from "@/components/surfaces/FormPage";
import { SignUpForm } from "@/features/auth/components/SignUpForm";

export const metadata: Metadata = { title: "Create your account" };

/** `/signup` (F01 section 6). The proxy has already sent a visitor with a session cookie to
 * `/dashboard` (BR-P2-29). */
export default function SignUpPage() {
	return (
		<FormPage title="Create your account">
			<SignUpForm />
		</FormPage>
	);
}
