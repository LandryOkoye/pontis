// Opaque page cursors for the directory. A cursor holds the offset of the next row and a hash of
// the query it belongs to, so a cursor from one query cannot be replayed against another.

import { createHash } from "node:crypto";
import { AppError } from "../errors.ts";

const hashOf = (query: unknown) =>
  createHash("sha256").update(JSON.stringify(query)).digest("hex").slice(0, 16);

export function encodeCursor(offset: number, query: unknown): string {
  return Buffer.from(JSON.stringify({ o: offset, h: hashOf(query) })).toString("base64url");
}

export function decodeCursor(cursor: string, query: unknown): number {
  const bad = new AppError("VALIDATION_ERROR", 400, "cursor is not valid for this query");
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "o" in parsed &&
      "h" in parsed &&
      Number.isSafeInteger(parsed.o) &&
      (parsed.o as number) >= 0 &&
      parsed.h === hashOf(query)
    ) {
      return parsed.o as number;
    }
  } catch {
    // fall through
  }
  throw bad;
}
