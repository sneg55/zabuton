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

export const JUNK_KEYWORDS = [
  "specification",
  "budget",
  "capital improvement",
  "water management",
  "action plan",
  "initial study",
  "negative declaration",
  "environmental impact",
  "speech",
  "state of the city",
  "prioritization",
  "executive summary",
  "design guideline",
  "impediments",
  "appendices",
  "memo template",
  "agenda",
  "minutes",
  "staff report",
  "police department",
  "fire department",
  "strategic plan",
  "general plan",
  "housing element",
  "financial report",
  "audit report",
];

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function candidateScore(url: string, title?: string): number {
  const path = pathOf(url);
  const heading = (title ?? "").toLowerCase();
  if (JUNK_KEYWORDS.some((keyword) => path.includes(keyword) || heading.includes(keyword))) return 0;
  if (CANDIDATE_KEYWORDS.some((keyword) => path.includes(keyword))) return 2;
  if (CANDIDATE_KEYWORDS.some((keyword) => heading.includes(keyword))) return 1;
  return 0;
}

export function isCandidateUrl(url: string, title?: string): boolean {
  return candidateScore(url, title) > 0;
}

export type CandidateLink = { url: string; title?: string };

export function filterCandidateUrls(links: CandidateLink[], cap: number = CANDIDATE_URL_CAP): CandidateLink[] {
  const seen = new Set<string>();
  const scored: Array<{ link: CandidateLink; score: number; order: number }> = [];
  links.forEach((link, order) => {
    if (typeof link.url !== "string" || link.url === "") return;
    if (!HTTP_SCHEME.test(link.url)) return;
    const score = candidateScore(link.url, link.title);
    if (score === 0) return;
    const key = link.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    scored.push({ link: { url: link.url, title: link.title }, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, cap).map((row) => row.link);
}

export const BOOTSTRAP_RUN_CAP = 200;
export const CITY_RUN_CAP = 3;
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
