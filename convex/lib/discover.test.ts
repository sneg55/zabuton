import { describe, expect, it } from "vitest";
import {
  filterCandidateUrls,
  isCandidateUrl,
  legistarClientGuesses,
  normalizeCityUrl,
  overRunCap,
  previewOf,
  stripTags,
  titleFromUrl,
  candidateScore,
} from "./discover";
import { canonicalName, mergeDrafts, mergeRunDrafts, type DraftInput } from "./draftTypes";
import { csvToDrafts, parseCsv } from "./csv";

describe("normalizeCityUrl", () => {
  it("takes a bare domain", () => {
    expect(normalizeCityUrl("dublin.ca.gov")).toEqual({
      domain: "dublin.ca.gov",
      slug: "dublin-ca",
      name: "Dublin, CA",
      websiteUrl: "https://dublin.ca.gov",
    });
  });
  it("drops www and keeps the origin the page was pasted from", () => {
    expect(normalizeCityUrl("https://www.dublin.ca.gov/74")).toEqual({
      domain: "dublin.ca.gov",
      slug: "dublin-ca",
      name: "Dublin, CA",
      websiteUrl: "https://www.dublin.ca.gov",
    });
  });
  it("handles a two label org domain", () => {
    const ref = normalizeCityUrl("http://a2gov.org/departments");
    expect(ref.domain).toBe("a2gov.org");
    expect(ref.slug).toBe("a2gov");
  });
  it("rejects empty and hostless input", () => {
    expect(() => normalizeCityUrl("   ")).toThrow();
    expect(() => normalizeCityUrl("localhost")).toThrow();
  });
});

describe("legistarClientGuesses", () => {
  it("guesses a2gov for a2gov.org", () => {
    expect(legistarClientGuesses("a2gov.org")).toEqual(["a2gov"]);
  });
  it("tries the first label and the second level label", () => {
    expect(legistarClientGuesses("dublin.ca.gov")).toEqual(["dublin", "ca"]);
  });
  it("ignores a www prefix", () => {
    expect(legistarClientGuesses("www.palmspringsca.gov")).toEqual(["palmspringsca"]);
  });
});

describe("candidate URLs", () => {
  it("keeps board, commission and roster paths and drops the rest", () => {
    expect(isCandidateUrl("https://dublin.ca.gov/74/Boards-Commissions")).toBe(true);
    expect(isCandidateUrl("https://dublin.ca.gov/DocumentCenter/View/36214/Maddy-Act")).toBe(true);
    expect(isCandidateUrl("https://dublin.ca.gov/files/roster.pdf")).toBe(true);
    expect(isCandidateUrl("https://dublin.ca.gov/parks/pool-hours")).toBe(false);
  });
  it("needs a keyword in the path or the title for a PDF, and drops known junk", () => {
    expect(isCandidateUrl("https://x.gov/DocumentCenter/View/1/file.pdf")).toBe(false);
    expect(isCandidateUrl("https://x.gov/DocumentCenter/View/1/file.pdf", "[PDF] NOTICE OF COMMISSION VACANCIES")).toBe(true);
    expect(isCandidateUrl("https://x.gov/DocumentCenter/View/2/file.pdf", "[PDF] STANDARD SPECIFICATIONS AND DETAILS")).toBe(false);
    expect(isCandidateUrl("https://x.gov/committee/budget-2026.pdf")).toBe(false);
    expect(isCandidateUrl("https://x.gov/boards/agenda.pdf")).toBe(false);
  });
  it("ranks path matches ahead of title-only matches before capping", () => {
    const links = [
      { url: "https://x.gov/DocumentCenter/View/9/a.pdf", title: "[PDF] volunteer for a city commission" },
      { url: "https://x.gov/boards-commissions" },
      { url: "https://x.gov/DocumentCenter/View/8/b.pdf", title: "[PDF] local appointments list" },
    ];
    expect(filterCandidateUrls(links, 2).map((l) => l.url)).toEqual([
      "https://x.gov/boards-commissions",
      "https://x.gov/DocumentCenter/View/9/a.pdf",
    ]);
  });
  it("dedupes, skips relative links and caps the list", () => {
    const links = [
      { url: "https://x.gov/boards" },
      { url: "https://x.gov/boards/" },
      { url: "/boards" },
      { url: "https://x.gov/committee#top" },
      { url: "https://x.gov/committee" },
    ];
    expect(filterCandidateUrls(links).map((l) => l.url)).toEqual([
      "https://x.gov/boards",
      "https://x.gov/committee#top",
    ]);
  });
  it("stops at the cap", () => {
    const links = Array.from({ length: 60 }, (_, i) => ({ url: `https://x.gov/boards/${i}` }));
    expect(filterCandidateUrls(links)).toHaveLength(40);
    expect(filterCandidateUrls(links, 3)).toHaveLength(3);
  });
});

