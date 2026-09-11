import { ConvexError } from "convex/values";

export function errorText(error: unknown, fallback = "Something went wrong. Try again."): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string") return data;
    if (data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string") return (data as { message: string }).message;
  }
  if (error instanceof Error) {
    const m = /ConvexError: (.*)$/m.exec(error.message);
    if (m) return m[1].replace(/^"|"$/g, "");
    if (!/Server Error|Request ID/.test(error.message)) return error.message.split("\n")[0];
  }
  return fallback;
}
