import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvWithHeader } from "./csv.js";

describe("csv", () => {
  it("parses simple rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles quoted fields with commas and escaped quotes", () => {
    expect(parseCsv('"Doe, John","say ""hi"""')).toEqual([['Doe, John', 'say "hi"']]);
  });

  it("maps a header row to objects (lower-cased keys)", () => {
    const rows = parseCsvWithHeader("Address,Display Name,Password,Quota\njohn@x.com,John,secret123,1073741824");
    expect(rows[0]).toEqual({
      address: "john@x.com",
      "display name": "John",
      password: "secret123",
      quota: "1073741824",
    });
  });

  it("ignores blank lines", () => {
    expect(parseCsv("a\n\n\nb")).toEqual([["a"], ["b"]]);
  });
});
