import type { SeatStatus } from "../../convex/lib/seatStatus";

const DAY = 86_400_000;

export const STATUS_LABEL: Record<SeatStatus, string> = {
  vacant: "Vacant",
  expired: "Term ended",
  expiring: "Expiring",
  active: "Active",
  unlisted: "Not listed",
};

export function formatDate(ms: number | undefined | null, raw?: string | null): string {
  if (ms === undefined || ms === null) return raw ?? "Unknown";
  return new Date(ms).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function daysUntil(ms: number, now = Date.now()): number {
  return Math.ceil((ms - now) / DAY);
}

export function describeEnd(endsAt: number | undefined, rawEnd: string | undefined, now = Date.now()): string {
  if (endsAt === undefined) return rawEnd ? `Ends ${rawEnd}` : "End date unknown";
  const d = daysUntil(endsAt, now);
  if (d < 0) return `Ended ${formatDate(endsAt)}`;
  if (d === 0) return "Ends today";
  if (d < 60) return `Ends in ${d} days`;
  return `Ends ${formatDate(endsAt)}`;
}

export function termProgress(startsAt: number | undefined, endsAt: number | undefined, now = Date.now()): { today: number } | null {
  if (endsAt === undefined) return null;
  const start = startsAt ?? endsAt - 4 * 365 * DAY;
  const span = Math.max(endsAt - start, DAY);
  return { today: Math.min(Math.max((now - start) / span, 0), 1) };
}

export function parseRawStart(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const m = /^(\d{1,2})\/(\d{2})$/.exec(raw.trim());
  if (m) return Date.UTC(2000 + Number(m[2]), Number(m[1]) - 1, 1);
  const iso = Date.parse(raw);
  return Number.isNaN(iso) ? undefined : iso;
}

export function formatRawDate(raw: string | undefined): string {
  if (!raw) return "Unknown";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return formatDate(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  return raw;
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
