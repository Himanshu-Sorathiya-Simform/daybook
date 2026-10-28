import { handleAuthRequest } from "@/server/auth/auth";

// Better Auth's endpoints, limited to P2's allow-list (BR-P2-40). They do not go through the
// route wrapper; Better Auth applies its own origin and rate-limit checks.
export const GET = (request: Request) => handleAuthRequest(request);
export const POST = (request: Request) => handleAuthRequest(request);
