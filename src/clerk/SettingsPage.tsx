import { useAction, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../../convex/_generated/api";
import { PageHead } from "../ui/PageHead";
import { useCity } from "./Shell";
import { errorText } from "../lib/errors";

export function SettingsPage() {
  const city = useCity();
  const update = useMutation(api.cities.update);
  const ensureInbox = useAction(api.mail.ensureInbox);
  const mailStatus = useAction(api.mail.status);
  const importCsv = useMutation(api.bootstrap.importCsv);
  const [name, setName] = useState(city.name);
  const [days, setDays] = useState(String(city.expiringDays ?? 120));
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    mailStatus({}).then((r) => setConfigured(r.configured)).catch(() => setConfigured(false));
  }, [mailStatus]);
  const run = (p: Promise<unknown>, ok: string) => {
    setMessage(null);
    setError(null);
    p.then(() => setMessage(ok)).catch((e: unknown) => setError(errorText(e)));
  };
  return (
    <div className="page">
      <PageHead title="Settings" intro={`${city.domain}. Changes apply to the board and the public pages immediately.`} />
      {message && <div className="notice">{message}</div>}
      {error && <div className="notice notice-danger">{error}</div>}
      <div className="grid-2" style={{ alignItems: "start" }}>
        <form className="card card-pad stack" onSubmit={(e) => { e.preventDefault(); run(update({ cityId: city._id, name, expiringDays: Number(days) || 120 }), "Saved."); }}>
          <h2 className="display display-md">City</h2>
          <label className="field"><span>Display name</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Notice window, days before a term ends</span><input className="input" type="number" min={7} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></label>
          <div className="row between">
            <span className="small muted">{city.status === "draft" ? "Still in setup: confirmed bodies already show on the public roster." : "Roster is published."}</span>
            <button className="btn" type="submit">Save</button>
          </div>
          {city.status === "draft" && <button type="button" className="btn btn-secondary" onClick={() => run(update({ cityId: city._id, status: "confirmed" }), "Marked as set up. Daily drift checks now cover this city.")}>Finish setup</button>}
        </form>
        <div className="card card-pad stack">
          <h2 className="display display-md">City inbox</h2>
          {configured === false && <div className="notice">Email is not configured on this deployment. Applications and notices are recorded but nothing is sent until an AgentMail key is set.</div>}
          {city.inboxAddress ? (
            <p>Applicants and members hear from <strong>{city.inboxAddress}</strong>. Replies come back to the matching thread.</p>
          ) : (
            <p className="muted">No inbox yet. One inbox per city; threads per applicant and per member.</p>
          )}
          {!city.inboxAddress && (
            <button className="btn btn-secondary" disabled={configured === false} onClick={() => run(ensureInbox({ cityId: city._id }), "Inbox created.")}>Create the city inbox</button>
          )}
        </div>
        <form className="card card-pad stack" style={{ gridColumn: "1 / -1" }} onSubmit={(e) => { e.preventDefault(); run(importCsv({ cityId: city._id, csv }).then(() => setCsv("")), "Imported. Review the drafts."); }}>
          <h2 className="display display-md">Import a roster from a spreadsheet</h2>
          <p className="muted">When the city's pages defeat the crawl, paste CSV with the columns body, member, role, appointed, term_end, source_url. Rows become drafts for review, never confirmed bodies.</p>
          <textarea className="textarea" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={"body,member,role,appointed,term_end,source_url\nPlanning Commission,Ada Lovelace,,12/24,12/28,https://city.gov/roster.pdf"} style={{ fontFamily: "ui-monospace, monospace", fontSize: "0.875rem" }} />
          <div className="row between">
            <span className="small muted">Dates keep the spreadsheet's format; month and year is enough.</span>
            <button className="btn" type="submit" disabled={!csv.trim()}>Import as drafts</button>
          </div>
        </form>
      </div>
    </div>
  );
}
