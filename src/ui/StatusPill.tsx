import type { SeatStatus } from "../../convex/lib/seatStatus";
import { STATUS_LABEL } from "../lib/format";

export function StatusPill({ status, count, label }: { status: SeatStatus; count?: number; label?: string }) {
  const zero = count === 0 ? " pill-zero" : "";
  return (
    <span className={`pill pill-${status}${zero}`}>
      {count !== undefined ? `${count} ` : ""}
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}
