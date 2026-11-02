import { redirect } from "next/navigation";

import { Landing } from "@/features/auth/components/Landing";
import { signedInHome } from "@/server/dal/read";

/** `/`: a signed-in visitor goes on to the app; anyone else sees the landing page
 * (BR-F01-27). The proxy never redirects `/`, so this page decides with a checked session. */
export default async function Home({ searchParams }: PageProps<"/">) {
	const home = await signedInHome();
	if (home) redirect(home);
	const { deleted } = await searchParams;
	return <Landing deleted={deleted === "1"} />;
}
