import { canonicalPerson } from "./draftTypes";
import { normalizeTermEnd } from "./termDates";

export type PublishedMember = {
  name: string;
  termEnd: string | null;
  snippet: string;
};

export type TrackedMember = {
  seatId: string;
  name: string;
  endsAt: number | null;
  rawEnd: string | null;
};

export type DriftField = "member_added" | "member_missing" | "term_end";

export type DriftDifference = {
  field: DriftField;
  seatId: string | null;
  published: string;
  tracked: string;
  snippet: string;
};

export const UNKNOWN_END = "unknown";
export const NOT_TRACKED = "not tracked";
export const NOT_LISTED = "not on the city page";

export function isoDay(stamp: number): string {
  return new Date(stamp).toISOString().slice(0, 10);
}

export function trackedEndDisplay(tracked: TrackedMember): string {
  if (tracked.rawEnd !== null && normalizeTermEnd(tracked.rawEnd) === tracked.endsAt) return tracked.rawEnd;
  if (tracked.endsAt !== null) return isoDay(tracked.endsAt);
  if (tracked.rawEnd !== null) return tracked.rawEnd;
  return UNKNOWN_END;
}

function withEnd(name: string, end: string): string {
  return end === UNKNOWN_END ? name : `${name} (${end})`;
}

export function diffRoster(published: PublishedMember[], tracked: TrackedMember[]): DriftDifference[] {
  const trackedByPerson = new Map<string, TrackedMember>();
  for (const member of tracked) trackedByPerson.set(canonicalPerson(member.name), member);
  const publishedByPerson = new Map<string, PublishedMember>();
  for (const member of published) publishedByPerson.set(canonicalPerson(member.name), member);

  const differences: DriftDifference[] = [];
  for (const member of published) {
    const key = canonicalPerson(member.name);
    const match = trackedByPerson.get(key);
    if (!match) {
      differences.push({
        field: "member_added",
        seatId: null,
        published: withEnd(member.name, member.termEnd ?? UNKNOWN_END),
        tracked: NOT_TRACKED,
        snippet: member.snippet,
      });
      continue;
    }
    const publishedEnd = normalizeTermEnd(member.termEnd);
    const trackedEnd = match.endsAt ?? normalizeTermEnd(match.rawEnd);
    if (publishedEnd !== trackedEnd) {
      differences.push({
        field: "term_end",
        seatId: match.seatId,
        published: member.termEnd ?? UNKNOWN_END,
        tracked: trackedEndDisplay(match),
        snippet: member.snippet,
      });
    }
  }
  for (const member of tracked) {
    if (publishedByPerson.has(canonicalPerson(member.name))) continue;
    differences.push({
      field: "member_missing",
      seatId: member.seatId,
      published: NOT_LISTED,
      tracked: withEnd(member.name, trackedEndDisplay(member)),
      snippet: "",
    });
  }
  return differences;
}
