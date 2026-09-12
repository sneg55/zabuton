import type { Doc } from "../../convex/_generated/dataModel";
import type { SeatStatus } from "../../convex/lib/seatStatus";
import { describeEnd, parseRawStart } from "../lib/format";
import { StatusPill } from "./StatusPill";
import { TermBar } from "./TermBar";

export function Nameplate({ seat, member, term, status, now }: { seat: Doc<"seats">; member: Doc<"members"> | null; term: Doc<"terms"> | null; status: SeatStatus; now?: number }) {
  const vacant = status === "vacant";
  const unlisted = status === "unlisted";
  if (unlisted) {
    return (
      <div className="nameplate nameplate-vacant nameplate-unlisted">
        <div className="nameplate-top">
          <div className="nameplate-name">Not listed</div>
          <span className="nameplate-seat">{seat.label ? seat.label : `Seat ${seat.ordinal}`}</span>
        </div>
        <div className="nameplate-sub">
          <span className="small muted">The city has not published who holds this seat.</span>
        </div>
      </div>
    );
  }
  return (
    <div className={`nameplate${vacant ? " nameplate-vacant" : ""}`}>
      <div className="nameplate-top">
        <div className="nameplate-name">{vacant ? "Open seat" : member?.name ?? "Unknown member"}</div>
        <span className="nameplate-seat">{seat.label ? seat.label : `Seat ${seat.ordinal}`}</span>
      </div>
      <TermBar startsAt={term?.startsAt ?? parseRawStart(term?.rawStart)} endsAt={term?.endsAt} status={status} now={now} />
      <div className="nameplate-sub">
        <StatusPill status={status} label={vacant ? "Accepting applications" : undefined} />
        <span>{vacant ? "" : describeEnd(term?.endsAt, term?.rawEnd, now)}</span>
      </div>
    </div>
  );
}
