export type Confidence = "grounded" | "inferred" | "unknown";

export type DraftMemberInput = {
  name: string;
  role: string | null;
  appointed: string | null;
  termEnd: string | null;
  snippet: string;
  confidence: Confidence;
};

export type DraftInput = {
  name: string;
  meetingCadence: string | null;
  termLength: string | null;
  termLimit: string | null;
  seatCount: number | null;
  members: DraftMemberInput[];
  snippet: string;
  sourceUrl: string;
};

export type DocumentKind = "unclassified" | "roster" | "vacancy_notice" | "rules_page" | "other";

export function canonicalName(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z]+/g, " ").trim();
}

export function canonicalPerson(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z ]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function mergeDrafts(a: DraftInput, b: DraftInput): DraftInput {
  const rich = a.members.length >= b.members.length ? a : b;
  const other = rich === a ? b : a;
  const hasMembers = rich.members.length > 0;
  return {
    name: hasMembers ? rich.name : a.name,
    meetingCadence: a.meetingCadence ?? b.meetingCadence,
    termLength: a.termLength ?? b.termLength,
    termLimit: a.termLimit ?? b.termLimit,
    seatCount: a.seatCount ?? b.seatCount,
    members: rich.members,
    snippet: hasMembers ? rich.snippet : [a.snippet, other.snippet].filter((s) => s !== "")[0] ?? "",
    sourceUrl: hasMembers ? rich.sourceUrl : a.sourceUrl,
  };
}

export function mergeRunDrafts(drafts: DraftInput[]): DraftInput[] {
  const byName = new Map<string, DraftInput>();
  const order: string[] = [];
  for (const draft of drafts) {
    const key = canonicalName(draft.name);
    const existing = byName.get(key);
    if (existing) {
      byName.set(key, mergeDrafts(existing, draft));
    } else {
      byName.set(key, draft);
      order.push(key);
    }
  }
  return order.map((key) => byName.get(key)!);
}
