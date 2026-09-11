import { ConvexError } from "convex/values";
import type { DraftInput, DraftMemberInput } from "./lib/draftTypes";
import type { PublishedMember } from "./lib/driftDiff";

export const LEGISTAR_HOST = "webapi.legistar.com";

const LEGISTAR_ORIGIN = "https://webapi.legistar.com";

export type LegistarBody = {
  BodyId: number;
  BodyName: string;
  BodyActiveFlag?: number;
  BodyNumberOfMembers?: number | null;
  BodyTypeName?: string | null;
};

export type LegistarOfficeRecord = {
  OfficeRecordFullName?: string | null;
  OfficeRecordFirstName?: string | null;
  OfficeRecordLastName?: string | null;
  OfficeRecordStartDate?: string | null;
  OfficeRecordEndDate?: string | null;
  OfficeRecordBodyId?: number;
  OfficeRecordBodyName?: string | null;
  OfficeRecordTitle?: string | null;
  OfficeRecordMemberType?: string | null;
};

export const BODY_NAME_KEYWORDS = ["commission", "board", "committee", "authority", "council", "task force"];

export function bodiesUrl(client: string): string {
  return `${LEGISTAR_ORIGIN}/v1/${client}/Bodies`;
}

export function officeRecordsUrl(client: string, bodyId: number, sinceIso: string): string {
  const filter = `OfficeRecordBodyId eq ${bodyId} and OfficeRecordEndDate ge datetime'${sinceIso}'`;
  return `${LEGISTAR_ORIGIN}/v1/${client}/OfficeRecords?$filter=${encodeURIComponent(filter)}`;
}

export type LegistarRef = { client: string; bodyId: number; sinceIso: string | null };

export function legistarRefFromUrl(url: string): LegistarRef | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() !== LEGISTAR_HOST) return null;
  const parts = parsed.pathname.split("/").filter((part) => part !== "");
  if (parts.length < 3 || parts[0] !== "v1") return null;
  const filter = parsed.searchParams.get("$filter") ?? "";
  const bodyMatch = /OfficeRecordBodyId eq (\d+)/.exec(filter);
  if (!bodyMatch) return null;
  const sinceMatch = /datetime'([\d-]+)/.exec(filter);
  return { client: parts[1], bodyId: Number(bodyMatch[1]), sinceIso: sinceMatch ? sinceMatch[1] : null };
}

export function oneYearAgoIso(now: number): string {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate())).toISOString().slice(0, 10);
}

export function selectBodies(bodies: LegistarBody[]): LegistarBody[] {
  return bodies.filter((body) => {
    if (body.BodyActiveFlag !== 1) return false;
    const name = (body.BodyName ?? "").toLowerCase();
    return BODY_NAME_KEYWORDS.some((keyword) => name.includes(keyword));
  });
}

function personName(record: LegistarOfficeRecord): string {
  const full = (record.OfficeRecordFullName ?? "").trim();
  if (full !== "") return full;
  return [record.OfficeRecordFirstName, record.OfficeRecordLastName].filter((part) => !!part).join(" ").trim();
}

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function roleOf(record: LegistarOfficeRecord): string | null {
  const title = (record.OfficeRecordTitle ?? "").trim();
  if (title !== "") return title;
  const memberType = (record.OfficeRecordMemberType ?? "").trim();
  return memberType === "" ? null : memberType;
}

export function officeRecordSnippet(record: LegistarOfficeRecord): string {
  const start = isoDate(record.OfficeRecordStartDate) ?? "unknown";
  const end = isoDate(record.OfficeRecordEndDate) ?? "unknown";
  return `${personName(record)} | ${roleOf(record) ?? "Member"} | ${start} -> ${end}`;
}

export function officeRecordToMember(record: LegistarOfficeRecord): DraftMemberInput {
  return {
    name: personName(record),
    role: roleOf(record),
    appointed: isoDate(record.OfficeRecordStartDate),
    termEnd: isoDate(record.OfficeRecordEndDate),
    snippet: officeRecordSnippet(record),
    confidence: "grounded",
  };
}

export function officeRecordsToPublished(records: LegistarOfficeRecord[]): PublishedMember[] {
  return records
    .filter((record) => personName(record) !== "")
    .map((record) => ({
      name: personName(record),
      termEnd: isoDate(record.OfficeRecordEndDate),
      snippet: officeRecordSnippet(record),
    }));
}

export function bodyToDraft(body: LegistarBody, records: LegistarOfficeRecord[], sourceUrl: string): DraftInput | null {
  const members = records.filter((record) => personName(record) !== "").map(officeRecordToMember);
  if (members.length === 0) return null;
  return {
    name: body.BodyName,
    meetingCadence: null,
    termLength: null,
    termLimit: null,
    seatCount: typeof body.BodyNumberOfMembers === "number" && body.BodyNumberOfMembers > 0 ? body.BodyNumberOfMembers : null,
    members,
    snippet: `${body.BodyName} (Legistar body ${body.BodyId}), ${members.length} office records`,
    sourceUrl,
  };
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new ConvexError(`Legistar answered ${response.status} for ${url}`);
  return response.json();
}

export async function probeLegistarClient(guesses: string[]): Promise<{ client: string; bodies: LegistarBody[] } | null> {
  for (const client of guesses) {
    try {
      const payload = await getJson(bodiesUrl(client));
      if (Array.isArray(payload) && payload.length > 0 && typeof payload[0]?.BodyId === "number") {
        return { client, bodies: payload as LegistarBody[] };
      }
    } catch {
      continue;
    }
  }
  return null;
}

export async function fetchOfficeRecords(client: string, bodyId: number, sinceIso: string): Promise<LegistarOfficeRecord[]> {
  const payload = await getJson(officeRecordsUrl(client, bodyId, sinceIso));
  return Array.isArray(payload) ? (payload as LegistarOfficeRecord[]) : [];
}

export async function fetchOfficeRecordsByUrl(url: string): Promise<LegistarOfficeRecord[]> {
  const payload = await getJson(url);
  return Array.isArray(payload) ? (payload as LegistarOfficeRecord[]) : [];
}
