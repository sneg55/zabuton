import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { formatDate } from "./lib/format";
import { Empty, PageHead } from "./ui/PageHead";
import { StatusPill } from "./ui/StatusPill";
import { TermBar } from "./ui/TermBar";
import { parseRawStart } from "./lib/format";

export function ClerkBoard({ city }: { city: Doc<"cities"> }) {
  const rows = useQuery(api.roster.city, { cityId: city._id });
  const [open, setOpen] = useState<Id<"bodies"> | null>(null);
  if (rows === undefined) return null;
  const totals = rows.reduce(
    (acc, r) => ({ expired: acc.expired + r.counts.expired, expiring: acc.expiring + r.counts.expiring, vacant: acc.vacant + r.counts.vacant, active: acc.active + r.counts.active }),
    { expired: 0, expiring: 0, vacant: 0, active: 0 },
  );
  return (
    <div className="page">
      <PageHead
        title="Board"
        intro={`${rows.length} bodies. Seats update the moment a term ends or an appointment is recorded.`}
        actions={
          <div className="counts">
            <StatusPill status="expired" count={totals.expired} />
            <StatusPill status="expiring" count={totals.expiring} />
            <StatusPill status="vacant" count={totals.vacant} />
            <StatusPill status="active" count={totals.active} />
          </div>
        }
      />
      {rows.length === 0 && <Empty title="No bodies yet">Run the bootstrap from the front page, review the drafts, and confirm each body.</Empty>}
      <div className="stack">
        {rows.map(({ body, counts }) => (
          <section key={body._id} className="card body-card">
            <button className="body-card-head" onClick={() => setOpen(open === body._id ? null : body._id)} aria-expanded={open === body._id}>
              <div>
                <div className="name">{body.name}</div>
                <div className="small muted">{[body.termLength && `Terms ${body.termLength}`, body.termLimit && `limit ${body.termLimit}`].filter(Boolean).join(", ")}</div>
              </div>
              <div className="counts">
                <StatusPill status="expired" count={counts.expired} />
                <StatusPill status="expiring" count={counts.expiring} />
                <StatusPill status="vacant" count={counts.vacant} />
                <StatusPill status="active" count={counts.active} />
              </div>
            </button>
            {open === body._id && <BodySeats bodyId={body._id} />}
          </section>
        ))}
      </div>
    </div>
  );
}

function BodySeats({ bodyId }: { bodyId: Id<"bodies"> }) {
  const data = useQuery(api.roster.board, { bodyId });
  if (!data) return null;
  return (
    <div className="body-card-body">
      <div className="table-wrap" style={{ border: 0 }}>
        <table className="table">
          <thead>
            <tr><th>Seat</th><th>Member</th><th style={{ width: 180 }}>Term</th><th>Appointed</th><th>Ends</th><th>Status</th><th>Source</th></tr>
          </thead>
          <tbody>
            {data.seats.map(({ seat, member, term, status }) => (
              <tr key={seat._id}>
                <td>{seat.label ?? seat.ordinal}</td>
                <td>{member?.name ?? <span className="muted">Open</span>}</td>
                <td><TermBar startsAt={term?.startsAt ?? parseRawStart(term?.rawStart)} endsAt={term?.endsAt} status={status} /></td>
                <td className="muted">{term?.rawStart ?? "Unknown"}</td>
                <td className="num">{formatDate(term?.endsAt, term?.rawEnd)}</td>
                <td><StatusPill status={status} /></td>
                <td>{term && <a className="small" href={term.sourceUrl} target="_blank" rel="noreferrer" title={term.snippet}>Source</a>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
