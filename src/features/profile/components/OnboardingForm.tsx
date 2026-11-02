"use client";

import { useState } from "react";

import { useDevice } from "../hooks/useDevice";
import type { Device } from "../lib/onboarding";
import { OnboardingFields } from "./OnboardingFields";
import { OnboardingLoading } from "./OnboardingLoading";

export type OnboardingFormProps = {
	/** For tests; the page reads the browser's own. */
	device?: Device;
	/** For tests; offsets otherwise use the time the page opened (D-511). */
	now?: Date;
};

/**
 * Onboarding (F02 flow 7.1). The pre-fill needs the browser's zone and language, which the
 * server cannot know, so the server draws a busy outline and the browser draws the form (F02
 * section 6, loading).
 */
export function OnboardingForm({
	device: given,
	now,
}: Readonly<OnboardingFormProps>) {
	const browser = useDevice();
	const [at] = useState(() => now ?? new Date());
	const device = given ?? browser;
	if (!device) return <OnboardingLoading />;
	return (
		<OnboardingFields
			device={device}
			at={at}
		/>
	);
}
