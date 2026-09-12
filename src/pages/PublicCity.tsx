import { useQuery } from "convex/react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatDate, pluralize } from "../lib/format";
import { Nameplate } from "../ui/Nameplate";
import { Empty } from "../ui/PageHead";
import { SiteFrame } from "../ui/Site";
import { SourceLink } from "../ui/SourceLink";
import { StatusPill } from "../ui/StatusPill";

export function PublicCity() {
  const { slug = "" } = useParams();
  const city = useQuery(api.roster.cityBySlug, { slug });
  const rows = useQuery(api.roster.city, city ? { cityId: city._id } : "skip");
  if (city === undefined) return <SiteFrame><div className="hero" /></SiteFrame>;
  if (city === null) return <SiteFrame><Empty title="No city at this address">Check the link, or start from the front page to add a city.</Empty></SiteFrame>;
  const bodies = rows ?? [];
  return (
    <SiteFrame>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-head">
          <h1 className="display display-xl">{city.name}: boards and commissions</h1>
          <p className="lede">Current members and terms, read from the city's published rosters. Open and expiring seats accept applications.</p>
          <div className="row">
            <Link to={`/c/${city.slug}/openings`} className="btn">See open seats and apply</Link>
            <a className="btn btn-secondary" href={city.websiteUrl} target="_blank" rel="noreferrer">City website</a>
          </div>
        </div>
      </section>
      <div className="stack" style={{ paddingBottom: 48 }}>
        {bodies.map((r) => (
          <PublicBody key={r.body._id} body={r.body} counts={r.counts} slug={city.slug} />
        ))}
      </div>
    </SiteFrame>
  );
}

function PublicBody({ body, counts, slug }: { body: Doc<"bodies">; counts: Record<"vacant" | "expired" | "expiring" | "active", number>; slug: string }) {
  const data = useQuery(api.roster.board, { bodyId: body._id });
  return (
    <section className="card body-card">
      <div className="body-card-head" style={{ cursor: "default" }}>
        <div>
          <div className="name">{body.name}</div>
          <div className="small muted">
            {[body.meetingCadence, body.termLength && `Terms ${body.termLength}`, body.termLimit && `Limit ${body.termLimit}`].filter(Boolean).join(". ")}
          </div>
        </div>
        <div className="counts">
          {counts.vacant > 0 && <StatusPill status="vacant" count={counts.vacant} />}
          {counts.expired > 0 && <StatusPill status="expired" count={counts.expired} />}
          {counts.expiring > 0 && <StatusPill status="expiring" count={counts.expiring} />}
        </div>
      </div>
      <div className="body-card-body">
        <div className="dais-seats">
          {(data?.seats ?? []).map(({ seat, member, term, status }) => (
            <Nameplate key={seat._id} seat={seat} member={member} term={term} status={status} />
          ))}
        </div>
        <div className="row between">
          <span className="provenance">
            Source: <SourceLink url={body.sourceUrl} />
          </span>
          <Link to={`/c/${slug}/apply?body=${body._id}`} className="btn btn-secondary btn-sm">Apply to this body</Link>
        </div>
      </div>
    </section>
  );
}

export function Openings() {
  const { slug = "" } = useParams();
  const city = useQuery(api.roster.cityBySlug, { slug });
  const openings = useQuery(api.roster.openings, city ? { cityId: city._id } : "skip");
  if (!city) return <SiteFrame><div className="hero" /></SiteFrame>;
  return (
    <SiteFrame>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-head">
          <h1 className="display display-xl">Open and expiring seats in {city.name}</h1>
          <p className="lede">
            {openings ? pluralize(openings.length, "seat") : "Seats"} are open, ended, or within the notice window. Apply to a specific seat or to a body's pool.
          </p>
          <div className="row">
            <Link to={`/c/${city.slug}/apply`} className="btn">Apply for a seat</Link>
            <Link to={`/c/${city.slug}`} className="btn btn-secondary">Full roster</Link>
          </div>
        </div>
      </section>
      <div className="table-wrap" style={{ marginBottom: 48 }}>
        <table className="table">
          <thead>
            <tr><th>Body</th><th>Seat</th><th>Current member</th><th>Term ends</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {(openings ?? []).map(({ body, row }) => (
              <tr key={row.seat._id}>
                <td>{body.name}</td>
                <td>{row.seat.label ?? `Seat ${row.seat.ordinal}`}</td>
                <td>{row.member?.name ?? <span className="muted">Open</span>}</td>
                <td className="num">{formatDate(row.term?.endsAt, row.term?.rawEnd)}</td>
                <td><StatusPill status={row.status} /></td>
                <td><Link to={`/c/${city.slug}/apply?body=${body._id}&seat=${row.seat._id}`}>Apply</Link></td>
              </tr>
            ))}
            {openings && openings.length === 0 && (
              <tr><td colSpan={6} className="muted">No open or expiring seats right now. Applications stay on file for the next vacancy.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </SiteFrame>
  );
}

export type BodyPick = { _id: Id<"bodies">; name: string };
