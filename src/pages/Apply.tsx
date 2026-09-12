import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { SiteFrame } from "../ui/Site";
import { CityNotFound } from "./PublicCity";
import { PublicSkeleton } from "../ui/Skeleton";

export function Apply() {
  const { slug = "" } = useParams();
  const [params] = useSearchParams();
  const city = useQuery(api.roster.cityBySlug, { slug });
  const rows = useQuery(api.roster.city, city ? { cityId: city._id } : "skip");
  const submit = useMutation(api.applications.submit);
  const [bodyId, setBodyId] = useState<string>(params.get("body") ?? "");
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const seatId = params.get("seat");
  const mailOn = useQuery(api.mail.isConfigured);
  const board = useQuery(api.roster.board, seatId && bodyId ? { bodyId: bodyId as Id<"bodies"> } : "skip");
  if (city === undefined) return <SiteFrame><PublicSkeleton /></SiteFrame>;
  if (city === null) return <CityNotFound />;
  const chosen = rows?.find((r) => r.body._id === bodyId);
  const seat = board?.seats.find((row) => row.seat._id === seatId);
  const seatName = seat ? seat.seat.label ?? `Seat ${seat.seat.ordinal}` : null;
  if (done) {
    return (
      <SiteFrame>
        <section className="hero">
          <div className="hero-head">
            <h1 className="display display-xl">Application received</h1>
            <p className="lede">
              {mailOn
                ? "The clerk's office has it. You will hear back by email on the same thread, so replies to that message reach the clerk directly."
                : `The clerk's office has it and will reply to ${done} directly.`}
            </p>
            <div className="row">
              <Link to={`/c/${city.slug}`} className="btn btn-secondary">Back to the roster</Link>
            </div>
          </div>
        </section>
      </SiteFrame>
    );
  }
  return (
    <SiteFrame>
      <section className="hero" style={{ paddingBottom: 48 }}>
        <div className="hero-head">
          <h1 className="display display-xl">Apply for a seat in {city.name}</h1>
          <p className="lede">Applications stay on file with the clerk and are considered when a seat opens or at the annual appointments.</p>
        </div>
        <form
          className="stack card card-pad"
          style={{ maxWidth: 640, gap: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const f = new FormData(e.currentTarget);
            submit({
              citySlug: city.slug,
              bodyId: bodyId ? (bodyId as Id<"bodies">) : undefined,
              seatId: seatId && chosen ? (seatId as Id<"seats">) : undefined,
              applicantName: String(f.get("name")),
              email: String(f.get("email")),
              statement: String(f.get("statement")),
            })
              .then(() => setDone(String(f.get("email"))))
              .catch(() => setError("The application could not be saved. Try again in a moment."))
              .finally(() => setBusy(false));
          }}
        >
          <label className="field">
            <span>Board or commission</span>
            <select className="select" value={bodyId} onChange={(e) => setBodyId(e.target.value)}>
              <option value="">Any body with an opening</option>
              {(rows ?? []).map((r) => (
                <option key={r.body._id} value={r.body._id}>{r.body.name}</option>
              ))}
            </select>
          </label>
          {seatId && chosen && <p className="small muted">Applying for the {seatName ?? "selected"} seat on the {chosen.body.name}.</p>}
          <label className="field">
            <span>Your name</span>
            <input className="input" name="name" required autoComplete="name" />
          </label>
          <label className="field">
            <span>Email</span>
            <input className="input" name="email" type="email" required autoComplete="email" />
          </label>
          <label className="field">
            <span>Why you want to serve, and any relevant experience</span>
            <textarea className="textarea" name="statement" required minLength={40} placeholder="A few sentences is enough." />
          </label>
          <div className="row between">
            <span className="small muted">Residency and eligibility rules are the city's; the clerk will confirm them with you.</span>
            <button className="btn" type="submit" disabled={busy}>Send application</button>
          </div>
          {error && <p className="error small">{error}</p>}
        </form>
      </section>
    </SiteFrame>
  );
}
