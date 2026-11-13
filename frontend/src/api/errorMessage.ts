import { ApiError } from "./client";

/** Turns an API error into a message to show the user. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "Something went wrong. Please try again.";
  if (err.code === "VALIDATION_ERROR" && Array.isArray(err.details)) {
    return (err.details as { message: string }[]).map((d) => d.message).join(". ");
  }
  return err.message;
}
