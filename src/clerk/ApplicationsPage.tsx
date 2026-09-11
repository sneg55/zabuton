import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatDateTime } from "../lib/format";
import { Empty, PageHead } from "../ui/PageHead";
import { useCity } from "./Shell";
import { errorText } from "../lib/errors";

type State = Doc<"applications">["state"];

const STATE_LABEL: Record<State, string> = {
  received: "Received",
  under_review: "Under review",
  interviewed: "Interviewed",
  appointed: "Appointed",
  declined: "Declined",
};

const NEXT: Record<State, State[]> = {
  received: ["under_review", "declined"],
  under_review: ["interviewed", "appointed", "declined"],
  interviewed: ["appointed", "declined"],
  appointed: [],
  declined: [],
};

export function ApplicationsPage() {
  const city = useCity();
  const list = useQuery(api.applications.list, { cityId: city._id });
  const [openId, setOpenId] = useState<Id<"applications"> | null>(null);
  if (list === undefined) return null;
  const open = list.find((a) => a._id === openId) ?? null;
  return (
    <div className="page">
      <PageHead title="Applications" intro="Residents apply from the public openings page. Each application keeps one email thread, so every reply lands here." />
      {list.length === 0 && <Empty title="No applications yet">Share the public openings page. New applications appear here the moment they are sent.</Empty>}
      {list.length > 0 && (
        <div className={`split${open ? " split-open" : ""}`}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Applicant</th><th>Body</th><th>State</th><th>Updated</th></tr></thead>
              <tbody>
                {list.map((a) => (
                  <tr key={a._id} onClick={() => setOpenId(a._id)} style={{ cursor: "pointer", background: a._id === openId ? "var(--chamber-tint)" : undefined }}>
                    <td>{a.applicantName}<div className="small muted">{a.email}</div></td>
                    <td>{a.bodyName ?? <span className="muted">Any opening</span>}{a.seatLabel && <div className="small muted">{a.seatLabel}</div>}</td>
                    <td><span className={`pill ${a.state === "appointed" ? "pill-active" : a.state === "declined" ? "pill-expired" : "pill-neutral"}`}>{STATE_LABEL[a.state]}</span></td>
                    <td className="muted small">{formatDateTime(a.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {open && <ApplicationDetail id={open._id} onClose={() => setOpenId(null)} />}
        </div>
      )}
    </div>
  );
}

function ApplicationDetail({ id, onClose }: { id: Id<"applications">; onClose: () => void }) {
  const data = useQuery(api.applications.get, { applicationId: id });
  const draftReply = useAction(api.applications.draftReply);
  const setState = useMutation(api.applications.setState);
  const [target, setTarget] = useState<State | null>(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data) return null;
  const { application, body, seat, events, messages } = data;
  return (
    <div className="card card-pad stack" style={{ gap: 18 }}>
      <div className="row between">
        <div>
          <div className="display display-md">{application.applicantName}</div>
          <div className="muted small">{application.email}. {body ? body.name : "Any opening"}{seat ? `, ${seat.label ?? `seat ${seat.ordinal}`}` : ""}.</div>
        </div>
        <button className="btn btn-quiet btn-sm" onClick={onClose}>Close</button>
      </div>
      <div className="msg" style={{ maxWidth: "none" }}>{application.statement}</div>
      {NEXT[application.state].length > 0 && (
        <div className="stack">
          <div className="row">
            <span className="small muted">Move to</span>
            {NEXT[application.state].map((s) => (
              <button
                key={s}
                className={`btn btn-sm ${target === s ? "" : "btn-secondary"}`}
                onClick={() => {
                  setTarget(s);
                  setReply("");
                  setError(null);
                  setBusy(true);
                  draftReply({ applicationId: id, state: s })
                    .then((r) => setReply(r.text))
                    .catch(() => setReply(""))
                    .finally(() => setBusy(false));
                }}
              >
                {STATE_LABEL[s]}
              </button>
            ))}
          </div>
          {target && (
            <div className="stack">
              <textarea className="textarea" value={reply} onChange={(e) => setReply(e.target.value)} placeholder={busy ? "Drafting a reply from the record" : "Reply to send on the applicant's thread (optional)"} />
              <div className="row between">
                <span className="small muted">{application.threadId ? "Sends on the existing thread." : "No email thread yet; the reply is recorded and sent as a new message if email is configured."}</span>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setState({ applicationId: id, state: target, replyText: reply.trim() || undefined })
                      .then(() => { setTarget(null); setReply(""); })
                      .catch((e: unknown) => setError(errorText(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {target === "appointed" ? "Record appointment and send" : `Mark ${STATE_LABEL[target].toLowerCase()} and send`}
                </button>
              </div>
              {error && <p className="error small">{error}</p>}
            </div>
          )}
        </div>
      )}
      <div className="stack">
        <h3 className="display display-md">Thread</h3>
        <div className="thread">
          {messages.length === 0 && <span className="muted small">No email on this application yet.</span>}
          {messages.map((m) => (
            <div key={m._id} className={`msg ${m.direction}`}>
              <small>{m.direction === "outbound" ? "Clerk" : m.from}, {formatDateTime(m.at)}</small>
              {m.text}
            </div>
          ))}
        </div>
      </div>
      <div className="log">
        {events.map((e) => (
          <div key={e._id} className="log-row">
            <time>{formatDateTime(e.at)}</time>
            <span>{STATE_LABEL[e.state]}{e.note ? `. ${e.note}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
