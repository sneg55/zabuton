import { BROWSER_USER_AGENT, previewOf, stripTags } from "./discover";

export type FetchedDocument = {
  bytes: ArrayBuffer;
  contentType: string;
  textPreview: string | null;
};

export const MAX_FETCH_BYTES = 8 * 1024 * 1024;

export class TooLargeError extends Error {
  constructor(bytes: number) {
    super(`Document is ${Math.round(bytes / 1024 / 1024)} MB, over the ${Math.round(MAX_FETCH_BYTES / 1024 / 1024)} MB reading limit`);
    this.name = "TooLargeError";
  }
}

export function previewFor(contentType: string, bytes: ArrayBuffer): string | null {
  if (contentType.includes("pdf")) return null;
  const text = new TextDecoder().decode(bytes.slice(0, 200_000));
  const flat = contentType.includes("html") ? stripTags(text) : text.replace(/\s+/g, " ").trim();
  return flat === "" ? null : previewOf(flat);
}

export async function readCapped(response: Response, cap: number = MAX_FETCH_BYTES): Promise<ArrayBuffer> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > cap) {
    await response.body?.cancel();
    throw new TooLargeError(declared);
  }
  const reader = response.body?.getReader();
  if (!reader) return response.arrayBuffer();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > cap) {
      await reader.cancel();
      throw new TooLargeError(total);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

export async function fetchWithBrowserUa(url: string): Promise<FetchedDocument> {
  const response = await fetch(url, {
    headers: {
      "user-agent": BROWSER_USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/pdf,*/*",
      "accept-language": "en-US,en;q=0.9",
    },
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  const bytes = await readCapped(response);
  return { bytes, contentType, textPreview: previewFor(contentType, bytes) };
}

export function textOf(bytes: ArrayBuffer, contentType: string): string {
  const raw = new TextDecoder().decode(bytes);
  return contentType.includes("html") ? stripTags(raw) : raw;
}
