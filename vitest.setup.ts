import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Without `globals: true`, Testing Library cannot auto-register its cleanup,
// so unmount rendered components after each test ourselves.
afterEach(() => {
	cleanup();
});
