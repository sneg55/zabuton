export type SeatStatus = "vacant" | "expired" | "expiring" | "active" | "unlisted";

export type Occupancy = "held" | "vacant" | "unlisted";

export const DEFAULT_EXPIRING_DAYS = 120;

const DAY_MS = 86_400_000;

const VACANCY_NAME = /^(vacant|vacancy|vacant seat|open|open seat|unfilled|tbd|tba|to be determined|to be appointed|none|n\/a|-+)$/i;

export function isVacancyName(name: string): boolean {
  return VACANCY_NAME.test(name.trim());
}

export function seatStatus(endsAt: number | null, now: number, thresholdDays: number, occupancy: Occupancy = "held"): SeatStatus {
  if (occupancy === "vacant") return "vacant";
  if (occupancy === "unlisted") return "unlisted";
  if (endsAt === null) return "active";
  if (endsAt < now) return "expired";
  if (endsAt - now <= thresholdDays * DAY_MS) return "expiring";
  return "active";
}
