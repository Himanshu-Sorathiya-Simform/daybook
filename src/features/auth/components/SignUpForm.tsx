"use client";

import { revalidateLogic, useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { PasswordInput } from "@/components/forms/PasswordInput";
import { TextInput } from "@/components/forms/TextInput";
import { TextLink } from "@/components/navigation/TextLink";
import { useAppSession } from "@/hooks/useAppSession";
import { useOnline } from "@/hooks/useOnline";
import { authClient } from "@/lib/auth-client";
import { finishOldLogout } from "../lib/finish-old-logout";
import { useFocusFirstInvalid } from "../hooks/useFocusFirstInvalid";
import { fieldError } from "../lib/field-error";
import { FormAlert } from "./FormAlert";
import { OfflineNote } from "./OfflineNote";
import { AUTH_MESSAGES, type AuthFailure, authFailure } from "../lib/messages";
import { type SignUpValues, signUpSchema } from "../lib/schemas";
import { StrengthMeter } from "./StrengthMeter";

const EMPTY: SignUpValues = { email: "", password: "", name: "" };

/**
 * Sign-up (F01 flow 7.1): email, password with the strength meter and a show/hide button,
 * display name. Fields are checked on submit, then as they change (D-510). A refusal shows
 * under its field or above the button; a breached password clears only the password. Success
 * opens `/onboarding` with a full page load (BR-F01-06). Offline, the form is disabled.
 */
export function SignUpForm() {
	const { navigate } = useAppSession();
	const online = useOnline();
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const [failure, setFailure] = useState<AuthFailure | null>(null);
	const [leaving, setLeaving] = useState(false);

	const form = useForm({
		defaultValues: EMPTY,
		validationLogic: revalidateLogic(),
		validators: { onDynamic: signUpSchema },
		onSubmitInvalid: focusInvalid,
		onSubmit: async ({ value }) => {
			setFailure(null);
			if (!(await finishOldLogout())) {
				setFailure({ form: AUTH_MESSAGES.oldSession });
				return;
			}
			let error;
			try {
				({ error } = await authClient.signUp.email({
					email: value.email.trim(),
					password: value.password,
					name: value.name,
				}));
			} catch {
				setFailure({ form: AUTH_MESSAGES.failed });
				return;
			}
			if (error) {
				const refusal = authFailure(error);
				if (error.code === "PASSWORD_BREACHED")
					form.setFieldValue("password", "");
				setFailure(refusal);
				focusInvalid();
				return;
			}
			setLeaving(true);
			navigate("/onboarding");
		},
	});

	/** A field's server refusal goes once the user changes that field. */
	const changed = (name: keyof SignUpValues) => {
		if (failure && "field" in failure && failure.field === name)
			setFailure(null);
	};

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
						<OfflineNote online={online} />
						<form.Field name="email">
							{(field) => (
								<div className="flex flex-col gap-1.5">
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
									{failure
										&& "field" in failure
										&& failure.message
											=== AUTH_MESSAGES.emailTaken && (
											<TextLink
												href="/login"
												className="text-label self-start"
											>
												Log in instead.
											</TextLink>
										)}
								</div>
							)}
						</form.Field>
						<form.Field name="password">
							{(field) => (
								<div className="flex flex-col gap-2">
									<PasswordInput
										label="Password"
										name="password"
										autoComplete="new-password"
										hint="At least 12 characters."
										value={field.state.value}
										onChange={(value) => {
											field.handleChange(value);
											changed("password");
										}}
										onBlur={field.handleBlur}
										error={fieldError(field, failure)}
										isDisabled={disabled}
									/>
									<form.Subscribe
										selector={(state) => [
											state.values.email,
											state.values.name,
										]}
									>
										{(inputs) => (
											<StrengthMeter
												password={field.state.value}
												userInputs={inputs.filter(Boolean)}
											/>
										)}
									</form.Subscribe>
								</div>
							)}
						</form.Field>
						<form.Field name="name">
							{(field) => (
								<TextInput
									label="Display name"
									name="name"
									autoComplete="name"
									value={field.state.value}
									onChange={(value) => {
										field.handleChange(value);
										changed("name");
									}}
									onBlur={field.handleBlur}
									error={fieldError(field, failure)}
									isDisabled={disabled}
								/>
							)}
						</form.Field>
						<FormAlert failure={failure} />
						<Button
							type="submit"
							size="lg"
							isPending={busy}
							isDisabled={!online}
						>
							Create account
						</Button>
						<p className="text-label text-ink-2">
							Already have an account?{" "}
							<TextLink href="/login">Log in</TextLink>
						</p>
					</form>
				);
			}}
		</form.Subscribe>
	);
}
