import { afterAll, afterEach, beforeAll } from "vitest";
import { network } from "./src/server/__tests__/network";

// Runs in every database test file (`setupFiles`): the fake network is on for the whole file,
// and a handler a test adds with `network.use(...)` is removed after that test.
beforeAll(() => network.listen({ onUnhandledFrame: "error" }));
afterEach(() => network.resetHandlers());
afterAll(() => network.close());
