import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Adds DOM matchers like toBeInTheDocument(), and unmounts rendered
// components after each test so tests don't see each other's DOM.
afterEach(() => cleanup());
