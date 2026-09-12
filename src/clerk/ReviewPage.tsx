import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { draftEvidence, type Evidence } from "../../convex/lib/draftTypes";
import { normalizeTermEnd } from "../../convex/lib/termDates";
import { formatRawDate } from "../lib/format";
import { Empty, PageHead } from "../ui/PageHead";
import { SourceLink } from "../ui/SourceLink";
import { useCity } from "./Shell";
import { errorText } from "../lib/errors";

const EVIDENCE_LABEL: Record<Evidence, string> = {
  members_dated: "Members with term dates",
  members: "Members, no dates",
  seats: "Seat counts only",
  rules: "Term rules only",
};
const EVIDENCE_ORDER: Evidence[] = ["members_dated", "members", "seats", "rules"];
const SAVE_DELAY_MS = 800;

export function ReviewPage() {
  const city = useCity();
  const drafts = useQuery(api.drafts.list, { cityId: city._id });
  const latest = useQuery(api.bootstrap.latestRun, { cityId: city._id, purpose: "bootstrap" });
  const dismissMany = useMutation(api.drafts.dismissMany);
  const [tab, setTab] = useState<Evidence | "all">("all");
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Id<"drafts"> | "none" | null>(null);
  if (drafts === undefined) return null;
  const byEvidence = new Map<Evidence, typeof drafts>();
  for (const d of drafts) {
    const e = draftEvidence(d);
    byEvidence.set(e, [...(byEvidence.get(e) ?? []), d]);
  }
  const inTab = tab === "all" ? EVIDENCE_ORDER.flatMap((e) => byEvidence.get(e) ?? []) : byEvidence.get(tab) ?? [];
  const needle = filter.trim().toLowerCase();
  const shown = needle === "" ? inTab : inTab.filter((d) => d.name.toLowerCase().includes(needle));
  const openId = open === "none" ? null : open && shown.some((d) => d._id === open) ? open : shown[0]?._id ?? null;
  return (
    <div className="page">
      <PageHead
        title="Review drafts"
        intro="Each draft came from a document on the city's site. Open a draft, check the names and dates against the quoted sentences, fix anything, then confirm. Edits save as you type; confirmed bodies appear on the board and the public roster."
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
          <div className="row">
            <input className="input" style={{ width: 220, height: 36 }} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a body" aria-label="Find a body" />
            {tab !== "all" && shown.length > 0 && (
              <button className="btn btn-quiet btn-sm" onClick={() => void dismissMany({ draftIds: shown.map((d) => d._id) })}>Dismiss all {shown.length} in this group</button>
            )}
          </div>
        </div>
      )}
      {drafts.length > 0 && shown.length === 0 && <Empty title="No draft matches">Clear the search or pick another group.</Empty>}
      <div className="stack" style={{ gap: 8 }}>
        {shown.map((d) => (
          <section key={d._id} className="card">
            <button className="draft-row" onClick={() => setOpen(openId === d._id ? "none" : d._id)} aria-expanded={openId === d._id}>
              <span className="name">{d.name}</span>
              <span className="counts">
                <span className="pill pill-neutral">{EVIDENCE_LABEL[draftEvidence(d)]}</span>
                {d.members.length > 0 && <span className="pill pill-neutral">{d.members.length} members</span>}
                {d.seatCount !== null && <span className="pill pill-neutral">{d.seatCount} seats stated</span>}
              </span>
            </button>
            {openId === d._id && <DraftCard draft={d} />}
          </section>
        ))}
      </div>
    </div>
  );
}

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "failed";

