import { describe, expect, it } from "vitest";
import { diffRoster, trackedEndDisplay, type PublishedMember, type TrackedMember } from "./driftDiff";
import { normalizeTermEnd } from "./termDates";

const tracked = (over: Partial<TrackedMember> = {}): TrackedMember => ({
  seatId: "seat1",
  name: "Ada Lovelace",
  endsAt: normalizeTermEnd("12/26"),
  rawEnd: "12/26",
  ...over,
});

const published = (over: Partial<PublishedMember> = {}): PublishedMember => ({
  name: "Ada Lovelace",
  termEnd: "12/26",
  snippet: "Ada Lovelace 12/26",
  ...over,
});

describe("diffRoster", () => {
  it("is quiet when the page and the tracked roster agree", () => {
    expect(diffRoster([published()], [tracked()])).toEqual([]);
  });

  it("ignores a difference in date format that normalizes to the same day", () => {
    expect(diffRoster([published({ termEnd: "12/31/2026" })], [tracked()])).toEqual([]);
  });

  it("flags a member on the page who is not tracked", () => {
    const flags = diffRoster([published(), published({ name: "Bo Diddley", snippet: "Bo 12/28" })], [tracked()]);
    expect(flags).toHaveLength(1);
    expect(flags[0].field).toBe("member_added");
    expect(flags[0].seatId).toBeNull();
    expect(flags[0].published).toContain("Bo Diddley");
    expect(flags[0].snippet).toBe("Bo 12/28");
  });

  it("flags a tracked member who is gone from the page, carrying the seat", () => {
    const flags = diffRoster([], [tracked()]);
    expect(flags).toHaveLength(1);
    expect(flags[0].field).toBe("member_missing");
    expect(flags[0].seatId).toBe("seat1");
    expect(flags[0].tracked).toContain("Ada Lovelace");
  });

  it("flags a changed term end with both sides", () => {
    const flags = diffRoster([published({ termEnd: "12/28" })], [tracked()]);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ field: "term_end", seatId: "seat1", published: "12/28", tracked: "12/26" });
  });

  it("compares against endsAt when the tracked term was edited without touching rawEnd", () => {
    const edited = tracked({ endsAt: normalizeTermEnd("12/29"), rawEnd: "12/26" });
    const flags = diffRoster([published()], [edited]);
    expect(flags).toHaveLength(1);
    expect(flags[0].field).toBe("term_end");
    expect(flags[0].tracked).toBe("2029-12-31");
  });

  it("flags a term end the page no longer states", () => {
    const flags = diffRoster([published({ termEnd: null })], [tracked()]);
    expect(flags[0].published).toBe("unknown");
  });

  it("matches people despite punctuation and case", () => {
    expect(diffRoster([published({ name: "ADA  LOVELACE," })], [tracked()])).toEqual([]);
  });
});

describe("trackedEndDisplay", () => {
  it("shows the document's own string when it still normalizes to the tracked day", () => {
    expect(trackedEndDisplay(tracked())).toBe("12/26");
  });
  it("shows the ISO day when the tracked end was edited away from the raw string", () => {
    expect(trackedEndDisplay(tracked({ endsAt: Date.UTC(2030, 5, 30, 23, 59, 59) }))).toBe("2030-06-30");
  });
  it("says unknown when there is nothing tracked", () => {
    expect(trackedEndDisplay(tracked({ endsAt: null, rawEnd: null }))).toBe("unknown");
  });
});
