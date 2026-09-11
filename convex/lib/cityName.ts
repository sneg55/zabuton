const SEPARATORS = /\s*(?:\||–|—|::|:|·|»|-)\s*/;
const NOISE = /^(home|homepage|welcome|welcome to|official website|official site|city website|government|default|index)$/i;
const LEADING_NOISE = /^(welcome to|the official website of|official website of|official site of)\s+/i;

export function titleOfHtml(html: string): string | null {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!m) return null;
  const text = m[1].replace(/\s+/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim();
  return text === "" ? null : text;
}

export function cityNameFromTitle(title: string | null): string | null {
  if (!title) return null;
  const parts = title
    .split(SEPARATORS)
    .map((p) => p.replace(LEADING_NOISE, "").trim())
    .filter((p) => p !== "" && !NOISE.test(p));
  if (parts.length === 0) return null;
  const withState = parts.find((p) => /,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)?)$/.test(p));
  const civic = parts.find((p) => /^(the )?(city|town|village|county|borough|township) of /i.test(p));
  const pick = withState ?? civic ?? parts[0];
  if (pick.length > 60 || /[.!?]$/.test(pick) || pick.split(" ").length > 8) return null;
  return pick;
}
