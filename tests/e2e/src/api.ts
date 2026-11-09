// A small client for the Pontis API. It never throws on HTTP errors, so scenarios can assert them;
// `parse` checks a successful body against the schema the API publishes.

import { ApiErrorSchema } from "@pontis/api-types";
import type { z } from "zod";

export interface Reply {
  status: number;
  body: unknown;
}

/** The body as `schema` describes it; fails with the body shown if the status or the shape is wrong. */
export function parse<S extends z.ZodType>(reply: Reply, schema: S, status = 200): z.infer<S> {
  if (reply.status !== status) {
    throw new Error(`expected HTTP ${status}, got ${reply.status}: ${JSON.stringify(reply.body)}`);
  }
  return schema.parse(reply.body);
}

/** The error code of a refusal, after checking the status. */
export function refusal(reply: Reply, status: number): string {
  if (reply.status !== status) {
    throw new Error(`expected HTTP ${status}, got ${reply.status}: ${JSON.stringify(reply.body)}`);
  }
  return ApiErrorSchema.parse(reply.body).code;
}

export class ApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly adminKey: string,
  ) {}

  private async send(
    method: string,
    path: string,
    init: { body?: unknown; headers?: Record<string, string> },
  ): Promise<Reply> {
    const response = await fetch(this.baseUrl + path, {
      method,
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });
    return { status: response.status, body: await response.json() };
  }

  get = (path: string, headers: Record<string, string> = {}) => this.send("GET", path, { headers });
  post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    this.send("POST", path, { body, headers });
  admin = (key = this.adminKey) =>
    this.get("/v1/admin/reconciliation", { authorization: `Bearer ${key}` });
}
