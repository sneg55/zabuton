import { describe, expect, it } from "vitest";
import { DEFAULT_EXPIRING_DAYS, seatStatus } from "./seatStatus";

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 11, 12, 0, 0);

describe("seatStatus", () => {
  it("is vacant with no term end", () => {
    expect(seatStatus(null, now, DEFAULT_EXPIRING_DAYS)).toBe("vacant");
  });
  it("is expired once the end has passed", () => {
    expect(seatStatus(now - 1, now, DEFAULT_EXPIRING_DAYS)).toBe("expired");
  });
  it("is expiring inside the threshold, inclusive at the boundary", () => {
    expect(seatStatus(now + 30 * DAY, now, DEFAULT_EXPIRING_DAYS)).toBe("expiring");
    expect(seatStatus(now + DEFAULT_EXPIRING_DAYS * DAY, now, DEFAULT_EXPIRING_DAYS)).toBe("expiring");
  });
  it("is active beyond the threshold", () => {
    expect(seatStatus(now + DEFAULT_EXPIRING_DAYS * DAY + 1, now, DEFAULT_EXPIRING_DAYS)).toBe("active");
  });
  it("defaults to 120 days", () => {
    expect(DEFAULT_EXPIRING_DAYS).toBe(120);
  });
});
