// Read-only contract calls straight over NEAR JSON-RPC. No signing, no wallet needed.
import { config } from "../lib/config.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

interface RpcAnswer {
  result?: { result?: number[]; error?: string };
  error?: { message?: string; data?: unknown };
}

export async function viewCall<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "pontis-web",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: toBase64(encoder.encode(JSON.stringify(args))),
      },
    }),
  });
  if (!response.ok) throw new Error(`NEAR RPC answered ${response.status}.`);
  const payload = (await response.json()) as RpcAnswer;
  if (payload.error) throw new Error(payload.error.message ?? "NEAR RPC error.");
  if (payload.result?.error) throw new Error(payload.result.error);
  const bytes = Uint8Array.from(payload.result?.result ?? []);
  return JSON.parse(decoder.decode(bytes)) as T;
}
