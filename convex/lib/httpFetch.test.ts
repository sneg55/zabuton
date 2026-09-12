import { describe, expect, it } from "vitest";
import { MAX_FETCH_BYTES, TooLargeError, readCapped, looksLikeBotWall } from "./httpFetch";

function streamOf(chunks: Uint8Array[], headers: Record<string, string> = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream, { headers });
}

describe("readCapped", () => {
  it("returns the whole body under the cap", async () => {
    const bytes = await readCapped(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])]), 10);
    expect([...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
  });
  it("refuses a declared size over the cap before reading", async () => {
    const response = streamOf([new Uint8Array(4)], { "content-length": String(MAX_FETCH_BYTES + 1) });
    await expect(readCapped(response)).rejects.toBeInstanceOf(TooLargeError);
  });
  it("stops reading once the streamed bytes pass the cap", async () => {
    const response = streamOf([new Uint8Array(6), new Uint8Array(6)]);
    await expect(readCapped(response, 10)).rejects.toThrow(/over the/);
  });
});

describe("looksLikeBotWall", () => {
  it("recognises an interstitial bot check served as HTML", () => {
    expect(looksLikeBotWall("text/html", "Pardon Our Interruption As you were browsing something about your browser made us think you were a bot.")).toBe(true);
  });

  it("leaves real pages and PDFs alone", () => {
    expect(looksLikeBotWall("text/html", "Members Connie Mack, Committee Member - Term expires June 2022")).toBe(false);
    expect(looksLikeBotWall("application/pdf", null)).toBe(false);
  });
});
