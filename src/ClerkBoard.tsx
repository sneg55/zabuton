import { useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { SeatStatus } from "../convex/lib/seatStatus";

const ORDER: SeatStatus[] = ["expired", "expiring", "vacant", "active"];

function formatDate(ms: number | undefined, raw: string | undefined) {
  if (ms === undefined) return raw ?? "unknown";
  return new Date(ms).toISOString().slice(0, 10);
}

export function ClerkBoard() {
  const cities = useQuery(api.roster.cities);
  const [cityId, setCityId] = useState<Id<"cities"> | null>(null);
  const activeCity = cityId ?? cities?.[0]?._id ?? null;
  if (cities === undefined) return <p className="muted">Loading cities</p>;
  if (cities.length === 0) return <p className="muted">No city loaded yet. Run the Dublin seed.</p>;
  return (
    <section>
      <nav className="cities">
        {cities.map((c) => (
          <button key={c._id} className={c._id === activeCity ? "active" : ""} onClick={() => setCityId(c._id)}>
            {c.name}
          </button>
        ))}
      </nav>
      {activeCity && <CityBoard cityId={activeCity} />}
    </section>
  );
}

function CityBoard({ cityId }: { cityId: Id<"cities"> }) {
  const rows = useQuery(api.roster.city, { cityId });
  const [open, setOpen] = useState<Id<"bodies"> | null>(null);
  if (rows === undefined) return <p className="muted">Loading board</p>;
  return (
    <div className="bodies">
      {rows.map(({ body, counts }) => (
        <article key={body._id} className="body">
          <button className="body-head" onClick={() => setOpen(open === body._id ? null : body._id)}>
            <span className="name">{body.name}</span>
            <span className="counts">
              {ORDER.map((s) => (
                <span key={s} className={`pill ${s} ${counts[s] === 0 ? "zero" : ""}`}>
                  {counts[s]} {s}
                </span>
              ))}
            </span>
          </button>
          {open === body._id && <BodySeats bodyId={body._id} />}
        </article>
      ))}
    </div>
  );
}

function BodySeats({ bodyId }: { bodyId: Id<"bodies"> }) {
  const data = useQuery(api.roster.board, { bodyId });
  if (data === undefined) return <p className="muted">Loading seats</p>;
  if (data === null) return null;
  return (
    <table>
      <thead>
        <tr>
          <th>Seat</th>
          <th>Member</th>
          <th>Appointed</th>
          <th>Term ends</th>
          <th>Status</th>
          <th>Source</th>
        </tr>
      </thead>
      <tbody>
        {data.seats.map(({ seat, member, term, status }) => (
          <tr key={seat._id} className={status}>
            <td>{seat.ordinal}{seat.label ? ` (${seat.label})` : ""}</td>
            <td>{member?.name ?? "vacant"}</td>
            <td>{term?.rawStart ?? "unknown"}</td>
            <td>{formatDate(term?.endsAt, term?.rawEnd)}</td>
            <td><span className={`pill ${status}`}>{status}</span></td>
            <td>{term && <a href={term.sourceUrl} target="_blank" rel="noreferrer" title={term.snippet}>source</a>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
