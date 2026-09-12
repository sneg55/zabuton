import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatDateTime } from "../lib/format";
import { Empty } from "../ui/PageHead";
import { SiteFrame } from "../ui/Site";
import { errorText, humanizeRunError } from "../lib/errors";

const STEPS: Array<{ key: Doc<"crawlRuns">["status"][]; label: string }> = [
  { key: ["queued", "discovering"], label: "Finding pages" },
  { key: ["fetching"], label: "Fetching documents" },
  { key: ["extracting"], label: "Reading rosters" },
  { key: ["review", "done"], label: "Ready for review" },
];

const KIND_LABEL: Record<Doc<"documents">["kind"], string> = {
  unclassified: "Not read yet",
  roster: "Roster",
  vacancy_notice: "Vacancy notice",
  rules_page: "Rules page",
  other: "Not a roster",
};

export function Start() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const url = params.get("url") ?? "";
  const start = useMutation(api.bootstrap.start);
  const [runId, setRunId] = useState<Id<"crawlRuns"> | null>((params.get("run") as Id<"crawlRuns"> | null) ?? null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!url || started.current || runId) return;
    started.current = true;
    start({ url })
      .then((r) => {
        setRunId(r.crawlRunId);
        navigate(`/start?run=${r.crawlRunId}`, { replace: true });
      })
      .catch((e: unknown) => setError(errorText(e)));
  }, [url, start, runId, navigate]);
  const status = useQuery(api.bootstrap.status, runId ? { crawlRunId: runId } : "skip");
  return (
    <SiteFrame>
      <section className="hero" style={{ paddingBottom: 24 }}>
        <div className="hero-head">
          <h1 className="display display-xl">{status?.city?.name ?? hostOf(url)}</h1>
          <p className="lede">Reading the boards and commissions pages at {status?.city?.domain ?? hostOf(url)}. Each step is recorded below as it runs.</p>
        </div>
        {error && <div className="notice notice-danger">{error}</div>}
        {status && <RunView status={status} />}
        {!status && !error && <p className="muted">Starting the run.</p>}
      </section>
    </SiteFrame>
  );
}

function RunAgain({ websiteUrl }: { websiteUrl: string }) {
  const navigate = useNavigate();
  const start = useMutation(api.bootstrap.start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        className="btn btn-sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(null);
          start({ url: websiteUrl })
            .then((r) => navigate(`/start?run=${r.crawlRunId}`, { replace: true }))
            .catch((e: unknown) => setError(errorText(e)))
            .finally(() => setBusy(false));
        }}
      >
        Run again
      </button>
      {error && <span className="small">{error}</span>}
    </>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function RunView({ status }: { status: NonNullable<ReturnType<typeof useQuery<typeof api.bootstrap.status>>> }) {
  const { run, documents, drafts, city } = status;
  const stepIndex = STEPS.findIndex((s) => s.key.includes(run.status));
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="progress" role="list">
        {STEPS.map((s, i) => (
          <span key={s.label} role="listitem" className={`progress-step${i < stepIndex ? " done" : ""}${i === stepIndex && run.status !== "failed" ? " active" : ""}`}>
            {s.label}
          </span>
        ))}
        {run.status === "failed" && <span className="progress-step" style={{ background: "var(--brick-tint)", color: "var(--brick)" }}>Stopped</span>}
      </div>
      {run.status === "failed" && (
        <div className="notice notice-danger stack" style={{ gap: 10 }}>
          <span>{humanizeRunError(run.error)} Nothing was confirmed, so running again is safe.</span>
          <div className="row">
            {city && <RunAgain websiteUrl={city.websiteUrl} />}
            <Link to="/clerk/settings" className="btn btn-secondary btn-sm">Import a spreadsheet instead</Link>
          </div>
          {run.error && <span className="small" style={{ opacity: 0.8 }}>Details: {run.error}</span>}
        </div>
      )}
      {(run.status === "review" || run.status === "done") && (
        <div className="card card-pad row between">
          <div>
            <div className="display display-md">{drafts} draft {drafts === 1 ? "body" : "bodies"} ready to review</div>
            <p className="muted">Each draft shows the sentence every name and date came from. Confirm them one by one from the clerk desk.</p>
          </div>
          <div className="row">
            <Link to="/clerk/review" className="btn">Review drafts</Link>
            {city && <Link to={`/c/${city.slug}`} className="btn btn-secondary">Public page</Link>}
          </div>
        </div>
      )}
      <div className="grid-2" style={{ alignItems: "start" }}>
        <div className="card card-pad stack">
          <h2 className="display display-md">Documents</h2>
          {documents.length === 0 && <p className="muted">No candidate pages yet.</p>}
          <div className="stack" style={{ gap: 8 }}>
            {documents.map((d) => (
              <div key={d._id} className="row between" style={{ gap: 8 }}>
                <a href={d.url} target="_blank" rel="noreferrer" className="small" style={{ overflowWrap: "anywhere" }}>{d.title ?? d.url.replace(/^https?:\/\//, "")}</a>
                <span className={`pill ${d.error ? "pill-expired" : d.kind === "roster" ? "pill-active" : "pill-neutral"}`}>{d.error ? "Could not fetch" : KIND_LABEL[d.kind]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card card-pad stack">
          <h2 className="display display-md">Run log</h2>
          <div className="log">
            {run.log.map((l, i) => (
              <div key={i} className="log-row">
                <time>{formatDateTime(l.at).split(", ")[1] ?? formatDateTime(l.at)}</time>
                <span>{l.message}</span>
              </div>
            ))}
            {run.log.length === 0 && <span className="muted">Waiting for the first step.</span>}
          </div>
        </div>
      </div>
      {run.status !== "failed" && documents.length === 0 && run.log.length === 0 && <Empty title="Queued">The run starts within a few seconds.</Empty>}
    </div>
  );
}
