/**
 * `pnpm geo:generate` writes `src/lib/geo/data.ts` from the pinned sources (D-209). Commit the
 * result after reading its diff: a newer ICU can change a country's number locale.
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { format, resolveConfig } from "prettier";
import { buildGeo, renderModule } from "./build";
import { loadSources } from "./sources";

/** Where the generated module lives. */
export const GEO_MODULE = fileURLToPath(
	new URL("../../src/lib/geo/data.ts", import.meta.url),
);

async function main(): Promise<void> {
	const data = buildGeo(loadSources());
	const config = await resolveConfig(GEO_MODULE);
	writeFileSync(
		GEO_MODULE,
		await format(renderModule(data), { ...config, filepath: GEO_MODULE }),
	);
	const countries = Object.keys(data.countries).length;
	const aliases = Object.keys(data.aliases).length;
	const { tzdb, cldr, icu } = data.sources;
	console.log(
		`Wrote ${countries} countries and ${aliases} aliases (tzdb ${tzdb}, cldr-core ${cldr}, ICU ${icu}).`,
	);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
