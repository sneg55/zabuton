import { describe, expect, it } from "vitest";
import { DEFAULT_EXPIRING_DAYS, isVacancyName, seatStatus } from "./seatStatus";

const DAY = 86_400_000;
const now = Date.UTC(2026, 8, 11, 12, 0, 0);

describe("seatStatus", () => {
  it("is active with a holder whose term end is unknown", () => {
    expect(seatStatus(null, now, DEFAULT_EXPIRING_DAYS)).toBe("active");
  });
  it("is vacant only when the city said so", () => {
    expect(seatStatus(null, now, DEFAULT_EXPIRING_DAYS, "vacant")).toBe("vacant");
    expect(seatStatus(now + DAY, now, DEFAULT_EXPIRING_DAYS, "vacant")).toBe("vacant");
  });
  it("is unlisted when the seat exists only as a count", () => {
    expect(seatStatus(null, now, DEFAULT_EXPIRING_DAYS, "unlisted")).toBe("unlisted");
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

describe("isVacancyName", () => {
  it("recognises the placeholders cities put in a member column", () => {
    for (const name of ["Vacant", "VACANT", "vacancy", "Open seat", "TBD", "To be appointed", "-", "n/a"]) {
      expect(isVacancyName(name)).toBe(true);
    }
  });
  it("leaves real names alone", () => {
    expect(isVacancyName("Vacant Lot Committee Chair")).toBe(false);
    expect(isVacancyName("Ada Lovelace")).toBe(false);
  });
});

describe("isVacancyName", () => {
  it("accepts a vacancy label with a trailing note", () => {
    expect(isVacancyName("Vacant (December 2026)")).toBe(true);
    expect(isVacancyName("Vacant")).toBe(true);
    expect(isVacancyName("Victoria Liu")).toBe(false);
  });
});
