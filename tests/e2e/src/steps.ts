// Named steps with timing, and the one assertion helper the scenarios use.

import { strict as assert } from "node:assert";

export { assert };

export async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    const value = await run();
    console.log(`  ok    ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)`);
    return value;
  } catch (error) {
    console.error(`  FAIL  ${name}`);
    throw error;
  }
}

export function section(title: string): void {
  console.log(`\n${title}`);
}
