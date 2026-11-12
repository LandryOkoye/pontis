import { setupWorker } from "msw/browser";
import { handlers } from "./handlers.ts";

/** Starts the mock API in the browser. Only loaded when `VITE_API_MODE=mock`. */
export async function startMockApi(): Promise<void> {
  await setupWorker(...handlers).start({ onUnhandledFrame: "bypass", quiet: true });
}
