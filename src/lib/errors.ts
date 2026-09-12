import { ConvexError } from "convex/values";

export function humanizeRunError(error: string | undefined): string {
  if (!error) return "The run stopped before any roster was read.";
  if (/out of memory|too large|over the .* limit/i.test(error)) return "A document on the site was too large to read, so the run stopped.";
  if (/timed? ?out|timeout/i.test(error)) return "The city site took too long to answer, so the run stopped.";
  if (/Firecrawl|429|rate limit/i.test(error)) return "The crawler was rate limited by the city site, so the run stopped.";
  return error.replace(/^ConvexError:\s*/, "").split("\n")[0];
}

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
