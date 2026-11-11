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

  /** The endpoint this client talks to. May carry credentials: redact before logging. */
  get url(): string {
    return this.options.url;
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

  /**
   * The access key `publicKey` of `accountId`: its type, or null if the account has no such key
   * (or no such account). Nodes report a missing key either as a JSON-RPC error with cause
   * `UNKNOWN_ACCESS_KEY` or as a `result.error` text; both are a null here.
   */
  async viewAccessKey(
    accountId: string,
    publicKey: string,
  ): Promise<{ type: "full_access" | "function_call" } | null> {
    let result: { permission?: unknown; error?: string };
    try {
      result = (await this.call("query", {
        request_type: "view_access_key",
        finality: "final",
        account_id: accountId,
        public_key: publicKey,
      })) as typeof result;
    } catch (error) {
      if (
        error instanceof RpcError &&
        (error.causeName === "UNKNOWN_ACCESS_KEY" ||
          error.causeName === "UNKNOWN_ACCOUNT" ||
          /does not exist/.test(error.message))
      )
        return null;
      throw error;
    }
    if (result.error !== undefined) {
      if (/does not exist/.test(result.error)) return null;
      throw new RpcError(`view_access_key: ${result.error}`);
    }
    if (result.permission === "FullAccess") return { type: "full_access" };
    if (
      typeof result.permission === "object" &&
      result.permission !== null &&
      "FunctionCall" in result.permission
    )
      return { type: "function_call" };
    throw new RpcError("view_access_key: unrecognised permission in the response");
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
