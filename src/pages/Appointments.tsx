import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { formatDate, formatRawDate, STATUS_LABEL } from "../lib/format";
import { Empty } from "../ui/PageHead";
import { SiteFrame } from "../ui/Site";
import { PublicSkeleton } from "../ui/Skeleton";
import { StatusPill } from "../ui/StatusPill";
import { CityNotFound } from "./PublicCity";

const YEAR_MS = 365 * 86_400_000;

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function Appointments() {
  const { slug = "" } = useParams();
  const city = useQuery(api.roster.cityBySlug, { slug });
  const rows = useQuery(api.roster.appointments, city ? { cityId: city._id } : "skip");
  if (city === undefined) return <SiteFrame><PublicSkeleton /></SiteFrame>;
  if (city === null) return <CityNotFound />;
  const now = Date.now();
  const generated = new Date(now).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const endingSoon = (rows ?? []).flatMap((r) => r.seats).filter((s) => s.term?.endsAt !== undefined && s.term.endsAt >= now && s.term.endsAt - now <= YEAR_MS).length;
  const seatCount = (rows ?? []).reduce((n, r) => n + r.seats.length, 0);
  const download = () => {
    if (!rows) return;
    const lines = [["body", "seat", "member", "appointed", "term_end", "status", "source_url"].join(",")];
    for (const { body, seats } of rows) {
      for (const { seat, member, term, status } of seats) {
        lines.push(
          [
            body.name,
            seat.label ?? `Seat ${seat.ordinal}`,
            member?.name ?? "",
            term?.rawStart ?? "",
            term ? (term.endsAt ? new Date(term.endsAt).toISOString().slice(0, 10) : term.rawEnd ?? "") : "",
            STATUS_LABEL[status],
            term?.sourceUrl ?? body.sourceUrl,
          ].map(csvCell).join(","),
        );
      }
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${city.slug}-appointments-${new Date(now).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <SiteFrame>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-head">
          <h1 className="display display-xl">Annual appointments list, {city.name}</h1>
          <p className="lede">
            Every board, commission and committee with each seat, who holds it, when they were appointed and when the term ends. Prepared {generated} from the tracked roster.
          </p>
          <div className="row">
            <button className="btn" onClick={download} disabled={!rows}>Download CSV</button>
            <button className="btn btn-secondary" onClick={() => window.print()}>Print</button>
            <Link to={`/c/${city.slug}`} className="btn btn-secondary">Full roster</Link>
          </div>
          {rows && rows.length > 0 && (
            <p className="small muted">
              {seatCount} seats across {rows.length} bodies. {endingSoon} {endingSoon === 1 ? "term ends" : "terms end"} within the next twelve months.
            </p>
          )}
        </div>
      </section>
      <div className="stack appointments" style={{ paddingBottom: 48, gap: 20 }}>
        {rows && rows.length === 0 && (
          <Empty title="No confirmed bodies yet">The list fills in as the clerk confirms each body on the roster.</Empty>
        )}
        {(rows ?? []).map(({ body, seats }) => (
          <section key={body._id} className="card">
            <div className="body-card-head" style={{ cursor: "default" }}>
              <div>
                <div className="name">{body.name}</div>
                <div className="small muted">{[body.termLength && `Terms ${body.termLength}`, body.termLimit && `limit ${body.termLimit}`, body.meetingCadence].filter(Boolean).join(". ")}</div>
              </div>
              <span className="small muted">{seats.length} {seats.length === 1 ? "seat" : "seats"}</span>
            </div>
            <div className="table-wrap" style={{ border: 0, borderTop: "1px solid var(--rule)", borderRadius: 0 }}>
              <table className="table">
                <thead><tr><th>Seat</th><th>Member</th><th>Appointed</th><th>Term ends</th><th>Status</th></tr></thead>
                <tbody>
                  {seats.map(({ seat, member, term, status }) => (
                    <tr key={seat._id}>
                      <td>{seat.label ?? `Seat ${seat.ordinal}`}</td>
                      <td>{member?.name ?? <span className="muted">{status === "vacant" ? "Vacant" : "Not published"}</span>}</td>
                      <td className="muted">{term?.rawStart ? formatRawDate(term.rawStart) : ""}</td>
                      <td className="num">{term ? formatDate(term.endsAt, term.rawEnd) : ""}</td>
                      <td><StatusPill status={status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </SiteFrame>
  );
}
