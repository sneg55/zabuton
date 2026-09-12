import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatDate, formatDateTime } from "../lib/format";
import { Empty, PageHead } from "../ui/PageHead";
import { PageSkeleton } from "../ui/Skeleton";
import { StatusPill } from "../ui/StatusPill";
import { READ_ONLY_HINT, useCity, useDesk } from "./Shell";
import { errorText } from "../lib/errors";

const KIND_LABEL: Record<Doc<"notices">["kind"], string> = { term_expiry: "Term expiry", reappointment: "Reappointment" };
const STALE_DAYS = 90;
const DAY = 86_400_000;

export function NoticesPage() {
  const city = useCity();
  const notices = useQuery(api.notices.list, { cityId: city._id });
  const openings = useQuery(api.roster.openings, { cityId: city._id });
  const draft = useAction(api.notices.draft);
  const approve = useMutation(api.notices.approve);
  const discard = useMutation(api.notices.discard);
  const setEmail = useMutation(api.members.setEmail);
  const { readOnly } = useDesk();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!notices || !openings) return <PageSkeleton rows={6} table />;
  const now = Date.now();
  const held = openings.filter((o) => o.row.member && o.row.status !== "vacant" && o.row.status !== "unlisted");
  const stale = held.filter((o) => o.row.term?.endsAt !== undefined && o.row.term.endsAt < now - STALE_DAYS * DAY);
  const withMembers = held.filter((o) => !stale.includes(o));
  const noticed = new Set(notices.filter((n) => n.status !== "failed").map((n) => n.seatId));
  const pending = notices.filter((n) => n.status === "draft");
  const sent = notices.filter((n) => n.status !== "draft");
  return (
    <div className="page">
      <PageHead title="Notices" intro="Term-expiry and reappointment notices are drafted from the seat record and go out only after you approve them. Nobody is emailed who is not on the confirmed roster." />
      {error && <div className="notice notice-danger">{error}</div>}
      <section className="stack">
        <h2 className="display display-md">Seats that need a notice</h2>
        {withMembers.length === 0 && <Empty title="No expiring or recently ended terms">Notices appear here as seats enter the notice window.</Empty>}
        {stale.length > 0 && (
          <p className="small muted">
            {stale.length === 1 ? "1 seat" : `${stale.length} seats`} ended more than {STALE_DAYS} days ago ({stale.map((o) => o.row.member!.name).join(", ")}). A notice would reach someone whose term is long over; update the roster from <Link to="/clerk/drift">Drift</Link> instead.
          </p>
        )}
        {withMembers.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Body</th><th>Member</th><th>Email</th><th>Term ends</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {withMembers.map(({ body, row }) => (
                  <tr key={row.seat._id}>
                    <td>{body.name}</td>
                    <td>{row.member!.name}</td>
                    <td>
                      <EmailCell member={row.member!} readOnly={readOnly} onSave={(email) => setEmail({ memberId: row.member!._id, email })} />
                    </td>
                    <td className="num">{formatDate(row.term?.endsAt, row.term?.rawEnd)}</td>
                    <td><StatusPill status={row.status} /></td>
                    <td>
                      {noticed.has(row.seat._id) ? (
                        <span className="small muted">Drafted</span>
                      ) : (
                        <div className="row" style={{ gap: 6 }}>
                          {(["term_expiry", "reappointment"] as const).map((kind) => (
                            <button
                              key={kind}
                              className="btn btn-secondary btn-sm"
                              disabled={readOnly || busy === row.seat._id + kind}
                              title={readOnly ? READ_ONLY_HINT : undefined}
                              onClick={() => {
                                setBusy(row.seat._id + kind);
                                setError(null);
                                draft({ seatId: row.seat._id, kind }).catch((e: unknown) => setError(errorText(e))).finally(() => setBusy(null));
                              }}
                            >
                              Draft {KIND_LABEL[kind].toLowerCase()}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pending.length > 0 && (
        <section className="stack">
          <h2 className="display display-md">Waiting for approval</h2>
          {pending.map((n) => (
            <div key={n._id} className="card card-pad stack">
              <div className="row between">
                <div>
                  <strong>{n.subject}</strong>
                  <div className="small muted">To {n.memberName} ({n.memberEmail ?? "no email on file"}), {n.bodyName}. {KIND_LABEL[n.kind]}.</div>
                </div>
                <div className="row">
                  <button className="btn btn-quiet btn-sm" disabled={readOnly} title={readOnly ? READ_ONLY_HINT : undefined} onClick={() => void discard({ noticeId: n._id })}>Discard</button>
                  <button
                    className="btn btn-sm"
                    disabled={readOnly || busy === n._id}
                    title={readOnly ? READ_ONLY_HINT : undefined}
                    onClick={() => {
                      setBusy(n._id);
                      setError(null);
                      approve({ noticeId: n._id }).catch((e: unknown) => setError(errorText(e))).finally(() => setBusy(null));
                    }}
                  >
                    Approve and send
                  </button>
                </div>
              </div>
              <div className="msg" style={{ maxWidth: "none" }}>{n.body}</div>
            </div>
          ))}
        </section>
      )}
      {sent.length > 0 && (
        <section className="stack">
          <h2 className="display display-md">Approved notices</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Subject</th><th>To</th><th>Status</th><th>When</th></tr></thead>
              <tbody>
                {sent.map((n) => (
                  <tr key={n._id}>
                    <td>{n.subject}</td>
                    <td>{n.memberName}<div className="small muted">{n.memberEmail}</div></td>
                    <td><span className={`pill ${n.status === "sent" ? "pill-active" : n.status === "failed" ? "pill-expired" : "pill-neutral"}`}>{n.status}</span>{n.error && <div className="small error">{n.error}</div>}</td>
                    <td className="muted small">{n.sentAt ? formatDateTime(n.sentAt) : n.approvedAt ? formatDateTime(n.approvedAt) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function EmailCell({ member, onSave, readOnly }: { member: Doc<"members">; onSave: (email: string) => Promise<unknown>; readOnly: boolean }) {
  const [value, setValue] = useState(member.email ?? "");
  const [editing, setEditing] = useState(!member.email);
  if (readOnly) return <span className="small muted">{member.email ?? "No email on file"}</span>;
  if (!editing) return <span className="small">{member.email} <button className="btn btn-quiet btn-sm" onClick={() => setEditing(true)}>Edit</button></span>;
  return (
    <form className="row" style={{ gap: 6 }} onSubmit={(e) => { e.preventDefault(); void onSave(value).then(() => setEditing(false)); }}>
      <input className="input" style={{ height: 32, width: 200 }} type="email" value={value} onChange={(e) => setValue(e.target.value)} placeholder="member@example.org" required />
      <button className="btn btn-secondary btn-sm" type="submit">Save</button>
    </form>
  );
}

export type NoticeId = Id<"notices">;
