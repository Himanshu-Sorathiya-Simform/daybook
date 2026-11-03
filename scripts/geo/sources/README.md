# Geo module sources

The pinned inputs of `pnpm geo:generate` (`scripts/geo/generate.ts`, D-209). The app never downloads them; the generated `src/lib/geo/data.ts` is committed.

| File       | From                                                                                                  | Licence       |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------- |
| `zone.tab` | IANA tzdb 2026e, [`tzdata2026e.tar.gz`](https://data.iana.org/time-zones/releases/tzdata2026e.tar.gz) | Public domain |
| `backward` | The same release                                                                                      | Public domain |

Both files are byte for byte as released. `scripts/geo/sources.ts` holds each file's SHA-256 and stops the generator when a file differs.

Week starts come from the `cldr-core` package, pinned to an exact version in `package.json`. Number locales come from the ICU that Node carries when the generator runs; the module records its version.

## Updating

1. Download the new `tzdataYYYYx.tar.gz` from IANA and check it against its `.asc` signature.
2. Replace `zone.tab` and `backward` with the release's files, unchanged.
3. Update `TZDB_VERSION` and both hashes in `scripts/geo/sources.ts`.
4. Run `pnpm geo:generate`, read the diff of `src/lib/geo/data.ts`, and run the tests: a new multi-zone country needs a default in `DEFAULT_ZONES`.
