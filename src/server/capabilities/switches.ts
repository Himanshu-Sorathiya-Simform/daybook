import "server-only";
import { compareCodeUnits } from "@/lib/compare";
import {
	CAPABILITY_CODES,
	type CapabilityCode,
	entryOf,
	type FlagCode,
} from "./registry";

/** The kill switches set in the environment: each flag forced `on` or `off` (CAP-3). */
export type FlagSwitches = Partial<Record<FlagCode, "on" | "off">>;

/** A code's kill-switch variable (BR-P4-06): dots become underscores and camelCase becomes
 * upper snake case, so `dashboard.dragAndDrop` is `FLAG_DASHBOARD_DRAG_AND_DROP`. */
export function switchName(code: string): string {
	const segments = code
		.split(".")
		.map((segment) =>
			segment.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase(),
		);
	return `FLAG_${segments.join("_")}`;
}

const CODE_BY_NAME: ReadonlyMap<string, CapabilityCode> = new Map(
	CAPABILITY_CODES.map((code) => [switchName(code), code]),
);

/**
 * Reads every `FLAG_` variable (BR-P4-07). Each must name a flag in the registry and be `on`
 * or `off`, exactly; anything else is a problem, listed by variable name and never by value
 * (BR-P2-38). Startup refuses to run with any problem.
 */
export function parseFlagSwitches(
	source: Readonly<Record<string, string | undefined>>,
): {
	switches: FlagSwitches;
	problems: string[];
} {
	const switches: FlagSwitches = {};
	const problems: string[] = [];
	const names = Object.keys(source)
		.filter((name) => name.startsWith("FLAG_") && source[name] !== undefined)
		.sort(compareCodeUnits);
	for (const name of names) {
		const code = CODE_BY_NAME.get(name);
		if (!code) {
			problems.push(`${name} names no capability in the registry`);
			continue;
		}
		const { kind } = entryOf(code);
		if (kind !== "flag") {
			problems.push(
				`${name} must not be set: ${code} is a ${kind}, not a flag`,
			);
			continue;
		}
		const value = source[name];
		if (value !== "on" && value !== "off") {
			problems.push(`${name} must be on or off`);
			continue;
		}
		switches[code as FlagCode] = value;
	}
	return { switches, problems };
}
