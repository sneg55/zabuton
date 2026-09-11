import { describe, expect, it } from "vitest";
import { draftEvidence, isGenericBodyName } from "./draftTypes";

describe("isGenericBodyName", () => {
  it("rejects placeholders and page titles that are not bodies", () => {
    for (const n of ["Boards", "Commissions", "Authorities", "Committee/Board/Commission", "board, commission or advisory committee", "ad hoc committee", "City Boards and Commissions", "City of Riverside Storefront Retail Cannabis Merit-Based Evaluation Criteria", "Riverside Neighborhood Partnership board membership opportunities", "Development", "Finance"]) {
      expect(isGenericBodyName(n), n).toBe(true);
    }
  });
  it("keeps real bodies", () => {
    for (const n of ["Planning Commission", "Board of Public Utilities", "Youth Advisory Committee", "Commission on Aging", "Cultural Heritage Board", "March Air Reserve Base Joint Powers Commission", "Community Task Force on Equity, Diversity, and Inclusion"]) {
      expect(isGenericBodyName(n), n).toBe(false);
    }
  });
});

describe("draftEvidence", () => {
  it("ranks drafts by what the document actually stated", () => {
    expect(draftEvidence({ members: [{ termEnd: "12/26" }], seatCount: null, termLength: null, termLimit: null })).toBe("members_dated");
    expect(draftEvidence({ members: [{ termEnd: null }], seatCount: null, termLength: null, termLimit: null })).toBe("members");
    expect(draftEvidence({ members: [], seatCount: 5, termLength: null, termLimit: null })).toBe("seats");
    expect(draftEvidence({ members: [], seatCount: null, termLength: "four years", termLimit: null })).toBe("rules");
  });
});