function DraftCard({ draft }: { draft: Doc<"drafts"> }) {
  const confirm = useMutation(api.drafts.confirm);
  const dismiss = useMutation(api.drafts.dismiss);
  const saveEdits = useMutation(api.drafts.saveEdits);
  const [name, setName] = useState(draft.name);
  const [termLength, setTermLength] = useState(draft.termLength ?? "");
  const [termLimit, setTermLimit] = useState(draft.termLimit ?? "");
  const [members, setMembers] = useState(draft.members);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const dirty = useRef(false);
  useEffect(() => {
    if (!dirty.current) return;
    setSaveState("unsaved");
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      saveEdits({ draftId: draft._id, edits: { name, termLength: termLength || null, termLimit: termLimit || null, members } })
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("failed"));
    }, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [name, termLength, termLimit, members, draft._id, saveEdits]);
  const edit = <T,>(set: (value: T) => void) => (value: T) => {
    dirty.current = true;
    set(value);
  };
  const unknownDates = members.filter((m) => !m.termEnd).length;
  const invalidDates = members.filter((m) => m.termEnd && normalizeTermEnd(m.termEnd) === null).length;
  return (
    <>
      <div className="body-card-head" style={{ cursor: "default", alignItems: "flex-start", paddingTop: 4 }}>
        <div className="stack" style={{ gap: 8, flex: 1, minWidth: 0 }}>
          <input className="input draft-title" value={name} onChange={(e) => edit(setName)(e.target.value)} aria-label="Body name" />
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={termLength} onChange={(e) => edit(setTermLength)(e.target.value)} placeholder="Term length, e.g. four years" style={{ maxWidth: 240 }} aria-label="Term length" />
            <input className="input" value={termLimit} onChange={(e) => edit(setTermLimit)(e.target.value)} placeholder="Term limit, e.g. two terms" style={{ maxWidth: 240 }} aria-label="Term limit" />
            {draft.meetingCadence && <span className="small muted">{draft.meetingCadence}</span>}
          </div>
          <span className="provenance">
            From <SourceLink url={draft.sourceUrl} />
            {draft.snippet && <> <q>{draft.snippet.slice(0, 160)}</q></>}
          </span>
        </div>
        <div className="counts">
          {unknownDates > 0 && <span className="pill pill-expiring">{unknownDates} without an end date</span>}
          {invalidDates > 0 && <span className="pill pill-expired">{invalidDates} not a date</span>}
          <SaveIndicator state={saveState} />
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
                {members.map((m, i) => {
                  const bad = Boolean(m.termEnd) && normalizeTermEnd(m.termEnd) === null;
                  return (
                    <tr key={i}>
                      <td><input className="input" style={{ height: 32, minWidth: 140 }} value={m.name} onChange={(e) => edit(setMembers)(members.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Member name" /></td>
                      <td className="muted">{m.role ?? ""}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatRawDate(m.appointed ?? undefined)}</td>
                      <td>
                        <input
                          className={`input${bad ? " input-invalid" : ""}`}
                          style={{ height: 32, width: 140 }}
                          value={m.termEnd ?? ""}
                          placeholder="Unknown"
                          aria-label="Term end"
                          aria-invalid={bad}
                          title={bad ? "Not a date. Use a month and year, like 12/2026 or June 2026." : undefined}
                          onChange={(e) => edit(setMembers)(members.map((x, j) => (j === i ? { ...x, termEnd: e.target.value || null } : x)))}
                        />
                        {bad && <div className="small error">Not a date</div>}
                      </td>
                      <td className="provenance"><q>{m.snippet}</q>{m.confidence !== "grounded" && <span className="pill pill-expiring" style={{ marginLeft: 6 }}>{m.confidence}</span>}</td>
                      <td><button className="btn btn-quiet btn-sm" onClick={() => edit(setMembers)(members.filter((_, j) => j !== i))}>Remove</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="row between" style={{ padding: "0 18px 16px" }}>
        <button className="btn btn-quiet" onClick={() => void dismiss({ draftId: draft._id })}>Not a body, dismiss</button>
        <div className="row">
          {error && <span className="error small">{error}</span>}
          {invalidDates > 0 && !error && <span className="small muted">Fix the dates marked in red before confirming.</span>}
          <button
            className="btn"
            disabled={busy || invalidDates > 0 || name.trim() === ""}
            onClick={() => {
              setBusy(true);
              setError(null);
              confirm({ draftId: draft._id, edits: { name, termLength: termLength || undefined, termLimit: termLimit || undefined, members } })
                .catch((e: unknown) => setError(errorText(e)))
                .finally(() => setBusy(false));
            }}
          >
            Confirm {name}
          </button>
        </div>
      </div>
    </>
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  const text = state === "unsaved" ? "Unsaved" : state === "saving" ? "Saving" : state === "saved" ? "Saved" : "Could not save";
  return <span className={`savestate${state === "failed" ? " error" : ""}`}>{text}</span>;
}
