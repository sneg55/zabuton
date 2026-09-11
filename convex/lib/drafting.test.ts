import { describe, expect, it } from "vitest";
import {
  acknowledgementSubject,
  acknowledgementText,
  addYears,
  applicationReplyPrompt,
  applicationReplyTemplate,
  extractResponseText,
  isoDate,
  noticePrompt,
  noticeTemplate,
  parseTermYears,
  sanitizeDraft,
  termEndFrom,
  type ApplicationContext,
  type NoticeContext,
} from "./drafting";

const application: ApplicationContext = {
  cityName: "Dublin",
  bodyName: "Planning Commission",
  seatLabel: "Seat 3",
  applicantName: "Ada Reyes",
  statement: "I have chaired the neighborhood association for six years.",
  termLength: "four years",
  meetingCadence: "second and fourth Tuesdays",
};

const notice: NoticeContext = {
  cityName: "Dublin",
  bodyName: "Planning Commission",
  seatLabel: "Seat 3",
  memberName: "Bo Ito",
  termEnd: "2026-12-31",
  termLength: "four years",
  meetingCadence: "second and fourth Tuesdays",
  kind: "term_expiry",
};

describe("parseTermYears", () => {
  it("reads digits and the spelled out numbers", () => {
    expect(parseTermYears("4 year term")).toBe(4);
    expect(parseTermYears("generally four years")).toBe(4);
    expect(parseTermYears("Three-year terms")).toBe(3);
    expect(parseTermYears("two  years, staggered")).toBe(2);
  });
  it("returns null when no term length is stated", () => {
    expect(parseTermYears(null)).toBeNull();
    expect(parseTermYears(undefined)).toBeNull();
    expect(parseTermYears("at the pleasure of the council")).toBeNull();
    expect(parseTermYears("eighteen months")).toBeNull();
  });
  it("rejects implausible year counts", () => {
    expect(parseTermYears("99 years")).toBeNull();
  });
});

describe("term math", () => {
  const start = Date.UTC(2026, 8, 11, 12, 0, 0);
  it("adds whole years in UTC", () => {
    expect(new Date(addYears(start, 4)).toISOString()).toBe("2030-09-11T12:00:00.000Z");
  });
  it("derives an end only when the body states a year count", () => {
    expect(termEndFrom(start, "four years")).toBe(Date.UTC(2030, 8, 11, 12, 0, 0));
    expect(termEndFrom(start, "at the pleasure of the council")).toBeUndefined();
    expect(termEndFrom(start, null)).toBeUndefined();
  });
  it("formats an ISO date for the term snippet", () => {
    expect(isoDate(start)).toBe("2026-09-11");
  });
});

describe("sanitizeDraft", () => {
  it("replaces em dashes and spaced en dashes with a comma", () => {
    expect(sanitizeDraft("Your term ends soon — please reply.")).toBe("Your term ends soon, please reply.");
    expect(sanitizeDraft("The seat—yours—is open.")).toBe("The seat, yours, is open.");
    expect(sanitizeDraft("Reply soon – we post openings weekly.")).toBe("Reply soon, we post openings weekly.");
  });
  it("keeps hyphenated words and date ranges", () => {
    expect(sanitizeDraft("A four-year term, 2026-2030.")).toBe("A four-year term, 2026-2030.");
  });
  it("collapses trailing space and runs of blank lines", () => {
    expect(sanitizeDraft("A  \n\n\n\nB\n")).toBe("A\n\nB");
  });
});

describe("application templates", () => {
  it("acknowledges by name, body and seat", () => {
    const text = acknowledgementText(application);
    expect(text).toContain("Dear Ada Reyes,");
    expect(text).toContain("Seat 3 seat on the Planning Commission");
    expect(text).toContain("Dublin");
    expect(text).not.toMatch(/[—–]/);
    expect(acknowledgementSubject(application)).toBe("Your application to Planning Commission");
  });
  it("names the body when no seat was chosen", () => {
    const pool = { ...application, seatLabel: null };
    expect(acknowledgementText(pool)).toContain("the Planning Commission");
  });
  it("writes a distinct fallback per state", () => {
    expect(applicationReplyTemplate(application, "under_review")).toContain("now under review");
    expect(applicationReplyTemplate(application, "interviewed")).toContain("Thank you for your interview");
    expect(applicationReplyTemplate(application, "declined")).toContain("filled by another applicant");
    const appointed = applicationReplyTemplate(application, "appointed");
    expect(appointed).toContain("You have been appointed");
    expect(appointed).toContain("four years");
    expect(appointed).toContain("second and fourth Tuesdays");
  });
  it("omits term detail the city has not published", () => {
    const bare = { ...application, termLength: null, meetingCadence: null };
    const appointed = applicationReplyTemplate(bare, "appointed");
    expect(appointed).not.toContain("The term for this seat runs");
    expect(appointed).not.toContain("meets");
  });
  it("carries the statement and state into the prompt", () => {
    const prompt = applicationReplyPrompt(application, "appointed");
    expect(prompt).toContain("New application state: appointed");
    expect(prompt).toContain("neighborhood association");
  });
});

describe("notice templates", () => {
  it("drafts a term expiry notice with the tracked end date", () => {
    const draft = noticeTemplate(notice);
    expect(draft.subject).toBe("Your term on the Planning Commission, Seat 3 is ending");
    expect(draft.body).toContain("Dear Bo Ito,");
    expect(draft.body).toContain("ends on 2026-12-31");
    expect(draft.body).toContain("posted as an opening");
    expect(draft.body).not.toMatch(/[—–]/);
  });
  it("drafts a reappointment notice", () => {
    const draft = noticeTemplate({ ...notice, kind: "reappointment" });
    expect(draft.subject).toBe("Reappointment to the Planning Commission, Seat 3");
    expect(draft.body).toContain("preparing a reappointment");
  });
  it("degrades when the term end is unknown", () => {
    const draft = noticeTemplate({ ...notice, termEnd: null });
    expect(draft.body).toContain("is ending");
    expect(draft.body).not.toContain("ends on");
  });
  it("states the notice kind in the prompt", () => {
    expect(noticePrompt(notice)).toContain("Notice kind: term_expiry");
    expect(noticePrompt({ ...notice, kind: "reappointment" })).toContain("willingness to serve");
  });
});

describe("extractResponseText", () => {
  it("prefers output_text", () => {
    expect(extractResponseText({ output_text: "Dear Ada," })).toBe("Dear Ada,");
  });
  it("falls back to the output message content", () => {
    const payload = {
      output: [
        { type: "reasoning", summary: [] },
        { type: "message", content: [{ type: "output_text", text: "Dear Ada," }] },
      ],
    };
    expect(extractResponseText(payload)).toBe("Dear Ada,");
  });
  it("returns null for an empty or unexpected payload", () => {
    expect(extractResponseText({})).toBeNull();
    expect(extractResponseText({ output_text: "   " })).toBeNull();
    expect(extractResponseText(null)).toBeNull();
    expect(extractResponseText({ output: [{ type: "message", content: [] }] })).toBeNull();
  });
});
