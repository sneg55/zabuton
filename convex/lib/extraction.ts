import type { Confidence, DocumentKind, DraftInput, DraftMemberInput } from "./draftTypes";

export const EXTRACT_MODEL = "gpt-5.4";
export const CLASSIFY_MODEL = "gpt-5.4-mini";
export const RESPONSES_URL = "https://api.openai.com/v1/responses";
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_TEXT_CHARS = 60_000;

const nullableString = { type: ["string", "null"] };

const memberSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    role: nullableString,
    appointed: nullableString,
    term_end: nullableString,
    snippet: { type: "string" },
    confidence: { type: "string", enum: ["grounded", "inferred", "unknown"] },
  },
  required: ["name", "role", "appointed", "term_end", "snippet", "confidence"],
};

export const ROSTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    bodies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          meeting_cadence: nullableString,
          term_length: nullableString,
          term_limit: nullableString,
          seat_count: { type: ["integer", "null"] },
          members: { type: "array", items: memberSchema },
          snippet: { type: "string" },
        },
        required: ["name", "meeting_cadence", "term_length", "term_limit", "seat_count", "members", "snippet"],
      },
    },
  },
  required: ["bodies"],
};

export const VACANCY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    bodies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          seat_count: { type: ["integer", "null"] },
          term_ends: { type: "array", items: { type: "string" } },
          snippet: { type: "string" },
        },
        required: ["name", "seat_count", "term_ends", "snippet"],
      },
    },
  },
  required: ["bodies"],
};

export const RULES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    bodies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          term_length: nullableString,
          term_limit: nullableString,
          meeting_cadence: nullableString,
          snippet: { type: "string" },
        },
        required: ["name", "term_length", "term_limit", "meeting_cadence", "snippet"],
      },
    },
  },
  required: ["bodies"],
};

export const CLASSIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    kind: { type: "string", enum: ["roster", "vacancy_notice", "rules_page", "other"] },
    reason: { type: "string" },
  },
  required: ["kind", "reason"],
};

export const CLASSIFY_INSTRUCTIONS =
  "Label this city document. roster: it names people currently serving on a board, commission or committee. " +
  "vacancy_notice: it lists open or expiring seats with term end dates and no sitting members. rules_page: it states " +
  "term length, term limits or meeting cadence but names no members. other: anything else. Answer from the document only.";

export const ROSTER_INSTRUCTIONS =
  "Extract every board, commission or committee roster from the document. For each member give the exact quoted " +
  "snippet the values come from. Dates: keep the document's own format. If a field is not stated in the document, " +
  "return null; never guess. seat_count is null unless the document states it. confidence: grounded if the snippet " +
  "literally contains the values, inferred if derived, unknown if missing.";

export const VACANCY_INSTRUCTIONS =
  "This document announces open or expiring seats. For each board, commission or committee give the number of seats " +
  "it states, the term end dates it states in the document's own format, and the exact quoted snippet. Never name a " +
  "person unless the document names a sitting member. If the count is not stated, return null.";

export const RULES_INSTRUCTIONS =
  "This document states the rules for boards, commissions and committees, not their membership. For each body give " +
  "term length, term limit and meeting cadence exactly as stated, with the quoted snippet. Return null for anything " +
  "the document does not state; never guess.";

export function parseResponsesOutput(payload: unknown): unknown {
  const output = (payload as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> }).output;
  if (!Array.isArray(output)) throw new Error("OpenAI returned no output");
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (part.type === "output_text" && typeof part.text === "string") return JSON.parse(part.text);
    }
  }
  throw new Error("OpenAI returned no output_text");
}

const KINDS: DocumentKind[] = ["roster", "vacancy_notice", "rules_page", "other"];

export function classificationOf(parsed: unknown): DocumentKind {
  const kind = (parsed as { kind?: string }).kind;
  return KINDS.includes(kind as DocumentKind) ? (kind as DocumentKind) : "other";
}

