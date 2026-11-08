// Minimal NEAR JSON-RPC client: contract views and chain height. Plain `fetch`, injectable for tests.

export class RpcError extends Error {
  /** The node's `error.cause.name`, for example `UNKNOWN_BLOCK`. */
  readonly causeName: string | undefined;
  readonly httpStatus: number | undefined;

  constructor(
    message: string,
    readonly code?: number,
    detail: { causeName?: string; httpStatus?: number } = {},
  ) {
    super(message);
    this.name = "RpcError";
    this.causeName = detail.causeName;
    this.httpStatus = detail.httpStatus;
  }
}

/** A view call reached the contract and the contract panicked (for example "relationship not found"). */
export class ContractError extends RpcError {
  constructor(
    readonly contractId: string,
    readonly method: string,
    message: string,
  ) {
    super(`${contractId}.${method}: ${message}`);
    this.name = "ContractError";
  }
}

export interface RpcClientOptions {
  readonly url: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

interface JsonRpcResponse {
  result?: unknown;
  error?: { code?: number; message?: string; data?: unknown; cause?: { name?: string } };
}

export class RpcClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private nextId = 1;

  constructor(private readonly options: RpcClientOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async call(method: string, params: unknown): Promise<unknown> {
    const response = await this.fetchImpl(this.options.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: this.nextId++, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    // Nodes answer some failures (an unknown block, for example) with HTTP 422 and a JSON-RPC body.
    const body = (await response.json().catch(() => ({}))) as JsonRpcResponse;
    if (body.error) {
      const { message = "RPC error", data } = body.error;
      throw new RpcError(
        typeof data === "string" ? `${message}: ${data}` : message,
        body.error.code,
        {
          ...(body.error.cause?.name ? { causeName: body.error.cause.name } : {}),
          httpStatus: response.status,
        },
      );
    }
    if (!response.ok)
      throw new RpcError(`RPC HTTP ${response.status}`, undefined, { httpStatus: response.status });
    return body.result;
  }

  /** Calls a view method with JSON args and returns the parsed JSON result. */
  async view(
    contractId: string,
    method: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    const result = (await this.call("query", {
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: method,
      args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
    })) as { result?: number[]; error?: string };
    if (result.error) throw new ContractError(contractId, method, result.error);
    return JSON.parse(Buffer.from(result.result ?? []).toString("utf8"));
  }

  async status(): Promise<{
    chainId: string;
    latestBlockHeight: number;
    /** Oldest block the node still has; `undefined` if the node does not say. */
    earliestBlockHeight: number | undefined;
  }> {
    const status = (await this.call("status", [])) as {
      chain_id: string;
      sync_info: { latest_block_height: number; earliest_block_height?: number };
    };
    return {
      chainId: status.chain_id,
      latestBlockHeight: status.sync_info.latest_block_height,
      earliestBlockHeight: status.sync_info.earliest_block_height,
    };
  }
}
