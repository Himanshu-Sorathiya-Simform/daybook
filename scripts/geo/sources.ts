import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { GeoSources } from "./build";

/** The tzdb release the vendored files come from (`sources/README.md`). */
export const TZDB_VERSION = "2026e";

/** SHA-256 of each vendored file, so an edited or swapped file stops the generator. Update
 * them only together with `TZDB_VERSION`, from the release's own files. */
export const SOURCE_HASHES = {
	"zone.tab": "e2e8e31c4e10f44576c79345e76060591dbb3eef6ce14e006afc8a373caa9593",
	backward: "b8296b9ef1ece72d813878132c0f17e2c52b26af6004eeb9c37d049b64cd9401",
} as const;

const require = createRequire(import.meta.url);

/** The folder of vendored files. */
export const SOURCES_DIR = fileURLToPath(new URL("./sources/", import.meta.url));

function readSource(dir: string, name: keyof typeof SOURCE_HASHES): string {
	const text = readFileSync(join(dir, name), "utf8");
	const hash = createHash("sha256").update(text, "utf8").digest("hex");
	if (hash !== SOURCE_HASHES[name]) {
		throw new Error(
			`${name} is not the pinned tzdb ${TZDB_VERSION} file (SHA-256 ${hash})`,
		);
	}
	return text;
}

/** The pinned inputs: tzdb's `zone.tab` and `backward`, the `cldr-core` week data, and the
 * versions to record. ICU is whatever this Node carries; it decides the number locales. */
export function loadSources(dir: string = SOURCES_DIR): GeoSources {
	const weekData = require("cldr-core/supplemental/weekData.json") as {
		supplemental: { weekData: { firstDay: Record<string, string> } };
	};
	const cldr = require("cldr-core/package.json") as { version: string };
	return {
		zoneTab: readSource(dir, "zone.tab"),
		backward: readSource(dir, "backward"),
		firstDay: weekData.supplemental.weekData.firstDay,
		versions: {
			tzdb: TZDB_VERSION,
			cldr: cldr.version,
			icu: process.versions["icu"] ?? "",
		},
	};
}
