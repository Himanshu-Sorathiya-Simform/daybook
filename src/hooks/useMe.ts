import { useQuery } from "@tanstack/react-query";
import { meOptions } from "@/lib/api/me";

export type { Me } from "@/lib/api/me";

/** `/api/me`: fetched on first use, and on window focus once 60 seconds old (BR-P4-12). Use
 * it only where a session exists: a 401 here means the session expired (STATE-4). */
export function useMe() {
	return useQuery(meOptions());
}
