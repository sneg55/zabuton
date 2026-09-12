import { describe, expect, it } from "vitest";
import bodiesFixture from "./fixtures/legistarBodies.json";
import officeRecordsFixture from "./fixtures/legistarOfficeRecords.json";
import {
  bodiesUrl,
  bodyToDraft,
  legistarRefFromUrl,
  officeRecordsToPublished,
  officeRecordsUrl,
  officeRecordSnippet,
  oneYearAgoIso,
  selectBodies,
  type LegistarBody,
  type LegistarOfficeRecord,
} from "./legistar";

const bodies = bodiesFixture as LegistarBody[];
const records = officeRecordsFixture as LegistarOfficeRecord[];

describe("selectBodies", () => {
  it("keeps active bodies whose name reads like a board", () => {
    expect(selectBodies(bodies).map((b) => b.BodyName)).toEqual([
      "City Council",
      "City Planning Commission",
      "Zoning Board of Appeals",
    ]);
  });
  it("drops inactive bodies even when the name matches", () => {
    expect(selectBodies(bodies).some((b) => b.BodyName === "Canvassers, Board of")).toBe(false);
  });
});

describe("Legistar URLs", () => {
  it("builds the Bodies URL for a client", () => {
    expect(bodiesUrl("a2gov")).toBe("https://webapi.legistar.com/v1/a2gov/Bodies");
  });
  it("round trips the OfficeRecords URL through the reference parser", () => {
    const url = officeRecordsUrl("a2gov", 153, "2025-09-11");
    expect(legistarRefFromUrl(url)).toEqual({ client: "a2gov", bodyId: 153, sinceIso: "2025-09-11" });
  });
  it("returns null for a city page", () => {
    expect(legistarRefFromUrl("https://dublin.ca.gov/74")).toBeNull();
  });
  it("takes today minus one year as the office record window", () => {
    expect(oneYearAgoIso(Date.UTC(2026, 8, 11, 12))).toBe("2025-09-11");
  });
});

describe("bodyToDraft", () => {
  const planning = bodies.find((b) => b.BodyName === "City Planning Commission")!;
  const sourceUrl = officeRecordsUrl("a2gov", planning.BodyId, "2025-09-11");

  it("turns the Ann Arbor planning commission office records into one draft", () => {
    const draft = bodyToDraft(planning, records, sourceUrl)!;
    expect(draft.name).toBe("City Planning Commission");
    expect(draft.members).toHaveLength(10);
    expect(draft.sourceUrl).toBe(sourceUrl);
    expect(draft.members.every((m) => m.confidence === "grounded")).toBe(true);
  });

  it("keeps the ISO dates Legistar states and never guesses the rest", () => {
    const draft = bodyToDraft(planning, records, sourceUrl)!;
    const sarah = draft.members.find((m) => m.name === "Sarah Mills")!;
    expect(sarah.appointed).toBe("2012-01-01");
    expect(sarah.termEnd).toBe("2027-06-30");
    expect(draft.termLength).toBeNull();
    expect(draft.termLimit).toBeNull();
    expect(draft.meetingCadence).toBeNull();
  });

  it("renders the snippet as name, title and the date range", () => {
    expect(officeRecordSnippet(records[0])).toBe("Sarah Mills | Member | 2012-01-01 -> 2027-06-30");
  });

  it("carries the stated seat count", () => {
    expect(bodyToDraft(planning, records, sourceUrl)!.seatCount).toBe(planning.BodyNumberOfMembers);
  });

  it("skips a body with no office records in the window", () => {
    expect(bodyToDraft(planning, [], sourceUrl)).toBeNull();
  });

  it("skips records with no person on them", () => {
    const blank: LegistarOfficeRecord = { OfficeRecordFullName: "", OfficeRecordEndDate: "2027-06-30T00:00:00" };
    expect(bodyToDraft(planning, [...records, blank], sourceUrl)!.members).toHaveLength(10);
  });
});

describe("officeRecordsToPublished", () => {
  it("gives the drift diff names and ISO term ends", () => {
    const published = officeRecordsToPublished(records);
    expect(published).toHaveLength(10);
    expect(published[0]).toEqual({
      name: "Sarah Mills",
      termEnd: "2027-06-30",
      snippet: "Sarah Mills | Member | 2012-01-01 -> 2027-06-30",
    });
  });
});

describe("open-ended Legistar terms", () => {
  it("treats the 9999 sentinel as no end date", () => {
    const record = { OfficeRecordFullName: "Jan Godek", OfficeRecordTitle: "Lodi Township Rep.", OfficeRecordStartDate: "2017-10-09T00:00:00", OfficeRecordEndDate: "9999-12-31T00:00:00" } as Parameters<typeof officeRecordSnippet>[0];
    expect(officeRecordSnippet(record)).toBe("Jan Godek | Lodi Township Rep. | 2017-10-09 -> open-ended");
  });
});
