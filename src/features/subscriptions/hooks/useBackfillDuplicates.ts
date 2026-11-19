import { useQuery } from "@tanstack/react-query";

import { useMe } from "@/hooks/useMe";
import { duplicateSearchText } from "../lib/duplicates";
import { duplicatesOptions } from "../lib/queries";

/**
 * The expenses that may already hold the past charges Add offers (BR-F05-04): those dated from
 * `from`, the start date, to `to`, yesterday, whose payee equals the typed `name`, newest
 * first. It reads only for a name F03 can search for (BR-F05-48) and a period with a day in it,
 * and nothing before the profile's currency is known, which decides what counts as a number.
 */
export function useBackfillDuplicates({
	name,
	from,
	to,
}: {
	name: string;
	from: string;
	to: string;
}) {
	const { data: me } = useMe();
	const currency = me?.profile?.currency;
	const text = currency === undefined ? null : duplicateSearchText(name, currency);
	return useQuery(
		duplicatesOptions(
			text !== null && from <= to ? { name: text, from, to } : null,
		),
	);
}
