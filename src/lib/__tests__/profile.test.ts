import { describe, expect, test } from "vitest";
import { CURRENCY_EXPONENTS } from "@/lib/currency";
import {
	PROFILE_MESSAGES,
	profileBlock,
	profileCreateSchema,
	WEEK_STARTS,
} from "../profile";

// F02 section 11's illustrative onboarding body.
const VALID = {
	country: "IN",
	currency: "INR",
	timezone: "Asia/Kolkata",
	weekStart: "sunday",
};

/** The first message per field, as the API's `fields` holds them (BR-P2-24). */
function fieldsOf(body: unknown): Record<string, string> {
	const result = profileCreateSchema.safeParse(body);
	if (result.success) return {};
	const fields: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const keys =
			issue.code === "unrecognized_keys" ?
				issue.keys
			:	[issue.path.join(".") || "_body"];
		for (const key of keys) fields[key] ??= issue.message;
	}
	return fields;
}

describe("profileCreateSchema (BR-F02-08)", () => {
	test("accepts F02's example body unchanged", () => {
		expect(profileCreateSchema.parse(VALID)).toEqual(VALID);
	});

	test.each(Object.keys(CURRENCY_EXPONENTS))(
		"accepts the MON-2 currency %s",
		(currency) => {
			expect(fieldsOf({ ...VALID, currency })).toEqual({});
		},
	);

	test.each(WEEK_STARTS)("accepts the week start %s", (weekStart) => {
		expect(fieldsOf({ ...VALID, weekStart })).toEqual({});
	});

	test("accepts a currency other than the country's default (BR-F02-07)", () => {
		expect(fieldsOf({ ...VALID, currency: "USD" })).toEqual({});
	});

	test("accepts any of a multi-zone country's zones, not only its default", () => {
		expect(
			fieldsOf({
				country: "US",
				currency: "USD",
				timezone: "America/Los_Angeles",
				weekStart: "sunday",
			}),
		).toEqual({});
	});

	describe("country", () => {
		test.each([
			["missing", undefined],
			["empty", ""],
			["a number", 91],
			["null", null],
		])("asks for one when %s", (_name, country) => {
			expect(fieldsOf({ ...VALID, country })).toEqual({
				country: PROFILE_MESSAGES.countryRequired,
			});
		});

		test.each([
			["an unknown code", "ZZ"],
			["lower case", "in"],
			["a three-letter code", "IND"],
			["padded", " IN"],
			["a name", "India"],
		])("asks for one from the list for %s", (_name, country) => {
			expect(fieldsOf({ ...VALID, country })).toEqual({
				country: PROFILE_MESSAGES.countryUnknown,
			});
		});

		test("an unknown country leaves a known zone unquestioned", () => {
			expect(
				fieldsOf({ ...VALID, country: "ZZ", timezone: "Asia/Kolkata" }),
			).toEqual({
				country: PROFILE_MESSAGES.countryUnknown,
			});
		});

		test("an unknown country and an unknown zone both get their message", () => {
			expect(
				fieldsOf({ ...VALID, country: "ZZ", timezone: "Mars/Olympus" }),
			).toEqual({
				country: PROFILE_MESSAGES.countryUnknown,
				timezone: PROFILE_MESSAGES.timezoneInCountry,
			});
		});
	});

	describe("currency", () => {
		test.each([
			["missing", undefined],
			["lower case", "inr"],
			["outside MON-2", "AUD"],
			["empty", ""],
			["a number", 356],
		])("asks for a listed one when %s", (_name, currency) => {
			expect(fieldsOf({ ...VALID, currency })).toEqual({
				currency: PROFILE_MESSAGES.currency,
			});
		});
	});

	// AC-F02-06
	describe("timezone (D-211)", () => {
		test.each([
			["another country's zone", "Asia/Dubai"],
			["UTC, which no country has", "UTC"],
			["a legacy alias of the country's zone", "Asia/Calcutta"],
			["an unknown name", "Asia/Mumbai"],
			["empty", ""],
			["missing", undefined],
			["a number", 330],
			["lower case", "asia/kolkata"],
		])("refuses %s", (_name, timezone) => {
			expect(fieldsOf({ ...VALID, timezone })).toEqual({
				timezone: PROFILE_MESSAGES.timezoneInCountry,
			});
		});

		test("refuses a zone `backward` links to the country's zone, which belongs elsewhere", () => {
			// Asia/Kuwait is KW's own zone in zone.tab, though backward links it to Asia/Riyadh.
			expect(
				fieldsOf({
					...VALID,
					country: "SA",
					currency: "USD",
					timezone: "Asia/Kuwait",
				}),
			).toEqual({ timezone: PROFILE_MESSAGES.timezoneInCountry });
		});
	});

	describe("weekStart", () => {
		test.each([
			["missing", undefined],
			["capitalized", "Monday"],
			["another day", "friday"],
			["a CLDR short name", "mon"],
			["a number", 1],
		])("asks for one when %s", (_name, weekStart) => {
			expect(fieldsOf({ ...VALID, weekStart })).toEqual({
				weekStart: PROFILE_MESSAGES.weekStart,
			});
		});
	});

	describe("the body as a whole", () => {
		test.each(["lastCatchUpOn", "version", "userId", "id", "numberLocale"])(
			"refuses the field %s, which Daybook sets",
			(field) => {
				expect(Object.keys(fieldsOf({ ...VALID, [field]: "x" }))).toEqual([
					field,
				]);
			},
		);

		test("an empty body gets every field's message", () => {
			expect(fieldsOf({})).toEqual({
				country: PROFILE_MESSAGES.countryRequired,
				currency: PROFILE_MESSAGES.currency,
				timezone: PROFILE_MESSAGES.timezoneInCountry,
				weekStart: PROFILE_MESSAGES.weekStart,
			});
		});

		test.each([
			["null", null],
			["an array", [VALID]],
			["a string", "IN"],
		])("refuses %s as a body", (_name, body) => {
			expect(profileCreateSchema.safeParse(body).success).toBe(false);
		});
	});
});

describe("profileBlock (BR-F02-18, BR-F02-25)", () => {
	test("adds the country's two locales to the stored fields", () => {
		expect(
			profileBlock({
				country: "IN",
				currency: "INR",
				timezone: "Asia/Kolkata",
				weekStart: "monday",
			}),
		).toEqual({
			country: "IN",
			currency: "INR",
			timezone: "Asia/Kolkata",
			weekStart: "monday",
			numberLocale: "hi-IN-u-nu-latn",
			dateLocale: "en-IN",
		});
	});

	test.each([
		["DE", "de-DE-u-nu-latn", "en-DE"],
		["US", "en-US-u-nu-latn", "en-US"],
		["KW", "en-KW-u-nu-latn", "en-KW"],
	])(
		"%s formats numbers as %s and dates as %s",
		(country, numberLocale, dateLocale) => {
			const block = profileBlock({
				country,
				currency: "USD",
				timezone: "UTC",
				weekStart: "monday",
			});
			expect(block.numberLocale).toBe(numberLocale);
			expect(block.dateLocale).toBe(dateLocale);
		},
	);

	test("keeps the stored fields as they are, whatever the country's defaults", () => {
		const block = profileBlock({
			country: "IN",
			currency: "USD",
			timezone: "UTC",
			weekStart: "saturday",
		});
		expect(block).toMatchObject({
			currency: "USD",
			timezone: "UTC",
			weekStart: "saturday",
		});
	});
});
