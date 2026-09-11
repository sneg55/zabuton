import { BROWSER_USER_AGENT, previewOf, stripTags } from "./discover";

export type FetchedDocument = {
  bytes: ArrayBuffer;
  contentType: string;
  textPreview: string | null;
};

export function previewFor(contentType: string, bytes: ArrayBuffer): string | null {
  if (contentType.includes("pdf")) return null;
  const text = new TextDecoder().decode(bytes.slice(0, 200_000));
  const flat = contentType.includes("html") ? stripTags(text) : text.replace(/\s+/g, " ").trim();
  return flat === "" ? null : previewOf(flat);
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
  const bytes = await response.arrayBuffer();
  return { bytes, contentType, textPreview: previewFor(contentType, bytes) };
}

export function textOf(bytes: ArrayBuffer, contentType: string): string {
  const raw = new TextDecoder().decode(bytes);
  return contentType.includes("html") ? stripTags(raw) : raw;
}
