/** A page's `searchParams` as `URLSearchParams`, every value of a repeated name kept in order,
 * so a page reads its query exactly as the browser and the API do: a repeated name stays
 * repeated, and so invalid (D-458), and an empty value stays empty, and so absent. */
export function toSearchParams(
	params: Readonly<Record<string, string | readonly string[] | undefined>>,
): URLSearchParams {
	const query = new URLSearchParams();
	for (const [name, value] of Object.entries(params))
		for (const each of [value ?? []].flat()) query.append(name, each);
	return query;
}
