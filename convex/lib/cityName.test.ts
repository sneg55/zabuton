import { describe, expect, it } from "vitest";
import { cityNameFromTitle, titleOfHtml } from "./cityName";

describe("cityNameFromTitle", () => {
  it("picks the civic segment of a homepage title", () => {
    expect(cityNameFromTitle("City of Ann Arbor, MI | Home")).toBe("City of Ann Arbor, MI");
    expect(cityNameFromTitle("Home - City of Riverside")).toBe("City of Riverside");
    expect(cityNameFromTitle("Dublin, CA - Official Website | Official Website")).toBe("Dublin, CA");
    expect(cityNameFromTitle("Welcome to the City of Palm Springs")).toBe("the City of Palm Springs");
  });
  it("returns null for empty or sentence-like titles", () => {
    expect(cityNameFromTitle(null)).toBeNull();
    expect(cityNameFromTitle("Home")).toBeNull();
    expect(cityNameFromTitle("We are experiencing technical difficulties. Please try again later!")).toBeNull();
  });
});

describe("titleOfHtml", () => {
  it("reads and unescapes the title element", () => {
    expect(titleOfHtml("<html><head><title>\n  Parks &amp; Rec | City of X </title></head></html>")).toBe("Parks & Rec | City of X");
    expect(titleOfHtml("<html><body>no title</body></html>")).toBeNull();
  });
});
