import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../../convex/_generated/api";
import { formatDateTime, formatRawDate } from "../lib/format";
import { Empty, PageHead } from "../ui/PageHead";
import { SourceLink } from "../ui/SourceLink";
import { useCity } from "./Shell";
import { errorText } from "../lib/errors";

const FIELD_LABEL: Record<string, string> = {
  member_added: "On the city page, not tracked",
  member_missing: "Tracked, gone from the city page",
  term_end: "Term end differs",
};

export function DriftPage() {
  const city = useCity();
  const flags = useQuery(api.drift.list, { cityId: city._id });
  const latest = useQuery(api.bootstrap.latestRun, { cityId: city._id, purpose: "drift" });
  const runNow = useMutation(api.drift.runNow);
  const resolve = useMutation(api.drift.resolve);
  const [error, setError] = useState<string | null>(null);
  const running = latest && !["review", "done", "failed"].includes(latest.status);
  if (!flags) return null;
  return (
    <div className="page">
      <PageHead
        title="Drift"
        intro="The city's roster pages are re-read daily. When the published roster and the tracked one disagree, both sides are shown here for a decision."
        actions={
          <div className="row">
            {latest && <span className="small muted">Last check {formatDateTime(latest.finishedAt ?? latest.startedAt)}{running ? ", running" : latest.status === "failed" ? ", failed" : ""}</span>}
            <button className="btn btn-secondary" disabled={!!running} onClick={() => { setError(null); runNow({ cityId: city._id }).catch((e: unknown) => setError(errorText(e))); }}>
              Check the city site now
            </button>
          </div>
        }
      />
      {error && <div className="notice notice-danger">{error}</div>}
      {latest?.status === "failed" && latest.error && <div className="notice notice-danger">{latest.error}</div>}
      {flags.length === 0 && <Empty title="Tracked roster matches the city site">Nothing has drifted since the last check.</Empty>}
      <div className="stack">
        {flags.map((f) => (
          <div key={f._id} className="card card-pad stack">
            <div className="row between">
              <div>
                <strong>{f.bodyName ?? "Unknown body"}</strong>
                <span className="muted">{f.memberName ? `, ${f.memberName}` : ""}. {FIELD_LABEL[f.field] ?? f.field}.</span>
              </div>
              <SourceLink url={f.sourceUrl} />
            </div>
            <div className="diff">
              <div><div className="label">City page says</div>{f.published || <span className="muted">Nothing</span>}</div>
              <div><div className="label">Tracked here</div>{f.tracked ? formatRawDate(f.tracked) : <span className="muted">Nothing</span>}</div>
            </div>
            {f.snippet && <span className="provenance"><q>{f.snippet}</q></span>}
            <div className="row">
              <button className="btn btn-sm" onClick={() => void resolve({ flagId: f._id, action: "accept_published" })}>Update to what the city page says</button>
              <button className="btn btn-secondary btn-sm" onClick={() => void resolve({ flagId: f._id, action: "keep_tracked" })}>Keep what is tracked</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
