import { AppError } from "../src/errors.ts";

/** The `code` of the AppError a promise rejects with, or undefined if it resolves or throws another error. */
export async function errorCodeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return error instanceof AppError ? error.code : undefined;
  }
  return undefined;
}
