// Minimal NEAR JSON-RPC client: contract views and chain height. Plain `fetch`, injectable for tests.

export class RpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "RpcError";
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
    if (!response.ok) throw new RpcError(`RPC HTTP ${response.status}`);
    const body = (await response.json()) as JsonRpcResponse;
    if (body.error) {
      throw new RpcError(body.error.message ?? "RPC error", body.error.code);
    }
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

  async status(): Promise<{ chainId: string; latestBlockHeight: number }> {
    const status = (await this.call("status", [])) as {
      chain_id: string;
      sync_info: { latest_block_height: number };
    };
    return { chainId: status.chain_id, latestBlockHeight: status.sync_info.latest_block_height };
  }
}
