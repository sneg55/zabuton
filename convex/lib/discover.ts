export type CityRef = {
  domain: string;
  slug: string;
  name: string;
  websiteUrl: string;
};

const HTTP_SCHEME = /^https?:\/{2}/i;
const HTTPS_PREFIX = "https://";

const TLD_LABELS = new Set(["gov", "org", "com", "net", "us", "info"]);

export function normalizeCityUrl(input: string): CityRef {
  const trimmed = input.trim();
  if (trimmed === "") throw new Error("Enter a city website URL");
  const withScheme = HTTP_SCHEME.test(trimmed) ? trimmed : `${HTTPS_PREFIX}${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    throw new Error(`Not a URL: ${input}`);
  }
  const host = parsed.hostname.toLowerCase();
  if (!host.includes(".")) throw new Error(`Not a website address: ${input}`);
  const domain = host.startsWith("www.") ? host.slice(4) : host;
  const labels = domain.split(".");
  const meaningful = labels.length > 1 && TLD_LABELS.has(labels[labels.length - 1]) ? labels.slice(0, -1) : labels;
  return {
    domain,
    slug: meaningful.join("-"),
    name: meaningful.map(titleCaseLabel).join(", "),
    websiteUrl: parsed.origin,
  };
}

function titleCaseLabel(label: string): string {
  if (label.length === 2) return label.toUpperCase();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function legistarClientGuesses(domain: string): string[] {
  const labels = domain.split(".").filter((label) => label !== "www");
  const guesses: string[] = [];
  if (labels.length > 0) guesses.push(labels[0]);
  if (labels.length > 1) {
    const last = labels[labels.length - 1];
    guesses.push(TLD_LABELS.has(last) ? labels[labels.length - 2] : last);
  }
  return guesses.filter((guess, i) => guess.length > 1 && guesses.indexOf(guess) === i);
}

export const CANDIDATE_KEYWORDS = [
  "board",
  "commission",
  "committee",
  "appointment",
  "vacancy",
  "maddy",
  "roster",
  "clerk",
];

export const CANDIDATE_URL_CAP = 40;

export function isCandidateUrl(url: string): boolean {
  let path: string;
  try {
    const parsed = new URL(url);
    path = `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    path = url.toLowerCase();
  }
  if (path.includes(".pdf")) return true;
  return CANDIDATE_KEYWORDS.some((keyword) => path.includes(keyword));
}

export type CandidateLink = { url: string; title?: string };

export function filterCandidateUrls(links: CandidateLink[], cap: number = CANDIDATE_URL_CAP): CandidateLink[] {
  const seen = new Set<string>();
  const kept: CandidateLink[] = [];
  for (const link of links) {
    if (typeof link.url !== "string" || link.url === "") continue;
    if (!HTTP_SCHEME.test(link.url)) continue;
    if (!isCandidateUrl(link.url)) continue;
    const key = link.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ url: link.url, title: link.title });
    if (kept.length >= cap) break;
  }
  return kept;
}

export const BOOTSTRAP_RUN_CAP = 30;
export const BOOTSTRAP_RUN_WINDOW_MS = 24 * 60 * 60 * 1000;

export function overRunCap(startedAts: number[], now: number, cap: number = BOOTSTRAP_RUN_CAP): boolean {
  const since = now - BOOTSTRAP_RUN_WINDOW_MS;
  return startedAts.filter((at) => at >= since).length >= cap;
}

export const IN_PROGRESS_STATUSES = ["queued", "discovering", "fetching", "extracting"] as const;

export const FIRECRAWL_FALLBACK_CAP = 10;

export const SCRAPED_CONTENT_TYPE = "text/markdown";

export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";

export function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const PREVIEW_CHARS = 500;

export function previewOf(text: string): string {
  return text.slice(0, PREVIEW_CHARS);
}

export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter((part) => part !== "").pop();
    return decodeURIComponent(last ?? parsed.hostname).replace(/[-_]+/g, " ");
  } catch {
    return url;
  }
}
