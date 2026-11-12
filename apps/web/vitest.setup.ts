import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { db } from "./src/mocks/db.ts";
import { server } from "./src/test/server.ts";

// Lazy routes and role queries are slow in jsdom; give async queries room.
configure({ asyncUtilTimeout: 8000 });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  db.reset();
});
afterAll(() => server.close());
