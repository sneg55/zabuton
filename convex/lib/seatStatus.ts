export type SeatStatus = "vacant" | "expired" | "expiring" | "active";

export const DEFAULT_EXPIRING_DAYS = 120;

const DAY_MS = 86_400_000;

export function seatStatus(endsAt: number | null, now: number, thresholdDays: number): SeatStatus {
  if (endsAt === null) return "vacant";
  if (endsAt < now) return "expired";
  if (endsAt - now <= thresholdDays * DAY_MS) return "expiring";
  return "active";
}
