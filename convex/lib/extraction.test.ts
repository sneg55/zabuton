import { describe, expect, it } from "vitest";
import dublinRoster from "../seed/dublinRoster.json";
import dublinRules from "../seed/dublinRules.json";
import smRosterSchema from "../fixtures/smRosterSchema.json";
import smVacancies from "../fixtures/smVacancies.json";
import {
  CLASSIFY_SCHEMA,
  ROSTER_SCHEMA,
  classificationOf,
  draftsFor,
  looksLikePdf,
  parseResponsesOutput,
  rosterToDrafts,
  rulesToDrafts,
  schemaFor,
  toBase64,
  vacancyToDrafts,
} from "./extraction";
import { mergeRunDrafts } from "./draftTypes";

const ROSTER_URL = "https://dublin.ca.gov/DocumentCenter/View/36214/Maddy-Act";
const RULES_URL = "https://www.dublin.ca.gov/74";
const SM_URL = "https://santamonica.gov/uploadedFiles/sm_2026_appts.pdf";

describe("parseResponsesOutput", () => {
  it("reads the JSON out of a Responses API envelope", () => {
    const payload = {
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: '{"bodies":[]}' }] },
      ],
    };
    expect(parseResponsesOutput(payload)).toEqual({ bodies: [] });
  });
  it("complains rather than returning something empty", () => {
    expect(() => parseResponsesOutput({})).toThrow(/no output/);
    expect(() => parseResponsesOutput({ output: [{ type: "reasoning" }] })).toThrow(/output_text/);
  });
});

describe("classificationOf", () => {
  it("takes the label the model returned", () => {
    expect(classificationOf({ kind: "vacancy_notice", reason: "seats and dates, no names" })).toBe("vacancy_notice");
  });
  it("falls back to other for anything unrecognised", () => {
    expect(classificationOf({ kind: "invoice" })).toBe("other");
    expect(classificationOf({})).toBe("other");
  });
  it("offers no extraction schema for other", () => {
    expect(schemaFor("other")).toBeNull();
    expect(schemaFor("roster")?.schema).toBe(ROSTER_SCHEMA);
    expect(CLASSIFY_SCHEMA.required).toContain("kind");
  });
});

describe("rosterToDrafts on the Dublin Maddy Act output", () => {
  const drafts = rosterToDrafts(dublinRoster, ROSTER_URL);

  it("makes one draft per body with the members and their provenance", () => {
    expect(drafts).toHaveLength(7);
    const planning = drafts.find((d) => d.name === "Planning Commission")!;
    expect(planning.members).toHaveLength(7);
    expect(planning.members[0].termEnd).toBe("12/26");
    expect(planning.members[0].appointed).toBe("8/24");
    expect(planning.members[0].snippet).toContain("12/26");
    expect(planning.sourceUrl).toBe(ROSTER_URL);
  });

  it("keeps a field the PDF does not state as null", () => {
    const planning = drafts.find((d) => d.name === "Planning Commission")!;
    expect(planning.termLength).toBeNull();
    expect(planning.termLimit).toBeNull();
    expect(planning.seatCount).toBeNull();
  });

  it("counts 54 members across the seven bodies", () => {
    expect(drafts.reduce((total, d) => total + d.members.length, 0)).toBe(54);
  });
});

describe("rulesToDrafts on the Dublin rules page", () => {
  const drafts = rulesToDrafts(dublinRules, RULES_URL);

  it("returns term rules and no members", () => {
    expect(drafts.length).toBeGreaterThan(0);
    expect(drafts.every((d) => d.members.length === 0)).toBe(true);
    expect(drafts[0].termLength).toBe("generally four years");
    expect(drafts[0].termLimit).toBe("two terms");
    expect(drafts[0].seatCount).toBeNull();
  });

  it("merges into the roster draft of the same body within one run", () => {
    const merged = mergeRunDrafts([...rosterToDrafts(dublinRoster, ROSTER_URL), ...drafts]);
    const planning = merged.find((d) => d.name === "Planning Commission")!;
    expect(planning.members).toHaveLength(7);
    expect(planning.termLength).toBe("generally four years");
    expect(planning.termLimit).toBe("two terms");
    expect(planning.sourceUrl).toBe(ROSTER_URL);
  });

  it("merges Heritage & Cultural Arts across the ampersand spelling", () => {
    const merged = mergeRunDrafts([...rosterToDrafts(dublinRoster, ROSTER_URL), ...drafts]);
    const heritage = merged.filter((d) => d.name.toLowerCase().includes("heritage"));
    expect(heritage).toHaveLength(1);
    expect(heritage[0].termLength).toBe("generally four years");
  });
});

describe("vacancyToDrafts on the Santa Monica notice", () => {
  const drafts = vacancyToDrafts(smVacancies, SM_URL);

  it("gives seat counts and no members", () => {
    expect(drafts).toHaveLength(4);
    const airport = drafts.find((d) => d.name === "Airport Commission")!;
    expect(airport.seatCount).toBe(1);
    expect(airport.members).toEqual([]);
  });

  it("puts the count and the term end dates in the snippet", () => {
    const review = drafts.find((d) => d.name === "Architectural Review Board")!;
    expect(review.snippet).toContain("2 seats open");
    expect(review.snippet).toContain("terms end 6/30/2030");
  });

  it("is why the classification step exists: the roster schema invents nothing usable here", () => {
    const wrong = rosterToDrafts(smRosterSchema, SM_URL);
    expect(wrong.every((d) => d.members.length === 0)).toBe(true);
  });
});

describe("draftsFor", () => {
  it("routes each label to its own shape and drops other", () => {
    expect(draftsFor("roster", dublinRoster, ROSTER_URL)).toHaveLength(7);
    expect(draftsFor("vacancy_notice", smVacancies, SM_URL)).toHaveLength(4);
    expect(draftsFor("rules_page", dublinRules, RULES_URL).length).toBeGreaterThan(0);
    expect(draftsFor("other", dublinRoster, ROSTER_URL)).toEqual([]);
  });
});

describe("looksLikePdf", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
  const htmlBytes = new TextEncoder().encode("<html>");

  it("takes the content type when the server states it", () => {
    expect(looksLikePdf("https://x.gov/doc", "application/pdf", htmlBytes)).toBe(true);
  });
  it("takes a .pdf path when the server sends octet-stream", () => {
    expect(looksLikePdf("https://x.gov/DocumentCenter/roster.pdf?v=2", "application/octet-stream", htmlBytes)).toBe(true);
  });
  it("takes the magic bytes when neither says so", () => {
    expect(looksLikePdf("https://x.gov/DocumentCenter/View/36214", "application/octet-stream", pdfBytes)).toBe(true);
  });
  it("leaves an HTML page as text", () => {
    expect(looksLikePdf("https://x.gov/74", "text/html", htmlBytes)).toBe(false);
  });
});

describe("toBase64", () => {
  it("encodes bytes the way a PDF data URI needs", () => {
    expect(toBase64(new Uint8Array([37, 80, 68, 70]))).toBe("JVBERg==");
  });
  it("handles a payload larger than one chunk", () => {
    const bytes = new Uint8Array(100_000).fill(65);
    expect(toBase64(bytes)).toBe(btoa("A".repeat(100_000)));
  });
});
