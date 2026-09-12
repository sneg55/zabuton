import { useQuery } from "convex/react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Nameplate } from "../ui/Nameplate";
import { SiteFrame } from "../ui/Site";
import { StatusPill } from "../ui/StatusPill";

const EXAMPLE_BODIES = ["Planning Commission", "Parks and Community Services Commission", "Tri-Valley Accessible Advisory Committee"];

export function Landing() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  return (
    <SiteFrame>
      <section className="hero hero-band">
        <div className="hero-head">
          <h1 className="display display-xl">Every seat, every term, read straight off your <span className="accent">city's website</span>.</h1>
          <p className="lede">
            Zabuton finds the boards and commissions pages a city already publishes, builds the roster with terms and term limits, and then keeps
            watch: expiring seats, vacancies, applications from residents, and the notices that go out before a term runs down.
          </p>
          <form
            className="urlform"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) navigate(`/start?url=${encodeURIComponent(url.trim())}`);
            }}
          >
            <input className="input" type="url" placeholder="https://www.yourcity.gov" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Your city's website" required />
            <button className="btn" type="submit">Build the roster</button>
          </form>
          <p className="small muted note">Works on the pages and PDFs a clerk already maintains. Nothing is guessed: a date the city has not published stays unknown.</p>
        </div>
        <div className="hero-stage">
          <ExampleDais />
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="display display-lg">How a city gets on</h2>
          <p className="lede">Three steps, all of them visible on screen while they run.</p>
        </div>
        <div className="feature-block">
        <div className="steps">
          <div className="step">
            <h3>Find the pages</h3>
            <p>Firecrawl maps the city site for boards, commissions and committees, including the roster PDFs and annual appointment notices most cities publish.</p>
          </div>
          <div className="step">
            <h3>Read them with receipts</h3>
            <p>Each document is classified first (roster, vacancy notice, rules page), then extracted. Every name and date carries the exact sentence it came from.</p>
          </div>
          <div className="step">
            <h3>Confirm body by body</h3>
            <p>The clerk reviews each draft board against its source and confirms it. Nothing unconfirmed drives a notice or a public page.</p>
          </div>
        </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="display display-lg">What it keeps current</h2>
        </div>
        <div className="features">
          <div className="feature">
            <h3>Seats with terms, not just names</h3>
            <p>Terms belong to seats. A seat shows who holds it, when the term ends, and turns to an open seat the day it runs out.</p>
          </div>
          <div className="feature">
            <h3>A public roster and openings page</h3>
            <p>Residents see which seats are open or expiring and apply from the same page. Applications land on the clerk's desk as they arrive.</p>
          </div>
          <div className="feature">
            <h3>Correspondence on one thread</h3>
            <p>Acknowledgements, interview invitations and decisions go out from the city's inbox and stay on the applicant's thread, so the record is complete.</p>
          </div>
          <div className="feature">
            <h3>Term notices with approval</h3>
            <p>Expiry and reappointment notices are drafted from the seat record and sent only after the clerk approves them.</p>
          </div>
          <div className="feature">
            <h3>Drift checks against the city site</h3>
            <p>The source pages are re-read on a schedule. When the published roster and the tracked one disagree, both sides are shown for a decision.</p>
          </div>
          <div className="feature">
            <h3>Annual appointments list, one query away</h3>
            <p>California's Maddy Act list and similar annual notices are a report over data you already keep, not a December project.</p>
          </div>
        </div>
      </section>
    </SiteFrame>
  );
}

function ExampleDais() {
  const city = useQuery(api.roster.cityBySlug, { slug: "dublin-ca" });
  const rows = useQuery(api.roster.city, city ? { cityId: city._id } : "skip");
  if (!city || !rows) return <div className="dais" style={{ minHeight: 320 }} aria-hidden="true" />;
  const picked = rows.filter((r) => EXAMPLE_BODIES.includes(r.body.name));
  const totals = rows.reduce(
    (acc, r) => ({ expired: acc.expired + r.counts.expired, expiring: acc.expiring + r.counts.expiring, vacant: acc.vacant + r.counts.vacant, active: acc.active + r.counts.active, unlisted: acc.unlisted + r.counts.unlisted }),
    { expired: 0, expiring: 0, vacant: 0, active: 0, unlisted: 0 },
  );
  return (
    <div className="dais">
      <div className="dais-head">
        <div>
          <span className="display display-md">{city.name}</span>
          <span className="muted small">, read from the city's own boards and commissions pages</span>
        </div>
        <div className="counts">
          <StatusPill status="expired" count={totals.expired} />
          <StatusPill status="expiring" count={totals.expiring} />
          <StatusPill status="vacant" count={totals.vacant} />
          <StatusPill status="active" count={totals.active} />
        </div>
      </div>
      {picked.map((r) => (
        <DaisBody key={r.body._id} bodyId={r.body._id} name={r.body.name} />
      ))}
      <div className="row between">
        <span className="muted small">{rows.length} bodies tracked for {city.name}.</span>
        <Link to={`/c/${city.slug}`} className="btn btn-secondary btn-sm">See the full public roster</Link>
      </div>
    </div>
  );
}

function DaisBody({ bodyId, name }: { bodyId: Id<"bodies">; name: string }) {
  const data = useQuery(api.roster.board, { bodyId });
  if (!data) return null;
  return (
    <div className="dais-body">
      <h3>{name}</h3>
      <div className="dais-seats">
        {data.seats.filter((row) => row.status !== "unlisted").slice(0, 6).map(({ seat, member, term, status }) => (
          <Nameplate key={seat._id} seat={seat} member={member} term={term} status={status} />
        ))}
      </div>
    </div>
  );
}