function asConfidence(value: unknown): Confidence {
  return value === "grounded" || value === "inferred" ? value : "unknown";
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

type RawMember = { name?: unknown; role?: unknown; appointed?: unknown; term_end?: unknown; snippet?: unknown; confidence?: unknown };

function toMember(raw: RawMember): DraftMemberInput | null {
  const name = text(raw.name);
  if (name === null) return null;
  return {
    name,
    role: text(raw.role),
    appointed: text(raw.appointed),
    termEnd: text(raw.term_end),
    snippet: text(raw.snippet) ?? name,
    confidence: asConfidence(raw.confidence),
  };
}

function bodiesOf(parsed: unknown): Record<string, unknown>[] {
  const bodies = (parsed as { bodies?: unknown }).bodies;
  return Array.isArray(bodies) ? (bodies as Record<string, unknown>[]) : [];
}

export function rosterToDrafts(parsed: unknown, sourceUrl: string): DraftInput[] {
  const drafts: DraftInput[] = [];
  for (const body of bodiesOf(parsed)) {
    const name = text(body.name);
    if (name === null) continue;
    const members = (Array.isArray(body.members) ? (body.members as RawMember[]) : [])
      .map(toMember)
      .filter((member): member is DraftMemberInput => member !== null);
    drafts.push({
      name,
      meetingCadence: text(body.meeting_cadence),
      termLength: text(body.term_length),
      termLimit: text(body.term_limit),
      seatCount: count(body.seat_count),
      members,
      snippet: text(body.snippet) ?? name,
      sourceUrl,
    });
  }
  return drafts;
}

export function vacancyToDrafts(parsed: unknown, sourceUrl: string): DraftInput[] {
  const drafts: DraftInput[] = [];
  for (const body of bodiesOf(parsed)) {
    const name = text(body.name);
    if (name === null) continue;
    const termEnds = (Array.isArray(body.term_ends) ? (body.term_ends as unknown[]) : [])
      .map(text)
      .filter((value): value is string => value !== null);
    const seatCount = count(body.seat_count) ?? (termEnds.length > 0 ? termEnds.length : null);
    const heading = [
      seatCount === null ? null : `${seatCount} seat${seatCount === 1 ? "" : "s"} open`,
      termEnds.length === 0 ? null : `terms end ${termEnds.join(", ")}`,
    ]
      .filter((part): part is string => part !== null)
      .join("; ");
    drafts.push({
      name,
      meetingCadence: null,
      termLength: null,
      termLimit: null,
      seatCount,
      members: [],
      snippet: [heading, text(body.snippet)].filter((part): part is string => part !== null && part !== "").join(" | "),
      sourceUrl,
    });
  }
  return drafts;
}

export function rulesToDrafts(parsed: unknown, sourceUrl: string): DraftInput[] {
  const drafts: DraftInput[] = [];
  for (const body of bodiesOf(parsed)) {
    const name = text(body.name);
    if (name === null) continue;
    drafts.push({
      name,
      meetingCadence: text(body.meeting_cadence),
      termLength: text(body.term_length),
      termLimit: text(body.term_limit),
      seatCount: null,
      members: [],
      snippet: text(body.snippet) ?? name,
      sourceUrl,
    });
  }
  return drafts;
}

export function draftsFor(kind: DocumentKind, parsed: unknown, sourceUrl: string): DraftInput[] {
  if (kind === "roster") return rosterToDrafts(parsed, sourceUrl);
  if (kind === "vacancy_notice") return vacancyToDrafts(parsed, sourceUrl);
  if (kind === "rules_page") return rulesToDrafts(parsed, sourceUrl);
  return [];
}

export function schemaFor(kind: DocumentKind): { name: string; schema: unknown; instructions: string } | null {
  if (kind === "roster") return { name: "roster", schema: ROSTER_SCHEMA, instructions: ROSTER_INSTRUCTIONS };
  if (kind === "vacancy_notice") return { name: "vacancies", schema: VACANCY_SCHEMA, instructions: VACANCY_INSTRUCTIONS };
  if (kind === "rules_page") return { name: "rules", schema: RULES_SCHEMA, instructions: RULES_INSTRUCTIONS };
  return null;
}

export function toBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
