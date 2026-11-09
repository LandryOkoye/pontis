// What the API writes to its logs (brief §10.1, §14.3): request lines without headers, bodies or
// query strings, and error text with secrets removed. The signer key, admin key and database
// password must never reach a log line, whichever code path produced the error.

import type { FastifyError, FastifyRequest, FastifyServerOptions } from "fastify";
import type { Writable } from "node:stream";

const PATTERNS: [RegExp, string][] = [
  // ed25519 secret keys (base58); a public key matching it is redacted too, which is harmless.
  [/ed25519:[1-9A-HJ-NP-Za-km-z]{40,}/g, "ed25519:[redacted]"],
  [/Bearer\s+[^\s"']+/gi, "Bearer [redacted]"],
  // Credentials inside connection strings.
  [/\b(postgres(?:ql)?:\/\/)[^@\s/]*@/gi, "$1[redacted]@"],
];

export function scrub(text: string): string {
  return PATTERNS.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}

/** Pino options with allow-listed request fields, scrubbed errors and header redaction as a backstop. */
export function loggerOptions(stream?: Writable): NonNullable<FastifyServerOptions["logger"]> {
  return {
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        'req.headers["idempotency-key"]',
        'res.headers["set-cookie"]',
      ],
      censor: "[redacted]",
    },
    serializers: {
      // No headers, no body, no query string: only what is needed to follow a request.
      req: (req: FastifyRequest) => ({
        method: req.method,
        url: req.url.split("?")[0] ?? "",
      }),
      err: (err: FastifyError) => ({
        type: err.name,
        message: scrub(err.message),
        stack: scrub(err.stack ?? ""),
      }),
    },
    ...(stream ? { stream } : {}),
  };
}
