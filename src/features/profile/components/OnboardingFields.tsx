"use client";

import { type AnyFieldApi, revalidateLogic, useForm } from "@tanstack/react-form";
import { useMemo, useRef } from "react";

import { Button } from "@/components/actions/Button";
import { FormAlert } from "@/components/feedback/FormAlert";
import { OfflineNote } from "@/components/feedback/OfflineNote";
import { ComboBox } from "@/components/forms/ComboBox";
import { Select } from "@/components/forms/Select";
import { useFocusFirstInvalid } from "@/hooks/useFocusFirstInvalid";
import { useOnline } from "@/hooks/useOnline";
import type { CurrencyCode } from "@/lib/currency";
import type { WeekStart } from "@/lib/geo";
import { profileCreateSchema } from "@/lib/profile";
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
import { TimeZoneField } from "./TimeZoneField";
import { WeekStartField } from "./WeekStartField";

export type OnboardingFieldsProps = {
	device: Device;
	/** When the zone offsets are worked out (D-511). */
	at: Date;
};

/** A field's message: the server's refusal of it, else the first of its own checks. */
function messageOf(field: AnyFieldApi, server: FieldErrors): string | undefined {
	const own = (field.state.meta.errors as ({ message?: string } | undefined)[])[0];
	return server[field.name as OnboardingField] ?? own?.message;
}

/**
 * The four choices, pre-filled from the device (BR-F02-03 to BR-F02-07), in TanStack Form
 * with the server's own schema (root 7.4, D-171). A field the user picks becomes dirty, even
 * with the value it had, and that is what "picked by hand" means (D-511); a country change
 * writes the derived values without marking them. Start stays disabled until a country is
 * chosen; offline, the whole form is disabled (BR-F02-10).
 */
export function OnboardingFields({ device, at }: Readonly<OnboardingFieldsProps>) {
	const online = useOnline();
	const formRef = useRef<HTMLFormElement>(null);
	const focusInvalid = useFocusFirstInvalid(formRef);
	const { errors, failure, busy, submit, clear } =
		useOnboardingSubmit(focusInvalid);
	const countries = useMemo(() => countryOptions(), []);
	const currencies = useMemo(() => currencyOptions(), []);

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
			device.zone,
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
		clear("country", "currency", "timezone", "weekStart");
	}

	return (
		<form.Subscribe selector={(state) => state.values.country}>
			{(country) => {
				const disabled = busy || !online;
				return (
					<form
						ref={formRef}
						noValidate
						className="flex flex-col gap-5"
						onSubmit={(event) => {
							event.preventDefault();
							if (!disabled && country) void form.handleSubmit();
						}}
					>
						{!online && (
							<OfflineNote>{ONBOARDING_TEXT.offline}</OfflineNote>
						)}
						<form.Field name="country">
							{(field) => (
								<ComboBox
									label="Country"
									hint={ONBOARDING_TEXT.countryHint}
									error={messageOf(field, errors)}
									options={countries}
									value={field.state.value}
									emptyMessage={ONBOARDING_TEXT.noCountries}
									isDisabled={disabled}
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
									value={field.state.value}
									isDisabled={disabled}
									onChange={(currency) => {
										field.handleChange(currency as CurrencyCode);
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
									value={field.state.value}
									error={messageOf(field, errors)}
									isDisabled={disabled}
									onChange={(weekStart: WeekStart) => {
										field.handleChange(weekStart);
										clear("weekStart");
									}}
								/>
							)}
						</form.Field>
						{failure && <FormAlert>{failure}</FormAlert>}
						<Button
							type="submit"
							size="lg"
							isPending={busy}
							isDisabled={!online || !country}
						>
							{ONBOARDING_TEXT.submit}
						</Button>
					</form>
				);
			}}
		</form.Subscribe>
	);
}
