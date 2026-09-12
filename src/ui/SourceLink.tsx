import { describeSource } from "../lib/sources";

export function SourceLink({ url, short }: { url: string; short?: boolean }) {
  const { label, href } = describeSource(url);
  if (href === "#") return <span className="small muted">{label}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer" className="small" title={url} style={{ overflowWrap: "anywhere" }}>
      {short ? "Source" : label}
    </a>
  );
}
