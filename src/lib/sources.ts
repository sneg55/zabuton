export type SourceRef = { label: string; href: string };

export function describeSource(url: string): SourceRef {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { label: url, href: url };
  }
  const legistar = /^webapi\.legistar\.com$/i.test(parsed.hostname) && /^\/v1\/([^/]+)\//.exec(parsed.pathname);
  if (legistar) {
    const client = legistar[1];
    const bodyId = /OfficeRecordBodyId\s+eq\s+(\d+)/i.exec(decodeURIComponent(parsed.search))?.[1];
    return {
      label: `Legistar records for ${client}${bodyId ? `, body ${bodyId}` : ""}`,
      href: `https://${client}.legistar.com/Departments.aspx`,
    };
  }
  if (url.startsWith("application:")) return { label: "Appointed through an application", href: "#" };
  const path = decodeURIComponent(parsed.pathname).replace(/\/+$/, "");
  const trimmed = path.length > 48 ? `${path.slice(0, 45)}...` : path;
  return { label: `${parsed.hostname.replace(/^www\./, "")}${trimmed}`, href: url };
}