describe("canonicalName and the rules merge", () => {
  it("collapses case, ampersands and punctuation", () => {
    expect(canonicalName("Heritage & Cultural Arts Commission")).toBe("heritage and cultural arts commission");
    expect(canonicalName("Tri-Valley Accessible Advisory Committee (TAAC)")).toBe("tri valley accessible advisory committee");
    expect(canonicalName("Planning  Commission.")).toBe("planning commission");
  });

  const roster: DraftInput = {
    name: "Planning Commission",
    meetingCadence: "2nd and 4th Tuesday",
    termLength: null,
    termLimit: null,
    seatCount: null,
    members: [
      { name: "Wahida Rashid", role: null, appointed: "8/24", termEnd: "12/26", snippet: "Wahida 12/26", confidence: "grounded" },
    ],
    snippet: "roster snippet",
    sourceUrl: "https://dublin.ca.gov/maddy.pdf",
  };
  const rules: DraftInput = {
    name: "planning commission",
    meetingCadence: null,
    termLength: "generally four years",
    termLimit: "two terms",
    seatCount: 7,
    members: [],
    snippet: "rules snippet",
    sourceUrl: "https://dublin.ca.gov/74",
  };

  it("folds rules page values into the roster draft and keeps the roster members", () => {
    const merged = mergeDrafts(roster, rules);
    expect(merged.termLength).toBe("generally four years");
    expect(merged.termLimit).toBe("two terms");
    expect(merged.seatCount).toBe(7);
    expect(merged.meetingCadence).toBe("2nd and 4th Tuesday");
    expect(merged.members).toHaveLength(1);
    expect(merged.sourceUrl).toBe("https://dublin.ca.gov/maddy.pdf");
  });

  it("merges in either order", () => {
    const merged = mergeDrafts(rules, roster);
    expect(merged.members).toHaveLength(1);
    expect(merged.termLength).toBe("generally four years");
    expect(merged.name).toBe("Planning Commission");
  });

  it("merges a whole run by canonical name and leaves unmatched drafts alone", () => {
    const other: DraftInput = { ...rules, name: "Senior Center Advisory Committee" };
    const merged = mergeRunDrafts([roster, rules, other]);
    expect(merged).toHaveLength(2);
    expect(merged[0].termLimit).toBe("two terms");
    expect(merged[1].name).toBe("Senior Center Advisory Committee");
  });
});

describe("parseCsv", () => {
  it("reads quoted fields, embedded commas, doubled quotes and CRLF", () => {
    const rows = parseCsv('body,member\r\n"Planning, Commission","Ada ""A"" Lovelace"\r\n');
    expect(rows).toEqual([
      ["body", "member"],
      ["Planning, Commission", 'Ada "A" Lovelace'],
    ]);
  });
  it("drops blank lines", () => {
    expect(parseCsv("a,b\n\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("csvToDrafts", () => {
  const csv = [
    "body,member,role,appointed,term_end,source_url",
    "Planning Commission,Ada Lovelace,Chair,1/24,12/26,https://x.gov/pc",
    "Planning Commission,Bo Diddley,,,12/28,https://x.gov/pc",
    "Parks Commission,Cy Young,,,,",
  ].join("\n");

  it("groups rows into one draft per body", () => {
    const drafts = csvToDrafts(csv, "https://x.gov");
    expect(drafts).toHaveLength(2);
    expect(drafts[0].name).toBe("Planning Commission");
    expect(drafts[0].members.map((m) => m.name)).toEqual(["Ada Lovelace", "Bo Diddley"]);
    expect(drafts[0].members[0].role).toBe("Chair");
    expect(drafts[0].members[1].role).toBeNull();
    expect(drafts[0].sourceUrl).toBe("https://x.gov/pc");
  });
  it("falls back to the city URL when source_url is blank", () => {
    expect(csvToDrafts(csv, "https://x.gov")[1].sourceUrl).toBe("https://x.gov");
  });
  it("refuses a CSV without the required columns", () => {
    expect(() => csvToDrafts("name,term\nA,1", "https://x.gov")).toThrow(/columns/);
  });
});

describe("overRunCap", () => {
  const now = Date.UTC(2026, 8, 11, 12);
  const day = 86_400_000;
  it("counts only runs inside the 24h window", () => {
    const old = Array.from({ length: 40 }, () => now - 2 * day);
    expect(overRunCap(old, now)).toBe(false);
  });
  it("refuses at 200 runs in the window and allows 199", () => {
    const recent = Array.from({ length: 199 }, (_, i) => now - i * 60_000);
    expect(overRunCap(recent, now)).toBe(false);
    expect(overRunCap([...recent, now - 1000], now)).toBe(true);
  });
  it("takes a smaller per-city cap", () => {
    const recent = [now - 1000, now - 2000, now - 3000];
    expect(overRunCap(recent.slice(0, 2), now, 3)).toBe(false);
    expect(overRunCap(recent, now, 3)).toBe(true);
  });
});

describe("text helpers", () => {
  it("strips tags and entities down to readable text", () => {
    expect(stripTags("<h1>Boards &amp; Commissions</h1><script>x=1</script><p>Terms</p>")).toBe(
      "Boards & Commissions Terms",
    );
  });
  it("caps the preview at 500 characters", () => {
    expect(previewOf("a".repeat(900))).toHaveLength(500);
  });
  it("names a document from its URL", () => {
    expect(titleFromUrl("https://dublin.ca.gov/DocumentCenter/View/36214/Maddy-Act-2024")).toBe("Maddy Act 2024");
  });
});

describe("candidateScore word starts", () => {
  it("scores boards-commissions paths and headings", () => {
    expect(candidateScore("https://x.gov/boards-commissions")).toBe(2);
    expect(candidateScore("https://x.gov/news/1", "Meet the Members of the Boards and Commissions")).toBe(1);
  });

  it("ignores words that merely end in a keyword", () => {
    expect(candidateScore("https://x.gov/blog/e-glide-powerboards")).toBe(0);
    expect(candidateScore("https://x.gov/blog/1", "Kiwanis donates new scoreboards at Belmar park")).toBe(0);
  });
});
