"use client";

import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { ComboBox } from "@/components/forms/ComboBox";
import { Select } from "@/components/forms/Select";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import type { CurrencyCode } from "@/lib/currency";
import type { WeekStart } from "@/lib/geo";
import { PROFILE_MESSAGES, profileCreateSchema } from "@/lib/profile";
import {
	type FieldErrors,
	type OnboardingField,
	useOnboardingSubmit,
} from "../hooks/useOnboardingSubmit";
import { ONBOARDING_TEXT } from "../lib/messages";
import {
	chooseCountry,
	type Device,
	type OnboardingValues,
	startState,
} from "../lib/onboarding";
import { countryOptions, currencyOptions } from "../lib/options";
import { OnboardingPreview } from "./OnboardingPreview";
import { TimeZoneField } from "./TimeZoneField";
import { WeekStartField } from "./WeekStartField";

export type OnboardingFieldsProps = {
	/** `null` while the page cannot yet know the browser: the form shows, disabled, as it loads. */
	device: Device | null;
	/** When the zone offsets and the Preview are worked out (D-511). */
	at: Date;
};

/** A field's message: the server's refusal of it, else the first of its own checks. */
function messageOf(field: AnyFieldApi, server: FieldErrors): string | undefined {
	const own = (field.state.meta.errors as ({ message?: string } | undefined)[])[0];
	return server[field.name as OnboardingField] ?? own?.message;
}

/**
 * The four choices, pre-filled from the device (BR-F02-03 to BR-F02-07), in TanStack Form
 * with the server's own schema (root 7.4, D-171), with the Preview beside them (D-511). A field
 * the user picks becomes dirty, even with the value it had, and that is what "picked by hand"
 * means; a country change writes the derived values without marking them.
 *
 * Until a country is chosen, currency, time zone and week start are disabled and empty, and
 * Start stays disabled with its reason under it; pressing it then asks for the country. Text
 * that matches no country, left with none chosen, says "Choose a country from the list.".
 * Offline, and while the page loads, the whole form is disabled (BR-F02-10).
 */
