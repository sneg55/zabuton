import { describe, expect, it } from "vitest";
import { normalizeTermEnd } from "./termDates";

const endOfDay = (y: number, m: number, d: number) => Date.UTC(y, m, d, 23, 59, 59);

describe("normalizeTermEnd", () => {
  it("maps MM/YY to the last day of that month", () => {
    expect(normalizeTermEnd("12/26")).toBe(endOfDay(2026, 11, 31));
    expect(normalizeTermEnd("5/26")).toBe(endOfDay(2026, 4, 31));
    expect(normalizeTermEnd("1/28")).toBe(endOfDay(2028, 0, 31));
    expect(normalizeTermEnd("2/28")).toBe(endOfDay(2028, 1, 29));
  });
  it("maps M/D/YYYY to that day", () => {
    expect(normalizeTermEnd("6/30/2030")).toBe(endOfDay(2030, 5, 30));
  });
  it("maps ISO dates to that day", () => {
    expect(normalizeTermEnd("2027-06-30")).toBe(endOfDay(2027, 5, 30));
    expect(normalizeTermEnd("2026-04-06T00:00:00")).toBe(endOfDay(2026, 3, 6));
  });
  it("maps month names to the last day of the month or the stated day", () => {
    expect(normalizeTermEnd("December 2026")).toBe(endOfDay(2026, 11, 31));
    expect(normalizeTermEnd("Dec 2028")).toBe(endOfDay(2028, 11, 31));
    expect(normalizeTermEnd("June 30, 2030")).toBe(endOfDay(2030, 5, 30));
    expect(normalizeTermEnd("Sept. 2027")).toBe(endOfDay(2027, 8, 30));
  });
  it("takes the end of a stated range", () => {
    expect(normalizeTermEnd("June 2026 - May 2027")).toBe(endOfDay(2027, 4, 31));
    expect(normalizeTermEnd("Term expires June 2022")).toBeNull();
  });
  it("returns null for null, empty and prose", () => {
    expect(normalizeTermEnd(null)).toBeNull();
    expect(normalizeTermEnd("")).toBeNull();
    expect(normalizeTermEnd("December")).toBeNull();
    expect(normalizeTermEnd("13/26")).toBeNull();
  });
});
