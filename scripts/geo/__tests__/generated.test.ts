// @vitest-environment node
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GEO_DATA } from "../../../src/lib/geo/data";
import { buildGeo, isClean, isConsistent } from "../build";
import { loadSources, SOURCES_DIR, TZDB_VERSION } from "../sources";

/** The committed module against a fresh run of the generator (D-209). Number locales depend on
 * the ICU that Node carries, so they are compared only under the ICU that generated them;
 * under any ICU they must still pass BR-F02-18's checks (AC-F02-19). */
const fresh = buildGeo(loadSources());
const sameIcu = process.versions["icu"] === GEO_DATA.sources.icu;

const withoutNumberLocales = (data: typeof GEO_DATA) => ({
	sources: { ...data.sources, icu: "" },
	aliases: data.aliases,
	countries: Object.fromEntries(
		Object.entries(data.countries).map(([code, country]) => [
			code,
			{ ...country, numberLocale: "" },
		]),
	),
});

describe("the committed geo module", () => {
	test("matches the pinned sources: countries, zones, defaults, week starts, currencies, aliases", () => {
		expect(withoutNumberLocales(GEO_DATA)).toEqual(withoutNumberLocales(fresh));
	});

	test("was generated from tzdb 2026e and cldr-core 49.0.0", () => {
		expect(GEO_DATA.sources.tzdb).toBe(TZDB_VERSION);
		expect(GEO_DATA.sources.tzdb).toBe("2026e");
		expect(GEO_DATA.sources.cldr).toBe("49.0.0");
	});

	test("has the number locales this ICU computes, when it is the ICU that generated them", () => {
		const locales = (data: typeof GEO_DATA) =>
			Object.fromEntries(
				Object.entries(data.countries).map(([code, { numberLocale }]) => [
					code,
					numberLocale,
				]),
			);
		if (sameIcu) expect(locales(GEO_DATA)).toEqual(locales(fresh));
		else expect(GEO_DATA.sources.icu).not.toBe(process.versions["icu"]);
	});

	// AC-F02-19
	test("every country's number locale is clean and consistent for all six currencies", () => {
		const failing = Object.entries(GEO_DATA.countries)
			.filter(
				([, { numberLocale }]) =>
					!isClean(numberLocale) || !isConsistent(numberLocale),
			)
			.map(([code, { numberLocale }]) => `${code} ${numberLocale}`);
		expect(failing).toEqual([]);
	});

	// AC-F02-19
	test.each(["KW", "SA", "EG"])("%s uses en-%s", (code) => {
		expect(GEO_DATA.countries[code]!.numberLocale).toBe(`en-${code}-u-nu-latn`);
	});

	test("every number locale carries Latin digits", () => {
		const other = Object.values(GEO_DATA.countries).filter(
			({ numberLocale }) => !numberLocale.endsWith("-u-nu-latn"),
		);
		expect(other).toEqual([]);
	});
});

describe("the pinned sources", () => {
	let dir: string | undefined;
	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
	});

	test("an edited zone.tab stops the generator", () => {
		dir = mkdtempSync(join(tmpdir(), "geo-sources-"));
		copyFileSync(join(SOURCES_DIR, "backward"), join(dir, "backward"));
		writeFileSync(join(dir, "zone.tab"), "IN\t+2232+08822\tAsia/Kolkata\n");
		expect(() => loadSources(dir)).toThrow(
			/zone\.tab is not the pinned tzdb 2026e file/,
		);
	});

	test("an edited backward stops the generator", () => {
		dir = mkdtempSync(join(tmpdir(), "geo-sources-"));
		copyFileSync(join(SOURCES_DIR, "zone.tab"), join(dir, "zone.tab"));
		writeFileSync(join(dir, "backward"), "Link\tAsia/Kolkata\tAsia/Calcutta\n");
		expect(() => loadSources(dir)).toThrow(
			/backward is not the pinned tzdb 2026e file/,
		);
	});

	test("the vendored files load", () => {
		expect(() => loadSources()).not.toThrow();
	});
});
