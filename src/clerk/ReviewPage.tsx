import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { draftEvidence, type Evidence } from "../../convex/lib/draftTypes";
import { Empty, PageHead } from "../ui/PageHead";
import { useCity } from "./Shell";

const EVIDENCE_LABEL: Record<Evidence, string> = {
  members_dated: "Members with term dates",
  members: "Members, no dates",
  seats: "Seat counts only",
  rules: "Term rules only",
};
const EVIDENCE_ORDER: Evidence[] = ["members_dated", "members", "seats", "rules"];

export function ReviewPage() {
  const city = useCity();
  const drafts = useQuery(api.drafts.list, { cityId: city._id });
  const latest = useQuery(api.bootstrap.latestRun, { cityId: city._id, purpose: "bootstrap" });
  const dismissMany = useMutation(api.drafts.dismissMany);
  const [tab, setTab] = useState<Evidence | "all">("all");
  if (drafts === undefined) return null;
  const byEvidence = new Map<Evidence, typeof drafts>();
  for (const d of drafts) {
    const e = draftEvidence(d);
    byEvidence.set(e, [...(byEvidence.get(e) ?? []), d]);
  }
  const shown = (tab === "all" ? EVIDENCE_ORDER.flatMap((e) => byEvidence.get(e) ?? []) : byEvidence.get(tab) ?? []);
  return (
    <div className="page">
      <PageHead
        title="Review drafts"
        intro="Each draft came from a document on the city's site. Check the names and dates against the quoted sentences, fix anything, then confirm. Confirmed bodies appear on the board and the public roster."
        actions={latest && latest.status !== "review" && latest.status !== "done" ? <span className="pill pill-neutral">Bootstrap {latest.status}</span> : undefined}
      />
      {drafts.length === 0 && (
        <Empty title="Nothing waiting for review">
          Run the bootstrap from the <Link to="/">front page</Link>, or import a spreadsheet in Settings.
        </Empty>
      )}
      {drafts.length > 0 && (
        <div className="row between">
          <div className="tabs" style={{ borderBottom: 0 }}>
            <button className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>All {drafts.length}</button>
            {EVIDENCE_ORDER.filter((e) => byEvidence.has(e)).map((e) => (
              <button key={e} className={tab === e ? "active" : ""} onClick={() => setTab(e)}>{EVIDENCE_LABEL[e]} {byEvidence.get(e)!.length}</button>
            ))}
          </div>
          {tab !== "all" && shown.length > 0 && (
            <button className="btn btn-quiet btn-sm" onClick={() => void dismissMany({ draftIds: shown.map((d) => d._id) })}>Dismiss all {shown.length} in this group</button>
          )}
        </div>
      )}
      <div className="stack" style={{ gap: 16 }}>
        {shown.map((d) => <DraftCard key={d._id} draft={d} />)}
      </div>
    </div>
  );
}

function DraftCard({ draft }: { draft: Doc<"drafts"> }) {
  const confirm = useMutation(api.drafts.confirm);
  const dismiss = useMutation(api.drafts.dismiss);
  const [name, setName] = useState(draft.name);
  const [termLength, setTermLength] = useState(draft.termLength ?? "");
  const [termLimit, setTermLimit] = useState(draft.termLimit ?? "");
  const [members, setMembers] = useState(draft.members);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unknownDates = members.filter((m) => !m.termEnd).length;
  return (
    <section className="card">
      <div className="body-card-head" style={{ cursor: "default", alignItems: "flex-start" }}>
        <div className="stack" style={{ gap: 8, flex: 1 }}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} aria-label="Body name" style={{ fontFamily: "var(--display)", fontSize: "1.2rem", height: 44 }} />
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={termLength} onChange={(e) => setTermLength(e.target.value)} placeholder="Term length, e.g. four years" style={{ maxWidth: 240 }} aria-label="Term length" />
            <input className="input" value={termLimit} onChange={(e) => setTermLimit(e.target.value)} placeholder="Term limit, e.g. two terms" style={{ maxWidth: 240 }} aria-label="Term limit" />
            {draft.meetingCadence && <span className="small muted">{draft.meetingCadence}</span>}
          </div>
          <span className="provenance">
            From <a href={draft.sourceUrl} target="_blank" rel="noreferrer">{draft.sourceUrl.replace(/^https?:\/\//, "")}</a>
            {draft.snippet && <> <q>{draft.snippet.slice(0, 160)}</q></>}
          </span>
        </div>
        <div className="counts">
          <span className="pill pill-neutral">{members.length} members</span>
          {unknownDates > 0 && <span className="pill pill-expiring">{unknownDates} without an end date</span>}
          {draft.seatCount !== null && <span className="pill pill-neutral">{draft.seatCount} seats stated</span>}
        </div>
      </div>
      {members.length > 0 && (
        <div className="body-card-body">
          <div className="table-wrap" style={{ border: 0 }}>
            <table className="table">
              <thead>
                <tr><th>Member</th><th>Role</th><th>Appointed</th><th>Term ends</th><th>Quoted from the document</th><th></th></tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr key={i}>
                    <td><input className="input" style={{ height: 32 }} value={m.name} onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Member name" /></td>
                    <td className="muted">{m.role ?? ""}</td>
                    <td className="muted">{m.appointed ?? "Unknown"}</td>
                    <td><input className="input" style={{ height: 32, maxWidth: 120 }} value={m.termEnd ?? ""} placeholder="Unknown" onChange={(e) => setMembers(members.map((x, j) => (j === i ? { ...x, termEnd: e.target.value || null } : x)))} aria-label="Term end" /></td>
                    <td className="provenance"><q>{m.snippet}</q>{m.confidence !== "grounded" && <span className="pill pill-expiring" style={{ marginLeft: 6 }}>{m.confidence}</span>}</td>
                    <td><button className="btn btn-quiet btn-sm" onClick={() => setMembers(members.filter((_, j) => j !== i))}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="row between" style={{ padding: "0 18px 16px" }}>
        <button className="btn btn-quiet" onClick={() => void dismiss({ draftId: draft._id })}>Not a body, dismiss</button>
        <div className="row">
          {error && <span className="error small">{error}</span>}
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError(null);
              confirm({ draftId: draft._id, edits: { name, termLength: termLength || undefined, termLimit: termLimit || undefined, members } })
                .catch((e: Error) => setError(e.message.split("\n")[0]))
                .finally(() => setBusy(false));
            }}
          >
            Confirm {name}
          </button>
        </div>
      </div>
    </section>
  );
}
