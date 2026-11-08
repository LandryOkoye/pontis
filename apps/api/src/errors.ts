// Every non-2xx response is a structured `ApiError` (brief §10.1): a stable `code`, a human
// `message`, and field details for validation failures. Internals are logged, never returned.

import type { ApiError } from "@pontis/api-types";
import type { ErrorCode } from "@pontis/domain";
import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", 404, `${what} not found`);

function toApiError(error: unknown): { status: number; body: ApiError } {
  if (error instanceof ZodError) {
    const details = error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return {
      status: 400,
      body: { code: "VALIDATION_ERROR", message: "Request validation failed", details },
    };
  }
  if (error instanceof AppError)
    return { status: error.status, body: { code: error.code, message: error.message } };
  const fastify = error as FastifyError;
  // Malformed JSON bodies and similar client mistakes carry a 4xx statusCode.
  if (fastify.statusCode && fastify.statusCode >= 400 && fastify.statusCode < 500) {
    return { status: 400, body: { code: "VALIDATION_ERROR", message: fastify.message } };
  }
  return { status: 500, body: { code: "INTERNAL", message: "Internal error" } };
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const { status, body } = toApiError(error);
  if (status >= 500) request.log.error({ err: error }, "unhandled error");
  void reply.status(status).send(body);
}

export function notFoundHandler(_request: FastifyRequest, reply: FastifyReply): void {
  void reply.status(404).send({ code: "NOT_FOUND", message: "Route not found" } satisfies ApiError);
}
