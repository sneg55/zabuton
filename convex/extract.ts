import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { firecrawl } from "./firecrawl";
import { fetchOfficeRecordsByUrl, legistarRefFromUrl, officeRecordsToPublished } from "./legistar";
import { SCRAPED_CONTENT_TYPE } from "./lib/discover";
import { canonicalName, type DocumentKind, type DraftInput } from "./lib/draftTypes";
import type { PublishedMember } from "./lib/driftDiff";
import {
  CLASSIFY_INSTRUCTIONS,
  CLASSIFY_MODEL,
  CLASSIFY_SCHEMA,
  EXTRACT_MODEL,
  MAX_DOCUMENT_BYTES,
  MAX_TEXT_CHARS,
  RESPONSES_URL,
  classificationOf,
  draftsFor,
  parseResponsesOutput,
  schemaFor,
  toBase64,
} from "./lib/extraction";
import { fetchWithBrowserUa, textOf } from "./lib/httpFetch";
import { documentKindValidator } from "./schema";

export type DocumentPayload = {
  url: string;
  contentType: string;
  bytes: ArrayBuffer;
};

export function openAiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set on this deployment");
  return key;
}

type ContentPart = Record<string, string>;

export function contentFor(payload: DocumentPayload): ContentPart[] {
  if (payload.bytes.byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error(`Document is ${Math.round(payload.bytes.byteLength / 1024 / 1024)} MB, over the extraction limit`);
  }
  if (payload.contentType.includes("pdf")) {
    const data = toBase64(new Uint8Array(payload.bytes));
    return [
      { type: "input_file", filename: "doc.pdf", file_data: `data:application/pdf;base64,${data}` },
      { type: "input_text", text: `Source URL: ${payload.url}` },
    ];
  }
  const text = textOf(payload.bytes, payload.contentType).slice(0, MAX_TEXT_CHARS);
  return [{ type: "input_text", text: `Source URL: ${payload.url}\n\n${text}` }];
}

async function callResponses(model: string, instructions: string, content: ContentPart[], format: { name: string; schema: unknown }): Promise<unknown> {
  const response = await fetch(RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${openAiKey()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      instructions,
      input: [{ role: "user", content }],
      text: { format: { type: "json_schema", name: format.name, strict: true, schema: format.schema } },
    }),
  });
  if (!response.ok) {
    throw new Error(`OpenAI answered ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }
  return parseResponsesOutput(await response.json());
}

export async function classify(payload: DocumentPayload): Promise<DocumentKind> {
  const parsed = await callResponses(CLASSIFY_MODEL, CLASSIFY_INSTRUCTIONS, contentFor(payload), {
    name: "classification",
    schema: CLASSIFY_SCHEMA,
  });
  return classificationOf(parsed);
}

export async function extractDrafts(payload: DocumentPayload, kind: DocumentKind): Promise<DraftInput[]> {
  const format = schemaFor(kind);
  if (!format) return [];
  const parsed = await callResponses(EXTRACT_MODEL, format.instructions, contentFor(payload), format);
  return draftsFor(kind, parsed, payload.url);
}

type ScrapeCtx = Parameters<typeof firecrawl.scrape>[0];

export async function publishedRosterFor(ctx: ScrapeCtx, sourceUrl: string): Promise<Map<string, PublishedMember[]>> {
  const byBody = new Map<string, PublishedMember[]>();
  if (legistarRefFromUrl(sourceUrl)) {
    const records = await fetchOfficeRecordsByUrl(sourceUrl);
    byBody.set(canonicalName(records[0]?.OfficeRecordBodyName ?? ""), officeRecordsToPublished(records));
    return byBody;
  }
  let bytes: ArrayBuffer;
  let contentType: string;
  try {
    const fetched = await fetchWithBrowserUa(sourceUrl);
    bytes = fetched.bytes;
    contentType = fetched.contentType;
  } catch {
    const scraped = await firecrawl.scrape(ctx, sourceUrl, { formats: ["markdown"] });
    const markdown = scraped.markdown ?? "";
    if (markdown === "") throw new Error("The source page could not be read");
    bytes = new TextEncoder().encode(markdown).buffer as ArrayBuffer;
    contentType = SCRAPED_CONTENT_TYPE;
  }
  for (const draft of await extractDrafts({ url: sourceUrl, contentType, bytes }, "roster")) {
    byBody.set(
      canonicalName(draft.name),
      draft.members.map((member) => ({ name: member.name, termEnd: member.termEnd, snippet: member.snippet })),
    );
  }
  return byBody;
}

export const documentFor = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }) => {
    const document = await ctx.db.get(documentId);
    if (!document) return null;
    return {
      cityId: document.cityId,
      crawlRunId: document.crawlRunId,
      url: document.url,
      contentType: document.contentType ?? "application/octet-stream",
      storageId: document.storageId ?? null,
      kind: document.kind,
    };
  },
});

export const setKind = internalMutation({
  args: { documentId: v.id("documents"), kind: documentKindValidator, error: v.optional(v.string()) },
  handler: async (ctx, { documentId, kind, error }) => {
    await ctx.db.patch(documentId, error === undefined ? { kind } : { kind, error });
  },
});

export const processDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, { documentId }): Promise<{ kind: DocumentKind; draftCount: number }> => {
    const document = await ctx.runQuery(internal.extract.documentFor, { documentId });
    if (!document) return { kind: "other", draftCount: 0 };
    if (document.storageId === null) return { kind: "other", draftCount: 0 };
    try {
      const blob = await ctx.storage.get(document.storageId as Id<"_storage">);
      if (!blob) throw new Error("The fetched bytes are gone from storage");
      const payload: DocumentPayload = {
        url: document.url,
        contentType: document.contentType,
        bytes: await blob.arrayBuffer(),
      };
      const kind = await classify(payload);
      await ctx.runMutation(internal.extract.setKind, { documentId, kind });
      const drafts = await extractDrafts(payload, kind);
      if (drafts.length === 0) return { kind, draftCount: 0 };
      const { draftCount } = await ctx.runMutation(internal.drafts.recordExtraction, {
        cityId: document.cityId,
        crawlRunId: document.crawlRunId,
        documentId,
        drafts,
      });
      return { kind, draftCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.extract.setKind, { documentId, kind: "other", error: message });
      return { kind: "other", draftCount: 0 };
    }
  },
});
