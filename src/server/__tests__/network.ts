import { setupServer } from "msw/node";
import { cleanRange } from "../auth/__tests__/pwned";

/** The fake network every database test runs behind (`vitest.integration.network.ts`). Outside
 * services are faked at this edge, never called (testing rule): the breached-password check
 * finds no breach unless a test says otherwise with `network.use(...)`, and any request without
 * a handler fails the test. Postgres is a TCP connection, which MSW never touches. */
export const network = setupServer(cleanRange);