export function OnboardingFields({ device, at }: Readonly<OnboardingFieldsProps>) {
	const online = useOnline();
	const loading = device === null;
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const { errors, failure, busy, submit, clear } =
		useOnboardingSubmit(focusInvalid);
	const countries = useMemo(() => countryOptions(), []);
	const currencies = useMemo(() => currencyOptions(), []);
	// The country's own message: none chosen, or text that matches none (F02 section 8).
	const [countryMessage, setCountryMessage] = useState<string | null>(null);
	// What the user last typed in the country box. Read from the input's own events, since the
	// box also rewrites its text, as Tab and Escape do, and that is no typing.
	const typed = useRef("");

	const form = useForm({
		defaultValues: startState(device).values as OnboardingValues,
		validationLogic: revalidateLogic(),
		validators: { onDynamic: profileCreateSchema },
		onSubmitInvalid: focusInvalid,
		onSubmit: ({ value }) =>
			value.country ? submit({ ...value, country: value.country }) : undefined,
	});

	/** A new country (BR-F02-07): the rules in `lib/onboarding.ts`, applied to the form. */
	function changeCountry(country: string) {
		const picked = {
			currency: form.getFieldMeta("currency")?.isDirty ?? false,
			timezone: form.getFieldMeta("timezone")?.isDirty ?? false,
			weekStart: form.getFieldMeta("weekStart")?.isDirty ?? false,
		};
		const next = chooseCountry(
			{ values: form.state.values, picked },
			country,
			device?.zone,
		);
		// Every zone belongs to one country, so a zone carried over from the old country is
		// always replaced here, whether picked or not.
		form.setFieldValue("country", country);
		form.setFieldValue("currency", next.values.currency, {
			dontUpdateMeta: true,
		});
		form.setFieldValue("timezone", next.values.timezone, {
			dontUpdateMeta: true,
		});
		form.setFieldValue("weekStart", next.values.weekStart, {
			dontUpdateMeta: true,
		});
		setCountryMessage(null);
		clear("country", "currency", "timezone", "weekStart");
	}

	/** Start pressed before a country: say so under Country, and go there. */
	function askForCountry() {
		setCountryMessage(PROFILE_MESSAGES.countryRequired);
		focusInvalid();
	}

	return (
		<form.Subscribe selector={(state) => state.values}>
			{(values) => {
				const { country } = values;
				const disabled = busy || !online || loading;
				// Currency, time zone and week start follow the country, so wait for one.
				const waiting = disabled || !country;
				const placeholder =
					loading ? "" : ONBOARDING_TEXT.chooseCountryFirst;
				let blocked: string | null = null;
				if (!online) blocked = ONBOARDING_TEXT.blocked.offline;
				else if (loading) blocked = ONBOARDING_TEXT.blocked.loading;
				else if (!country) blocked = ONBOARDING_TEXT.blocked.country;
				return (
					<form
						ref={formRef}
						noValidate
						className="flex flex-col gap-7"
						onInput={(event) => {
							const box = event.target as HTMLInputElement;
							if (box.getAttribute("role") !== "combobox") return;
							typed.current = box.value;
							setCountryMessage(null);
						}}
						onSubmit={(event) => {
							event.preventDefault();
							if (!busy && !blocked) void form.handleSubmit();
						}}
					>
						{!online && (
							<OfflineNote className="max-w-120">
								{ONBOARDING_TEXT.offline}
							</OfflineNote>
						)}
						{failure && (
							<FormAlert
								takesFocus
								className="max-w-120"
							>
								{failure}
							</FormAlert>
						)}
						<div className="flex flex-wrap items-start gap-x-14 gap-y-8">
							<div className="flex max-w-120 min-w-0 flex-1 basis-85 flex-col gap-6">
								<form.Field name="country">
									{(field) => (
										<ComboBox
											label="Country"
											hint={ONBOARDING_TEXT.countryHint}
											error={
												countryMessage
												?? messageOf(field, errors)
											}
											options={countries}
											value={field.state.value}
											placeholder={
												loading ?
													ONBOARDING_TEXT.loadingPlaceholder
												:	ONBOARDING_TEXT.countryPlaceholder
											}
											emptyMessage={
												ONBOARDING_TEXT.noCountries
											}
											isDisabled={disabled}
											onBlur={() => {
												if (
													!field.state.value
													&& typed.current.trim()
												) {
													setCountryMessage(
														PROFILE_MESSAGES.countryUnknown,
													);
												}
												typed.current = "";
											}}
											onChange={(chosen) => {
												// Clearing the text chooses nothing; the country chosen before stays.
												if (chosen) changeCountry(chosen);
											}}
										/>
									)}
								</form.Field>
								<form.Field name="currency">
									{(field) => (
										<Select
											label="Currency"
											hint={ONBOARDING_TEXT.currencyHint}
											error={messageOf(field, errors)}
											options={currencies}
											value={
												country ? field.state.value : null
											}
											placeholder={placeholder}
											isDisabled={waiting}
											onChange={(currency) => {
												field.handleChange(
													currency as CurrencyCode,
												);
												clear("currency");
											}}
										/>
									)}
								</form.Field>
								<form.Field name="timezone">
									{(field) => (
										<TimeZoneField
											country={country}
											value={field.state.value}
											at={at}
											placeholder={placeholder}
											error={messageOf(field, errors)}
											isDisabled={disabled}
											onChange={(zone) => {
												field.handleChange(zone);
												clear("timezone");
											}}
										/>
									)}
								</form.Field>
								<form.Field name="weekStart">
									{(field) => (
										<WeekStartField
											value={
												country ? field.state.value : null
											}
											error={messageOf(field, errors)}
											isDisabled={waiting}
											onChange={(weekStart: WeekStart) => {
												field.handleChange(weekStart);
												clear("weekStart");
											}}
										/>
									)}
								</form.Field>
							</div>
							<OnboardingPreview
								choices={country ? { ...values, country } : null}
								isLoading={loading}
								at={at}
								className="max-w-105 min-w-0 flex-1 basis-75"
							/>
						</div>
						<Button
							type="submit"
							size="lg"
							isPending={busy}
							isDisabled={blocked !== null}
							{...(blocked ? { description: blocked } : {})}
							{...(blocked === ONBOARDING_TEXT.blocked.country ?
								{ onDisabledPress: askForCountry }
							:	{})}
							className="self-start"
						>
							{ONBOARDING_TEXT.submit}
						</Button>
					</form>
				);
			}}
		</form.Subscribe>
	);
}
