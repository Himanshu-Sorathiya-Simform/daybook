// Runs once when the server starts, never during `next build` (BR-P2-38): a missing or
// malformed variable stops the process with the full list, instead of failing on first use.
export async function register(): Promise<void> {
	if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
	const { serverEnv } = await import("@/server/env");
	serverEnv();
}
