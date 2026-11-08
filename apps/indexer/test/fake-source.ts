// An in-memory chain for the loop tests: a final height and the executions of each block.

import type { ChainSource, CoreExecution } from "../src/chain-source.ts";
import type { Logger } from "../src/indexer.ts";

export class FakeSource implements ChainSource {
  readonly reads: number[] = [];
  /** Heights whose read throws until `failAt` is cleared. */
  failAt = new Set<number>();

  constructor(
    public final: number,
    private readonly blocks = new Map<number, CoreExecution[]>(),
  ) {}

  put(height: number, ...executions: CoreExecution[]): void {
    this.blocks.set(height, [...(this.blocks.get(height) ?? []), ...executions]);
  }

  async finalHeight(): Promise<number> {
    return this.final;
  }

  async executionsAt(height: number): Promise<CoreExecution[]> {
    this.reads.push(height);
    if (this.failAt.has(height)) throw new Error(`rpc down at ${height}`);
    return this.blocks.get(height) ?? [];
  }
}

export const silent: Logger & { errors: string[] } = {
  errors: [],
  info() {},
  error(message) {
    this.errors.push(message);
  },
};
