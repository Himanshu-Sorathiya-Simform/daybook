"use client";

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useId, useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { TextInput } from "@/components/forms/TextInput";
import { TextLink } from "@/components/navigation/TextLink";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import { authClient } from "@/lib/auth-client";
import { useAuthSubmit } from "../hooks/useAuthSubmit";
import { fieldError } from "../lib/field-error";
import { AUTH_MESSAGES } from "../lib/messages";
import { type LoginValues, loginSchema } from "../lib/schemas";

const EMPTY: LoginValues = { email: "", password: "" };

export type LoginFormProps = {
	/** Where a successful login goes: a checked `next`, else `/dashboard` (BR-F01-09). The page
	 * there sends a user without a profile on to `/onboarding` (BR-F02-01). */
	destination: string;
	/** Whether the session had expired, from `expired=1`. */
	expired?: boolean;
};

/**
 * Login (F01 flow 7.2): email and password with a show/hide button. A wrong email and a wrong
 * password read the same (BR-F01-07); a rate limit has its own line. Success opens the
 * destination with a full page load (D-510). Offline, the form is disabled.
 */
export function LoginForm({
	destination,
	expired = false,
}: Readonly<LoginFormProps>) {
	const online = useOnline();
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const noteId = useId();
	const [showForgot, setShowForgot] = useState(false);
	const { failure, formFailure, leaving, submit, changed } =
		useAuthSubmit<LoginValues>({
			call: (value) =>
				authClient.signIn.email({
					email: value.email.trim(),
					password: value.password,
				}),
			destination,
			focusInvalid,
		});

	const form = useForm({
		defaultValues: EMPTY,
		validationLogic: revalidateLogic(),
		validators: { onDynamic: loginSchema },
		onSubmitInvalid: focusInvalid,
		onSubmit: ({ value }) => submit(value),
	});

	return (
		<form.Subscribe selector={(state) => state.isSubmitting}>
			{(submitting) => {
				const busy = submitting || leaving;
				const disabled = busy || !online;
				return (
					<form
						ref={formRef}
						noValidate
						className="flex flex-col gap-5"
						onSubmit={(event) => {
							event.preventDefault();
							if (!disabled) void form.handleSubmit();
						}}
					>
						{expired && (
							<p
								role="status"
								className="text-label text-ink-2 bg-soft rounded-control px-3 py-2"
							>
								{AUTH_MESSAGES.expired}
							</p>
						)}
						{!online && (
							<OfflineNote>{AUTH_MESSAGES.offline}</OfflineNote>
						)}
						<form.Field name="email">
							{(field) => (
								<TextInput
									label="Email"
									name="email"
									type="email"
									autoComplete="email"
									value={field.state.value}
									onChange={(value) => {
										field.handleChange(value);
										changed("email");
									}}
									onBlur={field.handleBlur}
									error={fieldError(field, failure)}
									isDisabled={disabled}
								/>
							)}
						</form.Field>
						<form.Field name="password">
							{(field) => (
								<PasswordInput
									label="Password"
									name="password"
									autoComplete="current-password"
									value={field.state.value}
									onChange={(value) => {
										field.handleChange(value);
										changed("password");
									}}
									onBlur={field.handleBlur}
									error={fieldError(field, failure)}
									isDisabled={disabled}
								/>
							)}
						</form.Field>
						<div className="flex flex-col gap-2">
							<Button
								variant="ghost"
								size="sm"
								className="-ml-3 self-start"
								aria-expanded={showForgot}
								aria-controls={noteId}
								onPress={() => setShowForgot((shown) => !shown)}
							>
								Forgot your password?
							</Button>
							<p
								id={noteId}
								hidden={!showForgot}
								className="text-label text-ink-2"
							>
								{AUTH_MESSAGES.forgotPassword}
							</p>
						</div>
						{formFailure && <FormAlert>{formFailure}</FormAlert>}
						<Button
							type="submit"
							size="lg"
							isPending={busy}
							isDisabled={!online}
						>
							Log in
						</Button>
						<p className="text-label text-ink-2">
							New here?{" "}
							<TextLink href="/signup">Create an account</TextLink>
						</p>
					</form>
				);
			}}
		</form.Subscribe>
	);
}
