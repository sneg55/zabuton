import type { SeatStatus } from "../../convex/lib/seatStatus";
import { termProgress } from "../lib/format";

export function TermBar({ startsAt, endsAt, status, now }: { startsAt?: number; endsAt?: number; status: SeatStatus; now?: number }) {
  const p = termProgress(startsAt, endsAt, now);
  if (!p) return <div className="termbar termbar-unknown" aria-hidden="true" />;
  const cls = status === "expired" ? "expired" : status === "expiring" ? "expiring" : "";
  return (
    <div className="termbar" aria-hidden="true">
      <div className={`termbar-fill ${cls}`} style={{ width: `${Math.max(p.today * 100, 1.5)}%` }} />
      <div className="termbar-today" style={{ left: `${p.today * 100}%` }} />
    </div>
  );
}
