import { describe, expect, it } from "vitest";
import { requireAdmin } from "../src/admin/auth.ts";
import { AppError } from "../src/errors.ts";

const KEY = "0123456789abcdef-admin-key";
const refused = (key: string | undefined, header: string | undefined) => {
  try {
    requireAdmin(key, header);
  } catch (error) {
    return error instanceof AppError ? [error.code, error.status] : error;
  }
  return "allowed";
};

describe("requireAdmin", () => {
  it("allows exactly the configured key as a bearer token", () => {
    expect(refused(KEY, `Bearer ${KEY}`)).toBe("allowed");
  });

  it("refuses everything else with UNAUTHORIZED", () => {
    for (const header of [
      undefined,
      "",
      KEY,
      `bearer ${KEY}`,
      `Bearer ${KEY} `,
      `Bearer ${KEY.slice(1)}`,
      "Bearer ",
    ]) {
      expect(refused(KEY, header), String(header)).toEqual(["UNAUTHORIZED", 401]);
    }
  });

  it("refuses everyone when no key is configured, including a matching empty token", () => {
    for (const header of [undefined, "Bearer ", "Bearer undefined", `Bearer ${KEY}`]) {
      expect(refused(undefined, header), String(header)).toEqual(["UNAUTHORIZED", 401]);
    }
  });
});
